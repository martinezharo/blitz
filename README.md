# Blitz

Learn the words you pick, in German and English. Each language is its own
space with its own list. Write a word, say what kind of word it is, and give it
a meaning: an English translation, an English definition, a picture, or any mix.

Words live in this browser's IndexedDB first, so the app works offline and
without an account. Signing in with Google syncs them, pictures included, to
every other device signed in to the same account.

## Install

Blitz is an installable web app. Where the browser offers it, an install
button sits left of the account menu on wide screens, and inside the account
menu on narrow ones (guests find it in Preferences). iPhones and iPads have no
install prompt, so the menu says to use Share, then Add to Home Screen. A
service worker (`src/shared/sw.js`, emitted as `/sw.js` by the build) keeps the
app shell, fonts and speech runtime on the device, so Blitz opens offline; it
is only registered in production builds. A new build takes over once every
open window is closed.

The logo is `public/logo.svg`. The PNG icons in `public/icons/` come from it:
run `CHROMIUM=/path/to/chromium node scripts/build-icons.ts` after changing it.

## Development

```sh
pnpm install
pnpm dev      # binds to the tailnet address on this VPS
pnpm test     # domain rules and storage
pnpm check    # types
pnpm build    # app and Worker in dist/
pnpm deploy   # build, migrate D1 and publish to Cloudflare Workers
```

### Dictionary

Typing a word suggests entries from `public/dict/`, static JSON built from
[Wiktionary](https://en.wiktionary.org) (via [kaikki.org](https://kaikki.org),
CC BY-SA) and ranked with OpenSubtitles word frequencies. A German word is
defined by the English definition of its translation, and a German noun
for a person or animal brings its form for the other sex (Lehrer, Lehrerin),
which practice asks for half the time. It is committed, so
nothing runs on deploy. To refresh it, run `pnpm dictionary` (downloads about
4.5 GB into `.cache/dictionary` the first time). German is searched by the
German word or its English translation; English by the English word.

`pnpm dev` runs the Worker too, on local D1 and R2 (`.wrangler/state`). Apply
the schema once with `pnpm wrangler d1 migrations apply blitz --local`.
Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, in
`.dev.vars` locally and as Worker secrets in production. In isolated local
mode, Google only accepts HTTPS or `localhost` redirects; the authorised
redirect URI is `<origin>/api/auth/callback`.

To sign in to the production account from development on any localhost port,
put `DEVELOPMENT_UPSTREAM=https://blitz.olma.workers.dev` and the shared
`DEVELOPMENT_BRIDGE_SECRET` in `.dev.vars`. The same secret must be set in the
production Worker with `wrangler secret put DEVELOPMENT_BRIDGE_SECRET`. Open
the app on any HTTPS development origin or `http://localhost:<port>`. On the
VPS that is its Tailscale HTTPS address (`https://<host>.ts.net:8443` for port
5173); Vite accepts the hostname because the VPS lists it in
`DEV_ALLOWED_HOSTS`, and the dev server redirects plain-HTTP visits on the
tailnet IP there when the VPS pairs the port with it in `DEV_HTTPS_ORIGINS`.
Plain HTTP on a tailnet address cannot sign in or sync,
because browsers require a secure context for photo hashing. The Google button sends you through production's fixed callback; a
five-minute, single-use ticket bound to this browser signs in the
local origin. In this mode `/api/me`, `/api/sync`, photos, and sign-out are
proxied to production. **Edits in development change your real account data.**
Remove `DEVELOPMENT_UPSTREAM` to return to isolated local D1/R2. This setting
must never be added to the deployed Worker.

### Seed words

In development, open the app with `?seed` to fill this browser with words that
only have a photo, at a mix of levels, so practice shows every exercise with a
photo clue. `?seed=3` puts every seed word at level 3, and `?seed=clear`
removes them. It does nothing on a signed-in device: practising a seed word
would sync it to the account. For a headless check, Playwright can drive the
VPS's Chromium with `chromium.launch({ executablePath: '/srv/data/state/bin/chromium' })`.

### Speech

In practice, a picked option is read aloud, right or wrong, and so is a word
spelled or written out right; a wrong one stays silent. The voice is the same
on every device because it runs in the browser: eSpeak NG turns the text into
phonemes and a [Piper](https://github.com/rhasspy/piper) model (ONNX Runtime
Web, in a Web Worker) turns those into sound. German is Thorsten (CC0),
English is Cori (public domain), both "medium" voices from
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) at a
pinned revision (`src/shared/speech/voices.ts`).

A voice is about 63 MB. It downloads in the background the first time a
lesson in that language starts (a ring by the progress bar shows it), is
checked against its hash and kept in Cache Storage, so after that it loads
from the device and works offline. On a connection that asks to save data it
waits for a tap. With sounds off, nothing downloads or plays.

The phonemizer in `src/shared/speech/phonemizer/` is generated by
`node scripts/build-phonemizer.ts` from `@diffusionstudio/piper-wasm`, keeping
only the German and English eSpeak dictionaries (1 MB of 18 MB). It is
committed; rerun it after adding a language. eSpeak NG is GPL-3.0
([source](https://github.com/rhasspy/espeak-ng)).

## Sync

Each local write also leaves a row in `pending`. A sync round sends those to
`POST /api/sync` and pulls everything past the device's cursor; each word
resolves on its own, last write (`updatedAt`) wins, and deletions travel as
changes. Pictures go to R2 under the SHA-256 of their bytes. Signing out sends
what is left and clears the device; the words stay in the account.

## Layout

```text
src/domain/    Framework-free rules: languages, word types, the sync wire format
src/data/      IndexedDB (Dexie), sync, account, photo resizing, preferences
src/features/  Screens: word list and sheet, language menu, account, practice entry
src/shared/    Reusable UI: the sheet, the morph into it, object URLs, sound effects, speech
worker/        Cloudflare Worker: Google sign-in, sessions, sync (D1), photos (R2)
migrations/    D1 schema
mockups/       Static design sketches that led here
```
