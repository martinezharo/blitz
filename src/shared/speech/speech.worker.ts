/**
 * Speech, off the main thread: downloads and keeps the voices, turns text into
 * phonemes with eSpeak NG (piper-phonemize) and phonemes into sound with the
 * Piper model (ONNX Runtime, WebAssembly). Messages are in speech.ts.
 */
import * as ort from 'onnxruntime-web/wasm';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import createPiperPhonemize, { type PiperPhonemize } from './phonemizer/piper_phonemize.js';
import phonemizeData from './phonemizer/piper_phonemize.data?url';
import phonemizeWasm from './phonemizer/piper_phonemize.wasm?url';
import type { Language } from '../../domain/word.ts';
import type { FromSpeech, ToSpeech } from './speech.ts';
import { VOICE_CACHE, VOICES } from './voices.ts';

// Threads need a cross-origin isolated page; one is plenty for a word.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: new URL(ortWasm, self.location.href).href };

const post = (message: FromSpeech, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

const sessions = new Map<Language, Promise<ort.InferenceSession>>();

function session(language: Language): Promise<ort.InferenceSession> {
  let pending = sessions.get(language);
  if (!pending) {
    pending = download(language).then((bytes) => ort.InferenceSession.create(bytes));
    sessions.set(language, pending);
    pending.then(
      () => post({ type: 'ready', language }),
      (error: unknown) => {
        // Forgotten, so the next lesson tries again.
        sessions.delete(language);
        console.warn('Voice failed', error);
        post({ type: 'failed', language });
      },
    );
  }
  return pending;
}

/** The model's bytes: from Cache Storage, or downloaded with progress, checked and kept there. */
async function download(language: Language): Promise<Uint8Array> {
  const voice = VOICES[language];
  const cache = await caches.open(VOICE_CACHE);
  const stored = await cache.match(voice.url);
  if (stored) return new Uint8Array(await stored.arrayBuffer());

  post({ type: 'progress', language, loaded: 0, total: voice.bytes });
  const response = await fetch(voice.url);
  if (!response.ok || !response.body) throw new Error(`Voice download failed: ${response.status}`);
  const bytes = new Uint8Array(voice.bytes);
  const reader = response.body.getReader();
  let loaded = 0;
  let reported = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > bytes.length) throw new Error('Voice larger than expected');
    bytes.set(value, loaded);
    loaded += value.length;
    // A message per percent is plenty for a progress ring.
    if (loaded - reported > voice.bytes / 100) {
      reported = loaded;
      post({ type: 'progress', language, loaded, total: voice.bytes });
    }
  }
  if (loaded !== voice.bytes || (await hex(bytes)) !== voice.sha256) throw new Error('Voice does not match its hash');
  await cache.put(voice.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  await forgetOtherVoices(cache);
  return bytes;
}

async function hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Voices the app no longer uses, and caches of an older layout, are dropped so they do not take up room. */
async function forgetOtherVoices(cache: Cache) {
  const wanted = new Set(Object.values(VOICES).map((voice) => voice.url));
  for (const request of await cache.keys()) if (!wanted.has(request.url)) await cache.delete(request);
  for (const name of await caches.keys()) if (name.startsWith('blitz-voices') && name !== VOICE_CACHE) await caches.delete(name);
}

let phonemizer: Promise<{ module: PiperPhonemize; lines: string[] }> | null = null;

function loadPhonemizer() {
  phonemizer ??= (async () => {
    const [wasm, data] = await Promise.all(
      [phonemizeWasm, phonemizeData].map((url) => fetch(url).then((response) => response.arrayBuffer())),
    );
    const lines: string[] = [];
    const module = await createPiperPhonemize({
      wasmBinary: wasm!,
      getPreloadedPackage: () => data!,
      print: (line) => lines.push(line),
      printErr: (line) => console.warn('eSpeak:', line),
    });
    return { module, lines };
  })();
  phonemizer.catch(() => (phonemizer = null));
  return phonemizer;
}

/** The model's input for a text: one phoneme id list, sentences joined. */
async function phonemeIds(language: Language, text: string): Promise<number[]> {
  const { module, lines } = await loadPhonemizer();
  lines.length = 0;
  module.callMain(['-l', VOICES[language].espeak, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  return lines.flatMap((line) => (JSON.parse(line) as { phoneme_ids: number[] }).phoneme_ids);
}

async function synthesise(language: Language, text: string): Promise<Float32Array<ArrayBuffer>> {
  const voice = VOICES[language];
  const [model, ids] = await Promise.all([session(language), phonemeIds(language, text)]);
  if (ids.length === 0) return new Float32Array(0);
  const { output } = await model.run({
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
    scales: new ort.Tensor('float32', Float32Array.of(voice.noiseScale, voice.lengthScale, voice.noiseW), [3]),
  });
  return tidy(output!.data as Float32Array, voice.sampleRate);
}

/**
 * Cuts the silence the model leaves around a word, so it sounds the moment it
 * is picked, and brings every word to the same loudness.
 */
function tidy(samples: Float32Array, sampleRate: number): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return new Float32Array(0);
  const quiet = peak * 0.02;
  let start = samples.findIndex((sample) => Math.abs(sample) > quiet);
  let end = samples.length - 1;
  while (Math.abs(samples[end]!) <= quiet) end--;
  start = Math.max(0, start - Math.round(sampleRate * 0.02));
  end = Math.min(samples.length, end + Math.round(sampleRate * 0.08));
  const gain = 0.7 / peak;
  return Float32Array.from(samples.subarray(start, end), (sample) => sample * gain);
}

/** Words wait their turn, the one someone is waiting to hear first. */
const queue: { id: number; language: Language; text: string }[] = [];
let busy = false;

async function work() {
  if (busy) return;
  busy = true;
  while (queue.length > 0) {
    const { id, language, text } = queue.shift()!;
    try {
      const samples = await synthesise(language, text);
      post({ type: 'audio', id, samples, sampleRate: VOICES[language].sampleRate }, [samples.buffer]);
    } catch (error) {
      console.warn('Speech failed', error);
      post({ type: 'audio', id, samples: null, sampleRate: 0 });
    }
  }
  busy = false;
}

self.onmessage = (event: MessageEvent<ToSpeech>) => {
  const message = event.data;
  if (message.type === 'prepare') {
    void session(message.language).catch(() => {});
    void loadPhonemizer().catch(() => {});
  } else if (message.type === 'say') {
    queue.push(message);
    void work();
  } else if (message.type === 'hurry') {
    const index = queue.findIndex((item) => item.id === message.id);
    if (index > 0) queue.unshift(...queue.splice(index, 1));
  }
};
