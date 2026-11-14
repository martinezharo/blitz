import { ANDROID_DOWNLOAD, isAndroid } from '../shared/android.ts';

/** Keep the web CTA on other platforms; Android gets the installable app first. */
export function offerAndroidApp() {
  if (!isAndroid(navigator.userAgent)) return;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-android-primary]')) {
    link.href = ANDROID_DOWNLOAD;
    link.querySelector('[data-cta-label]')!.textContent = 'Download for Android';
    link.querySelector('use')?.setAttribute('href', '#i-download');
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-android-web]')) {
    link.href = '/learn';
    link.textContent = 'Use web version';
    link.hidden = false;
  }
  for (const note of document.querySelectorAll<HTMLElement>('[data-android-note]')) {
    note.textContent = 'Android APK. Open the download and allow installs from your browser when asked. No account needed.';
  }
}
