# Blitz

Learn the words you pick, in German and English. Each language is its own
space with its own list. Write a word, say what kind of word it is, and give it
a meaning: an English translation, an English definition, a picture, or any mix.

Ready-made lists (food, colours, body, jobs, household) can be imported from
the page behind "Ready-made word lists": open one, untick what you do not want,
and add the rest.

A list is a file in `data/lists`, and nothing else:

```json
{ "name": "Food", "icon": "apple", "tint": "orange", "words": ["Apfel", "Brot", "Schloss > castle"] }
```

The words are German, as the dictionary lists them. Everything about a word, from
its article and plural to its translations and definition, comes from the
curated dictionary below, and the English side of the list is the first
translation of each word. `"Schloss > castle"` says which meaning is meant, and
is the English word too. `icon` is the name of any [Lucide](https://lucide.dev/icons)
icon, `tint` one of orange, red, blue, green (they go round if left out) and
`order` where it comes in the grid.

`pnpm list:new "Household objects" --count 30` makes one from a theme: the model
proposes the words and an icon, the words the curated dictionary lacks are
written, and the ones it still cannot match are taken out and named.

Lists are made at build time into `public/lists` (not in git): an index of all
of them and one file per list, which the app loads when it is opened, so there
can be as many as you like without making the app any bigger. `pnpm dev` and
`pnpm build` make them, and fail (or warn, in dev) naming what is missing.

## Pages

The front page (`index.html`, `src/landing/`) is at `/`: static HTML with a
small script for the lesson in its hero, a working composer and the
ready-made lists, read from `/lists/index.json`, so it never names a list that
is gone. The composer searches the same dictionary as the app, and a word
added there is saved where the app keeps its words, so it is waiting in
`/learn`; the storage code only loads on the first add, so the page itself
loads no React.
The app itself (`learn.html`, `src/main.tsx`) is at `/learn`, and signing in
lands there. The installed app starts at `/learn` too, and the front page sends
an installed app opened at `/` (an older home-screen icon) on to it. Search
engines and agents read `public/robots.txt`, `public/sitemap.xml` and
`public/llms.txt`, and an unknown path is a real 404 (`public/404.html`).

Words live in this browser's IndexedDB first, so the app works offline and
without an account. Signing in with Google syncs them, pictures included, to
every other device signed in to the same account.

A page in the background stays off IndexedDB: it closes the database, its live
queries pause and sync waits until it is shown again (`src/data/live.ts`).
Android freezes background pages, and one frozen mid-transaction would hold the
other tab's or the installed app's writes until it was shown again.

## Write

The Write page is free writing in the language of the space. Press Check (or
Ctrl/⌘+Enter) and `POST /api/correct` asks GPT-6 Luna with low reasoning to mark the mistakes:
spelling in red, grammar in blue, each with the fix and a one-line reason.
Only pieces really in the text are marked (`src/domain/writing.ts`), so the
model cannot invent a mistake that is not there. A word written wrong can be
added to the words once corrected, looked up in the dictionary by its
dictionary form or its plural. Each sentence with a grammar mistake goes into
the grammar history, as written and as it should be, and syncs like the words.

Before asking the model, the browser guesses the language from its most common
little words (`src/domain/detect-language.ts`); the model says what it thinks
too. A text in the other language Blitz has can be moved there and checked; one
in another language, or no language at all, is not checked. Checking sends what
was typed to the model, so it is for accounts only, up to 1,500 characters,
with its own daily allowance (`worker/correct.ts`). The text being written is
kept on the device, per language.

Writing checks use the OpenAI Responses API, a strict JSON schema and the
conservative prompt in `worker/correction-prompt.ts`. It preserves valid
metaphors and independent subjects and checks repeated errors separately.
The Worker maps the model's `original/replacement` fields to the existing
`wrong/right` response and history format. Calls have a 30-second timeout,
a 4,000-token output cap, no automatic retries and `store: false`.

### Reviewing the grammar history

"Review these mistakes" in the history asks about ten of its sentences
(`src/domain/review.ts`, `src/features/review/`), each built from tiles, tapped or dragged, of the
learner's own words. A German sentence with a translation shows its English
meaning and is built word by word, from the words it needs mixed with the ones
that were written wrong; punctuation is not asked. Any other sentence, including every English one, is
shown with a gap where each fix was, to fill with the right form among the one
that was written and a couple borrowed from other sentences.

There are no levels: a sentence stays in the review until the learner marks it
learned (it moves to "Learned" in the history, and can come back) or removes it.
Archiving and translations sync with the sentence.

German sentences get their English meaning from `POST /api/translate`
(`worker/translate.ts`): up to 20 sentences per request, one slot of its own
daily allowance each, for accounts only. The browser asks for what is missing
when the history opens and after each check, a few batches at a time
(`translateMissing` in `src/data/writing.ts`), so sentences kept before this
existed are translated too. It stops quietly when it cannot and tries again
next time; a sentence without a translation is asked with gaps meanwhile.
The daily limits remain 30 per account and 150 overall; writing checks are
billed through OpenAI separately from the definitions' Workers AI allowance.
Configure `OPENAI_API_KEY` in `.dev.vars` locally and with
`pnpm wrangler secret put OPENAI_API_KEY` for the deployed Worker.
Worker Previews keep separate secrets: configure their shared base with
`pnpm wrangler preview base-config secret put OPENAI_API_KEY` for new previews.
For an existing preview, also use
`pnpm wrangler preview secret put OPENAI_API_KEY --name <preview-name>`.
Wrangler 4.149.0 or later preserves those secrets across subsequent deployments;
earlier versions could discard them on a code build.

On phones, a bar along the bottom holds Words, Practice, Write and the menu
that the top-right corner has on wide screens; wide screens switch pages from
a pill at the top.

## Streak

The flame in the top-right corner (alone on phones, left of install and the
account on wide screens) counts the days in a row with at least one practice
question answered, in any language. Until today is practised it shows
yesterday's count, greyed out; a missed day starts it again from zero. Opening
it shows the last seven days and the longest streak.

The day's first answer grows it (`src/data/streak.ts`). Once the lesson is
closed, the new count is celebrated in the middle of the screen, with its own
sound on the same scale as the rest, and flies into the corner. A day
practised on another device just shows up, uncelebrated. Days are calendar
days on the device in hand; each one syncs as a change of its own kind, with
an id made from the date, so two devices never count a day twice
(`src/domain/streak.ts`).

## Install

Blitz is an installable web app. Where the browser offers it, an install
button sits left of the account menu on wide screens, and inside the account
menu on narrow ones (guests find it in Preferences). iPhones and iPads have no
install prompt, so the menu says to use Share, then Add to Home Screen. A
service worker (`src/shared/sw.js`, emitted as `/sw.js` by the build) keeps the
app shell, the front page, fonts and speech runtime on the device, so Blitz opens offline; it
is only registered in production builds. A new build takes over as soon as
it is downloaded: an open app looks for one whenever it comes back to the
screen and every hour, and reloads into it once nothing would be lost: no
lesson, sheet or menu open, and nothing being typed unless it is hidden
(`src/shared/app-update.ts`). Pages from builds before that, which cannot
reload themselves, the new service worker reloads at once. The build before
stays cached until the next one, for the pages still on it.

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

Typing a word suggests entries from `/dict/`, static JSON in `public/dict/`
made from two things that are in git:

- `data/dictionary/`, the base built from
  [Wiktionary](https://en.wiktionary.org) (via [kaikki.org](https://kaikki.org),
  CC BY-SA) and ranked with OpenSubtitles word frequencies. A German noun for a
  person or animal brings its form for the other sex (Lehrer, Lehrerin), which
  practice asks for half the time. To refresh it, run `pnpm dictionary`
  (downloads about 4.5 GB into `.cache/dictionary` the first time).
- `scripts/dictionary/curated/{de,en}.json`, the meanings a model wrote for the
  most common words (below), put over the base.

`public/dict/` itself (like `public/lists/`) is not versioned: `vite dev` and `vite build` make it when
it is missing or out of date (a couple of seconds), so curating more words
changes one JSON file instead of hundreds of dictionary files. `pnpm curated`
makes it by hand. German is searched by the German word or its English
translation; English by the English word.

#### Definitions

Wiktionary lumps the meanings of a German word together, borrows its definition
from the wrong translation and orders English meanings by etymology, so the
most common words are rewritten by a model, one clear meaning at a time, each
with its own short translations and a definition under 70 characters:

```sh
pnpm curate --count 4000   # node scripts/curate-dictionary.ts
pnpm curated               # node scripts/apply-curated.ts: public/dict from the base and these
```

`curate` drives the Codex CLI (`codex exec`, so it runs on a ChatGPT
subscription) over the most common words, in batches, and saves every batch to
`scripts/dictionary/curated/{de,en}.json` as it goes; stop it whenever you like
and run it again to carry on. It stops by itself when the subscription runs out.
The instructions it gives the model are in `scripts/dictionary/curate-prompt.ts`;
the rules for a definition, shared with the Worker's, in `src/domain/definition-style.ts`.
`pnpm curate -- --fix` sends definitions that use the word they define, or run long,
back to be rewritten. 
Curated meanings are marked `c: 1` in the dictionary the app serves; `pnpm dev` and
`pnpm build` apply them by themselves (`pnpm curated` does it by hand, and
`--force` makes it again). The lists of `data/lists` are made the same way.

Every other meaning gets its definition from `GET /api/definition`: the first
time someone signed in picks it, the Worker asks Gemma 4 (`@cf/google/gemma-4-26b-a4b-it`,
Workers AI) and keeps the answer in D1 (`definitions`) for everyone. The Worker
reads the word from the dictionary itself, so the browser never sends text for
the model to read, and a daily allowance (per account and overall) keeps it
inside Workers AI's free neurons. Guests see what is already written.

`pnpm dev` applies pending migrations to the local database before starting
Vite, then runs the Worker too, on local D1 and R2 (`.wrangler/state`). Each
worktree has its own local database, including when development sign-in uses
the production account. The AI binding always runs on Cloudflare, so
development needs `wrangler login`.
Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, in
`.dev.vars` locally and as Worker secrets in production. In isolated local
mode, Google only accepts HTTPS or `localhost` redirects; the authorised
redirect URI is `<origin>/api/auth/callback`.

To sign in to the production account from development on any localhost port,
put `DEVELOPMENT_UPSTREAM=https://blitz.4oli.com` and the shared
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

In development, open the app with `/learn?seed` to fill this browser with words that
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
The Worker streams only these models through `/api/voices/<sha256>.onnx`,
so browser downloads stay on Blitz's origin instead of depending on the
Hugging Face CDN's CORS headers. Successful responses are cached at the edge;
the route uses no database, storage bucket, or sign-in.

At the top level (5) a word can also be asked by ear: its voice says it, with a
"Listen again" button, and you write it with its article. It is one of the
word's clues, next to the photo, translation and meaning, and only comes up
once that language's voice is ready, so never with sounds off or before the
first download finishes.

A voice is about 63 MB. It downloads in the background the first time a
lesson in that language starts (a ring by the progress bar shows it), is
checked against its hash and kept in Cache Storage, so after that it loads
from the device and works offline. On a connection that asks to save data it
waits for a tap. With sounds off, nothing downloads or plays.
If download or synthesis fails, the voice stops for that lesson instead of
retrying for every queued word; starting a new lesson retries preparation.

The phonemizer in `src/shared/speech/phonemizer/` is generated by
`node scripts/build-phonemizer.ts` from `@diffusionstudio/piper-wasm`, keeping
only the German and English eSpeak dictionaries (1 MB of 18 MB). It is
committed; rerun it after adding a language. eSpeak NG is GPL-3.0
([source](https://github.com/rhasspy/espeak-ng)).
Its data and Wasm bytes are reused, but each text gets a fresh runtime:
repeated `callMain` calls on the same instance eventually corrupt memory.

## Sync

Words, the grammar history and the days practised sync the same way. Each local write also leaves a row in `pending`. A sync round sends those to
`POST /api/sync` and pulls everything past the device's cursor; each word
resolves on its own, last write (`updatedAt`) wins, and deletions travel as
changes. Pictures go to R2 under the SHA-256 of their bytes. Signing out sends
what is left and clears the device; the words stay in the account.

## Layout

```text
src/domain/    Framework-free rules: languages, word types, the sync wire format
src/data/      IndexedDB (Dexie), sync, account, photo resizing, preferences
src/features/  Screens: word list and sheet, writing, navigation, language menu, account, practice entry
src/landing/   The front page at /: its styles and the lesson in its hero
src/shared/    Reusable UI: the sheet, the morph into it, object URLs, sound effects, speech
worker/        Cloudflare Worker: Google sign-in, sessions, sync (D1), photos (R2), definitions (Workers AI), writing checks (OpenAI)
migrations/    D1 schema
mockups/       Static design sketches that led here
```
