/**
 * Keeps an open Blitz on the latest build. An installed app can stay open for
 * days, so it does not wait to be closed to update: it looks for a new build
 * whenever it comes back to the screen, and every hour while it is there.
 *
 * A new build's service worker takes over at once (see sw.js) and tells every
 * open page. A page that already runs the new build's files, as one just
 * opened online does, stays as it is. The rest reload into the new build, but
 * only out of sight: once the page is hidden, with no lesson, sheet or menu
 * left open in it. A reload on screen would blank the page under the person
 * using it, and it can wait until they switch away. Answers and words are
 * saved as they happen, so the reload loses nothing.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Nothing would be lost, or seen, by reloading now. */
function safeToReload(): boolean {
  if (document.visibilityState !== 'hidden') return false;
  // A lesson left in the background is still there when the app comes back.
  return !document.querySelector('dialog[open]') && !openPopover();
}

function openPopover(): boolean {
  try {
    return document.querySelector(':popover-open') !== null;
  } catch {
    // A browser without popovers has none open.
    return false;
  }
}

/** Whether every script and stylesheet this page runs is one of the given build's files. */
function runsBuild(files: unknown): boolean {
  if (!Array.isArray(files)) return false;
  const known = new Set(files);
  const own = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"][href]')]
    .map((element) => new URL(element instanceof HTMLScriptElement ? element.src : element.href, location.href))
    .filter((url) => url.origin === location.origin)
    .map((url) => url.pathname);
  return own.length > 0 && own.every((path) => known.has(path));
}

let reloading = false;

function reloadWhenSafe() {
  if (reloading) return;
  reloading = true;
  // Hidden, nothing can be closed or typed, so only being hidden again is a new chance.
  const attempt = () => {
    if (!safeToReload()) return;
    document.removeEventListener('visibilitychange', attempt);
    window.location.reload();
  };
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
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string; files?: unknown }>) => {
    if (event.data?.type !== 'blitz:updated') return;
    event.ports[0]?.postMessage('reloading-when-safe');
    // Opened online, the page came from the network already on the new build.
    if (runsBuild(event.data.files)) return;
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
