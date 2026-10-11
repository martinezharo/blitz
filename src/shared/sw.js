// Blitz's service worker: it keeps the app shell on the device so Blitz opens
// offline, next to the words already kept in IndexedDB. Plain JS, not bundled:
// `blitz:service-worker` in vite.config.ts fills in the three placeholders
// below and emits it as /sw.js.

const VERSION = '__VERSION__';
// Every file of this build, and the ones worth fetching up front.
const KNOWN = '__KNOWN__';
const PRECACHE = '__PRECACHE__';

// The shell is replaced with every build; hashed assets and dictionary pages
// outlive builds, so the shell is the only cache named after the version.
const SHELL = `blitz-shell-${VERSION}`;
const ASSETS = 'blitz-assets';
const DICTIONARY = 'blitz-dictionary';

// Past this, an offline-first load serves the shell rather than keep waiting.
const NETWORK_PATIENCE_MS = 4000;

self.addEventListener('install', (event) => {
  // No skipWaiting: a new build takes over once every open window is closed, so
  // a page never loses the hashed files it is still running on.
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('blitz-shell-') && name !== SHELL) await caches.delete(name);
      }
      // Hashed files from past builds would only pile up.
      const assets = await caches.open(ASSETS);
      for (const request of await assets.keys()) {
        if (!KNOWN.includes(new URL(request.url).pathname)) await assets.delete(request);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Other origins (voices) manage their own storage; /api is live data.
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(openPage(request));
  else if (url.pathname.startsWith('/dict/')) event.respondWith(staleWhileRevalidate(request));
  else event.respondWith(fromCacheOrNetwork(request, url));
});

/** The page itself: the network when it answers, the stored shell when it does not. */
async function openPage(request) {
  try {
    const patience = new Promise((_, reject) => setTimeout(reject, NETWORK_PATIENCE_MS));
    return await Promise.race([fetch(request), patience]);
  } catch {
    const shell = await caches.open(SHELL);
    return (await shell.match('/')) ?? fetch(request);
  }
}

/** Built files never change under their name, so one stored copy is the copy. */
async function fromCacheOrNetwork(request, url) {
  const stored = await caches.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok && url.pathname.startsWith('/assets/')) {
    const assets = await caches.open(ASSETS);
    await assets.put(request, response.clone());
  }
  return response;
}

/** Dictionary pages are rebuilt now and then: answer fast from storage, refresh behind. */
async function staleWhileRevalidate(request) {
  const dictionary = await caches.open(DICTIONARY);
  const stored = await dictionary.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok) dictionary.put(request, response.clone());
    return response;
  });
  if (stored) {
    refresh.catch(() => {});
    return stored;
  }
  return refresh;
}
