# Speech

Piper behind HTTP, so the app does not have to carry a 63 MB model per
language and the web app's own in-browser voice stays as it is.

The Worker keeps every clip in R2 (`say/<language>/<hash>.wav`) and only calls
this when a word has never been made. Same models, same flags and the same
tidying as `src/shared/speech/`, so a word sounds the same everywhere.

## Run it

```sh
docker build -t blitz-tts .
docker run -p 8080:8080 -v blitz-models:/models -e TTS_SECRET=... blitz-tts
```

Then point the Worker at it:

```sh
pnpm wrangler secret put TTS_URL     # https://tts.example.com
pnpm wrangler secret put TTS_SECRET  # the same value
```

Without them, `GET /api/say` answers 503 and the app simply has no voice; the
web app is unaffected, since it makes its own.

The first request for a language downloads its model (about 63 MB) into
`/models`. Give it a volume, or a cold start pays for it again.
