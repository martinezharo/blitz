"""Piper, behind HTTP, for Blitz's words said aloud.

The Worker keeps every clip in R2 and only calls this when a word has never
been made. One process is plenty: a lesson asks for a handful of words, and
after the first learner every one of them is already there.

    POST /say   {"text": "...", "voice": {"model": "https://...onnx", ...}}
    GET  /health

The flags are the ones the browser uses (`src/shared/speech/voices.ts`), and so
is the tidying around the word, so a word sounds the same in the app as on the
web.
"""

from __future__ import annotations

import array
import json
import math
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.parse
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = os.environ.get("MODELS_DIR", "/models")
SECRET = os.environ.get("TTS_SECRET", "")
PORT = int(os.environ.get("PORT", "8080"))

# The Worker names the model; nobody else may. A caller-supplied URL here would
# be a server-side request for anything the network can reach, and a way to
# fill the disk with whatever it returns.
ALLOWED_MODELS = "huggingface.co"
ALLOWED_MODELS_PREFIX = "/rhasspy/piper-voices/"

_downloading: dict[str, threading.Lock] = {}
_lock = threading.Lock()


def check_model(url: str) -> str:
    """The model's name, once the URL is one this service is allowed to fetch."""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_MODELS or not parsed.path.startswith(ALLOWED_MODELS_PREFIX):
        raise ValueError("model must be a piper-voices file on huggingface.co")
    name = parsed.path.rsplit("/", 1)[-1]
    if not name.endswith(".onnx") or "/" in name:
        raise ValueError("model must name a .onnx file")
    return name


def model_for(url: str) -> str:
    """The model's file, downloaded once and kept under its own name."""
    name = check_model(url)
    path = os.path.join(MODELS, name)
    if os.path.exists(path):
        return path
    with _lock:
        lock = _downloading.setdefault(name, threading.Lock())
    with lock:
        if os.path.exists(path):
            return path
        tmp = f"{path}.part"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, path)
    return path


def speak(text: str, voice: dict) -> bytes:
    """The word as a WAV, cut and levelled the way the browser does it."""
    model = model_for(voice["model"])
    with tempfile.TemporaryDirectory() as room:
        out = os.path.join(room, "word.wav")
        subprocess.run(
            [
                "piper",
                "--model", model,
                "--length_scale", str(voice.get("lengthScale", 1)),
                "--noise_scale", str(voice.get("noiseScale", 0.667)),
                "--noise_w", str(voice.get("noiseW", 0.8)),
                "--output_file", out,
            ],
            input=text.encode("utf-8"),
            check=True,
            capture_output=True,
        )
        return tidy(out, int(voice.get("sampleRate", 22050)))


def tidy(path: str, sample_rate: int) -> bytes:
    """Cuts the silence the model leaves around a word and brings it to one loudness."""
    with wave.open(path, "rb") as source:
        channels, width, rate = source.getnchannels(), source.getsampwidth(), source.getframerate()
        frames = source.readframes(source.getnframes())
    samples = array.array("h")
    samples.frombytes(frames)
    if not samples:
        return b""
    peak = max(abs(s) for s in samples)
    if peak == 0:
        return b""
    quiet = peak * 0.02
    start = next((i for i, s in enumerate(samples) if abs(s) > quiet), 0)
    end = len(samples) - 1
    while end > start and abs(samples[end]) <= quiet:
        end -= 1
    margin = int(rate * 0.02)
    start = max(0, start - margin)
    end = min(len(samples), end + int(rate * 0.08))
    gain = 0.7 * 32767 / peak
    kept = array.array("h", (max(-32768, min(32767, int(s * gain))) for s in samples[start:end]))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as room:
        trimmed = room.name
    try:
        with wave.open(trimmed, "wb") as target:
            target.setnchannels(channels)
            target.setsampwidth(width)
            target.setframerate(rate)
            target.writeframes(kept.tobytes())
        with open(trimmed, "rb") as done:
            return done.read()
    finally:
        os.unlink(trimmed)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet: one line per word is noise
        pass

    def authorised(self) -> bool:
        # Fail closed. Without a secret there is no way to tell the Worker from
        # anyone else who can reach the port, so nothing is served.
        if not SECRET:
            return False
        return self.headers.get("Authorization") == f"Bearer {SECRET}"

    def do_GET(self):
        if self.path != "/health":
            return self.send_error(404)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_POST(self):
        if self.path != "/say":
            return self.send_error(404)
        if not self.authorised():
            return self.send_error(401)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
            text = str(body.get("text", "")).strip()
            voice = body["voice"]
            if not text or len(text) > 200:
                raise ValueError("text")
            audio = speak(text, voice)
        except Exception as error:  # noqa: BLE001 - any failure is a 500 with a reason
            return self.send_error(500, str(error)[:200])
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)


if __name__ == "__main__":
    shutil.os.makedirs(MODELS, exist_ok=True)
    if not SECRET:
        print("TTS_SECRET is not set: every request will be refused (401).", flush=True)
    print(f"piper for blitz on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
