# Blitz for Android

The same Blitz as the web app, with the same words, the same practice and the
same voice, on a phone. React Native (Expo SDK 58) on top of the same backend:
the Worker, D1, R2 and the models are untouched.

## What is shared, and what is not

| Web (`../../src`) | Here | Notes |
| --- | --- | --- |
| `@blitz/core` (rules) | Same package | Practice, dictionary, sync wire format, streaks, writing. Not a line of it is duplicated. |
| `worker/` | Same deployment | Only `/api/say`, the app sign-in and account deletion were added. |
| IndexedDB (Dexie) | SQLite (`expo-sqlite`) | `src/data/db.ts` is the only file that knows. |
| Service worker | — | An installed app is offline anyway. |
| Piper in the browser | Server clips | `/api/say` makes each word once, keeps it in R2, and the app caches it. No 63 MB download per language. |
| Web Audio | WAV written on the device | The same tones, made in `src/platform/sound.ts`, so `place(slot)` still plays a note per letter. |
| Cookie session | Bearer token | Kept in the keychain (`expo-secure-store`). |
| Canvas photo resize | `expo-image-manipulator` | 640 px JPEG, stored as a file, uploaded under its SHA-256. |
| CSS | `StyleSheet` + `src/theme/tokens.ts` | The same tokens as `global.css`, light and dark. |

## Run it

```sh
pnpm install
cd apps/mobile
pnpm start          # Expo Go, or a dev build
pnpm check          # types
pnpm export         # the whole bundle, without a device
```

It talks to `https://blitz.4oli.com` unless `EXPO_PUBLIC_API_URL` says
otherwise:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.20:5173 pnpm start
```

Signing in from a development build needs the Worker's Google redirect to be
reachable, so the browser flow goes through the deployed server even when the
API is local.

## Before publishing

Everything below is account work, not code. None of it is in the repository
because none of it can be.

### 1. Identifiers

In `app.json`:

- `android.package` — currently `com.oli.blitz`. It cannot be changed after the
  first upload.
- `ios.bundleIdentifier` — currently `com.oli.blitz`.
- `version` — bump it for every upload; Play does not accept the same code
  twice.

The scheme is `blitz`, and the Worker is told it when sign-in starts
(`worker/app-auth.ts`). If you change it, change both.

### 2. Icons and screenshots

The icon is `public/icons/icon-512.png` from the web app, copied to
`assets/icon.png`. Play wants:

- 512 × 512 PNG icon (have it);
- a 1024 × 500 feature graphic;
- at least two phone screenshots (the word list, and a practice question).

`assets/adaptive-icon.png` is the masked version for Android's shaped icons.

### 3. Build

```sh
pnpm add -g eas-cli
eas login
eas build --platform android --profile production
```

`eas.json` is not in the repository yet: run `eas build:configure` once and set
the `production` profile to `"buildType": "app-bundle"`. Play needs an `.aab`,
not an `.apk`. Keep the keystore EAS generates: it is the app's identity, and
losing it means never updating the app again.

### 4. Play Console

| What | Where |
| --- | --- |
| Privacy policy | `https://blitz.4oli.com/privacy/` |
| Account deletion | `https://blitz.4oli.com/delete-account/` (also in the app: Preferences → Delete account) |
| Data safety | Collected: name, email, profile picture (sign-in); user content: words and pictures; app activity: days practised. Encrypted in transit, deletable in the app. |
| Content rating | Everyone. No ads, no user-to-user features. |
| Ads | Declare "No ads". |
| Target API level | Whatever Expo SDK 58 builds, which is current. |
| Sign-in | Google. Nothing else. |

The app does **not** wrap the web app: every screen is native, so Play's
"minimum functionality" and "webview" rules do not apply.

### 5. Server side, once

```sh
pnpm wrangler r2 bucket create blitz-audio   # the clips /api/say keeps
pnpm deploy                                   # applies migrations 0005 and publishes

pnpm wrangler secret put TTS_URL              # the Piper service (see ../../tts)
pnpm wrangler secret put TTS_SECRET
```

Without `TTS_URL` the app still works; it simply has no voice, and `GET
/api/say` answers 503.

### 6. After publishing

- Upload to the internal testing track first: it needs no review, and it is the
  only place to find out that signing in fails on a real device.
- Then closed testing, then production.
- Every later upload: bump `version` in `app.json`, `eas build`, upload the
  `.aab`.

## Things that are deliberately different

- **Letters are tapped, not dragged.** The web board supports both; a thumb
  does not need the drag, and the tap target is bigger.
- **The voice is a clip.** There is no "download the voice" progress ring,
  because there is nothing to download.
- **The streak lands without the flight.** The count is celebrated with its
  sound and a bump, not an animation across the screen.
- **No install button.** It is already installed.
