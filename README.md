# Blitz

Learn the German and English words you pick. Add a word you keep running into,
and Blitz fills in its article, plural, translation and a short definition, then
quizzes you on it through five levels until you can write it from memory. It also
checks your writing and keeps a history of your grammar mistakes to review.

**Try it: [blitz.4oli.com](https://blitz.4oli.com)**

- Offline-first: words live in your browser, and the app is an installable PWA.
- Optional Google sign-in syncs words, photos and history across devices.
- Ready-made word lists, spoken answers (in-browser [Piper](https://github.com/rhasspy/piper) voices) and a daily streak.

## Quick start

Requires Node (see `.node-version`) and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev      # app and Worker on local D1/R2
pnpm test
pnpm check    # types
pnpm build
```

Sign-in, writing checks and definitions need Cloudflare and API credentials.
See [docs/development.md](docs/development.md).

## How it's built

React + Vite frontend, a Cloudflare Worker backend (D1, R2, Workers AI), and
Dexie/IndexedDB on the device.

```text
src/domain/    Framework-free rules: languages, word types, practice, sync wire format
src/data/      IndexedDB, sync, account, preferences
src/features/  Screens: words, practice, writing, review, streak, account
src/landing/   The front page at /
src/shared/    Reusable UI, sound, speech
worker/        Google sign-in, sync, photos, definitions, writing checks
migrations/    D1 schema
data/          Dictionary base (from Wiktionary) and ready-made word lists
scripts/       Dictionary, list and icon tooling
```

## License

The code is licensed under the [GNU AGPL v3](LICENSE) or later.

`data/dictionary` is derived from [Wiktionary](https://en.wiktionary.org) via
[kaikki.org](https://kaikki.org) and stays under
[CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/). The bundled
phonemizer uses [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (GPL-3.0).
