# Piper, behind HTTP. Deploy anywhere Docker runs (Cloudflare Containers, a VPS).
FROM python:3.12-slim

# piper-tts brings its own phonemizer and the eSpeak data it needs.
RUN pip install --no-cache-dir piper-tts==1.2.0

WORKDIR /app
COPY server.py .

ENV MODELS_DIR=/models PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/health')"
CMD ["python", "server.py"]
