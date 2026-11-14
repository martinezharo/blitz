# Android

Blitz has one app: the React frontend and Cloudflare backend. `android/` packages
the production site as a Trusted Web Activity using Google's Android Browser
Helper. There is no second UI, database, sync client or speech implementation.
Web deployments update Android automatically, including the offline service
worker. An internet connection is needed on the first launch; later launches
use the same offline cache and device storage as the web app.

The APK supports Android 7 and later and uses a compatible installed browser
(Chrome is recommended). If the browser cannot provide a Trusted Web Activity,
it opens as a custom tab. Google sign-in uses the browser's existing session;
it does not run inside an embedded WebView.

## Downloads

`https://blitz.4oli.com/download/android.apk` redirects to the current version's
immutable download. `?version=0.1.0` keeps downloading that release, including
when resuming a download. `/download/latest.json` provides the version, size
and SHA-256 checksum. R2 bucket `blitz-releases` stores each release under
`v<version>/`; `latest.json` is updated only after the APK and manifest exist.

Android visitors get the download as the landing page's main action and the web
version as the secondary action. The web app also offers the APK in its install
menu. Installed apps keep using the app without offering another installation.

## Build and release

Install JDK 17 and the Android SDK, set `JAVA_HOME` and `ANDROID_HOME`, then run
`pnpm android:build`. Without signing environment variables, release builds are
unsigned and cannot be installed. `./android/gradlew -p android assembleDebug`
builds an installable development APK.

For a release, bump `version` in `package.json`, open and merge a PR, then push
the matching tag (`v0.1.0`, for example). `.github/workflows/android.yml` builds,
lints and tests the APK on an emulator, checks its package, version and signing
certificate, then publishes to R2 and GitHub Releases. PR builds never receive
the release key. Publication refuses to replace the same or a newer version.

Repository secrets:

- `ANDROID_KEYSTORE_BASE64`: Base64-encoded PKCS12 signing key, alias `blitz`.
- `ANDROID_KEYSTORE_PASSWORD`: its store and key password.
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`: S3 credentials scoped to object
  read/write access in `blitz-releases`. CI has no access to other buckets,
  Workers, databases or account settings.

Keep an offline backup of the key and password. The initial local backup is in
`~/.config/blitz/android/` on the development machine, outside the repository.
Android updates must use the same key. The public certificate fingerprint is
pinned in `public/.well-known/assetlinks.json`; never replace it when updating
the app. That file lets Chrome verify the app and remove the browser toolbar.

Local signing uses `BLITZ_KEYSTORE` (absolute path to the PKCS12 file) and
`BLITZ_KEYSTORE_PASSWORD`. `node scripts/android-release.ts manifest <apk>
<output>` verifies the signature, package and version before making metadata.

The adaptive and monochrome icons use the bolt from `public/logo.svg`; the
legacy launcher icon uses `public/icons/icon-192.png`. Update both when changing
the logo.
