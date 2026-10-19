/**
 * Keeps an open Blitz on the latest build. An installed app can stay open for
 * days, so it does not wait to be closed to update: it looks for a new build
 * whenever it comes back to the screen, and every hour while it is there.
 *
 * A new build's service worker takes over at once (see sw.js) and tells every
 * open page. The page then reloads into the new build, but only when that
 * costs nothing: once no lesson, sheet or menu is open, and nothing is being
 * typed unless the page is hidden. Answers and words are saved as they happen,
 * so a reload loses nothing but a half-done lesson, which is why it waits.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;
const SAFE_CHECK_MS = 1000;

/** Nothing on screen would be lost by reloading now. */
function safeToReload(): boolean {
  // A lesson left in the background is still there when the app comes back.
  if (document.querySelector('dialog[open]') || openPopover()) return false;
  if (document.visibilityState === 'hidden') return true;
  const active = document.activeElement;
  return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable));
}

function openPopover(): boolean {
  try {
    return document.querySelector(':popover-open') !== null;
  } catch {
    // A browser without popovers has none open.
    return false;
  }
}

let reloading = false;

function reloadWhenSafe() {
  if (reloading) return;
  reloading = true;
  const attempt = () => {
    if (!safeToReload()) return;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', attempt);
    window.location.reload();
  };
  const timer = setInterval(attempt, SAFE_CHECK_MS);
  document.addEventListener('visibilitychange', attempt);
  attempt();
}

/**
 * Reloads into a new build once it has taken over. Answering its message tells
 * the service worker this page reloads by itself; pages that do not answer,
 * from builds before this one, it reloads at once.
 */
export function followUpdates() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type !== 'blitz:updated') return;
    event.ports[0]?.postMessage('reloading-when-safe');
    reloadWhenSafe();
  });
  navigator.serviceWorker.startMessages();
}

/** Installs the service worker, follows its updates and looks for new builds. */
export function keepUpdated() {
  if (!('serviceWorker' in navigator)) return;
  followUpdates();
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('/sw.js').catch(() => null);
    if (!registration) return;
    const check = () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    setInterval(check, CHECK_EVERY_MS);
  });
}
