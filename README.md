# Blitz

Learn the words you pick, in German and English. Each language is its own
space with its own list. Write a word, say what kind of word it is, and give it
a meaning: an English translation, an English definition, a picture, or any mix.

Everything lives in this browser's IndexedDB for now. No account, no server.

## Development

```sh
pnpm install
pnpm dev      # binds to the tailnet address on this VPS
pnpm test     # domain rules and storage
pnpm check    # types
pnpm build    # static files in dist/
pnpm deploy   # build and publish to Cloudflare Workers (static assets)
```

## Layout

```text
src/domain/    Framework-free rules: languages, word types, what a word needs
src/data/      IndexedDB (Dexie), photo resizing, preferences
src/features/  Screens: word list and sheet, language menu, practice entry
src/shared/    Reusable UI: the sheet, object URLs
mockups/       Static design sketches that led here
```

`src/data/db.ts` is the only file that knows where words are stored, and every
word carries `updatedAt`, so sync can be added later without reshaping data.
