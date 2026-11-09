# Development

Things that are not obvious from the code. The rest is in code comments.

## Local setup

`pnpm dev` applies pending migrations to a local D1 database, then runs Vite and
the Worker on local D1 and R2 (`.wrangler/state`). Each git worktree has its own.
The Workers AI binding always runs on Cloudflare, so run `wrangler login` first.

Secrets go in `.dev.vars` locally:

| Variable | Used for |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Redirect URI: `<origin>/api/auth/callback` (Google only accepts HTTPS or `localhost`). |
| `OPENAI_API_KEY` | Writing checks and sentence translations. |

Without them the app still works as a guest, offline.

## Deploying your own

Replace the D1 `database_id`, the R2 bucket and the Analytics Engine datasets in
`wrangler.jsonc` with your own, then:

```sh
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put OPENAI_API_KEY
pnpm deploy   # build, migrate D1, publish
```

Worker Previews keep their own secrets: set them with
`pnpm wrangler preview base-config secret put <NAME>` (new previews) and
`pnpm wrangler preview secret put <NAME> --name <preview>` (existing ones).
Wrangler 4.149.0 or later keeps them across deploys.

## Signing in to production from development

Set `DEVELOPMENT_UPSTREAM=https://blitz.4oli.com` and a shared
`DEVELOPMENT_BRIDGE_SECRET` in `.dev.vars`, and set the same secret on the
production Worker. The Google button then goes through production's callback and
a single-use ticket signs in the local origin. `/api/me`, `/api/sync`, photos
and sign-out are proxied to production.

**Edits made this way change real account data.** Never set
`DEVELOPMENT_UPSTREAM` on a deployed Worker. Remove it to go back to the
isolated local database.

Sign-in and sync need a secure context, so use `http://localhost:<port>` or an
HTTPS origin. When serving over a tailnet, `DEV_ALLOWED_HOSTS` and
`DEV_HTTPS_ORIGINS` (see `vite.config.ts`) cover the hostname and the
plain-HTTP redirect.

## Dictionary and lists

`public/dict/` and `public/lists/` are generated, not in git. `vite dev` and
`vite build` make them from what is in git:

- `data/dictionary/`: the base, built from Wiktionary and ranked with
  OpenSubtitles word frequencies. Refresh with `pnpm dictionary` (downloads about
  4.5 GB into `.cache/dictionary` the first time).
- `scripts/dictionary/curated/{de,en}.json`: meanings a model rewrote for the
  most common words, put over the base. Make more with `pnpm curate --count 4000`
  (drives `codex exec`, resumable). `pnpm curated` applies them by hand.
- `data/lists/*.json`: ready-made lists. `pnpm list:new "Theme" --count 30`
  makes one with a model.

Meanings the dictionary lacks get a definition from `GET /api/definition`
(Workers AI, cached in D1), with a daily allowance per account and overall.

## Speech

Voices run in the browser: eSpeak NG makes phonemes and a Piper model (ONNX
Runtime Web, in a Web Worker) makes the sound. The Worker streams the pinned
models through `/api/voices/<sha256>.onnx`.

The phonemizer in `src/shared/speech/phonemizer/` is generated and committed.
After adding a language, rerun `node scripts/build-phonemizer.ts`. Each text gets
a fresh eSpeak runtime, because repeated `callMain` calls on one instance
corrupt memory.

## Icons

The PNG icons in `public/icons/` come from `public/logo.svg`. After changing it,
run `CHROMIUM=/path/to/chromium node scripts/build-icons.ts`.
