# Blitz

Learn the words you pick, in German and English. Each language is its own
space with its own list. Write a word, say what kind of word it is, and give it
a meaning: an English translation, an English definition, a picture, or any mix.

Words live in this browser's IndexedDB first, so the app works offline and
without an account. Signing in with Google syncs them, pictures included, to
every other device signed in to the same account.

## Development

```sh
pnpm install
pnpm dev      # binds to the tailnet address on this VPS
pnpm test     # domain rules and storage
pnpm check    # types
pnpm build    # app and Worker in dist/
pnpm deploy   # build, migrate D1 and publish to Cloudflare Workers
```

`pnpm dev` runs the Worker too, on local D1 and R2 (`.wrangler/state`). Apply
the schema once with `pnpm wrangler d1 migrations apply blitz --local`.
Google sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, in
`.dev.vars` locally and as Worker secrets in production. Google only accepts
HTTPS or `localhost` redirects, so sign-in works on the deployed app and on
`http://localhost:<port>`, not over the plain-HTTP tailnet address; the
authorised redirect URI is `<origin>/api/auth/callback`.

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
src/shared/    Reusable UI: the sheet, object URLs
worker/        Cloudflare Worker: Google sign-in, sessions, sync (D1), photos (R2)
migrations/    D1 schema
mockups/       Static design sketches that led here
```
