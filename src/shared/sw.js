// Blitz's service worker: it keeps the app shell on the device so Blitz opens
// offline, next to the words already kept in IndexedDB. Plain JS, not bundled:
// `blitz:service-worker` in vite.config.ts fills in the three placeholders
// below and emits it as /sw.js.

const VERSION = '__VERSION__';
// Every file of this build, and the ones worth fetching up front.
const KNOWN = '__KNOWN__';
const PRECACHE = '__PRECACHE__';

// The shell is replaced with every build; hashed assets, dictionary pages and
// lists outlive builds, so the shell is the only cache named after the version.
const SHELL = `blitz-shell-${VERSION}`;
const ASSETS = 'blitz-assets';
const DICTIONARY = 'blitz-dictionary';
// Which build is in charge, and its files, so the next one knows what to keep.
const BUILD = 'blitz-build';

// How long an open page has to say it reloads by itself (app-update.ts).
const ANSWER_MS = 1500;

// Past this, an offline-first load serves the shell rather than keep waiting.
const NETWORK_PATIENCE_MS = 4000;

self.addEventListener('install', (event) => {
  // A new build takes over as soon as it is stored, rather than once every
  // window is closed: an installed app can stay open for days.
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const builds = await caches.open(BUILD);
      const previous = await builds
        .match('/current')
        .then((response) => response?.json())
        .catch(() => undefined);
      await builds.put('/current', new Response(JSON.stringify({ version: VERSION, known: KNOWN })));
      const updating = previous !== undefined || (await caches.keys()).some((name) => name.startsWith('blitz-shell-') && name !== SHELL);

      await self.clients.claim();
      // Pages still on an older build move to this one. Those that answer
      // reload by themselves once nothing would be lost; the rest, from builds
      // before pages could answer, are reloaded now. Not awaited: their
      // reloads are fetches, which wait for this activation to end.
      if (updating) {
        const windows = await self.clients.matchAll({ type: 'window' });
        await Promise.all(
          windows.map(async (client) => {
            if (!(await answers(client))) client.navigate(client.url).catch(() => {});
          }),
        );
      }

      // The build before stays until the next one, for the pages still on it
      // until they reload. Anything older would only pile up.
      const kept = new Set([SHELL, previous && `blitz-shell-${previous.version}`]);
      for (const name of await caches.keys()) {
        if (name.startsWith('blitz-shell-') && !kept.has(name)) await caches.delete(name);
      }
      const files = new Set([...KNOWN, ...(previous?.known ?? [])]);
      const assets = await caches.open(ASSETS);
      for (const request of await assets.keys()) {
        if (!files.has(new URL(request.url).pathname)) await assets.delete(request);
      }
    })(),
  );
});

/** Whether the page answers that it reloads by itself when it is safe to. */
function answers(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), ANSWER_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.postMessage({ type: 'blitz:updated' }, [channel.port2]);
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Voices manage their own storage; the rest of /api is live data.
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(openPage(request));
  else if (url.pathname.startsWith('/dict/') || url.pathname.startsWith('/lists/')) event.respondWith(staleWhileRevalidate(request));
  else event.respondWith(fromCacheOrNetwork(request, url));
});

/**
 * The page itself: the network when it answers, the stored copy when it does
 * not. The app lives at /learn; anything else is the front page.
 */
async function openPage(request) {
  try {
    const patience = new Promise((_, reject) => setTimeout(reject, NETWORK_PATIENCE_MS));
    return await Promise.race([fetch(request), patience]);
  } catch {
    const shell = await caches.open(SHELL);
    const { pathname } = new URL(request.url);
    const page = pathname === '/learn' || pathname === '/learn.html' || pathname.startsWith('/learn/') ? '/learn' : '/';
    return (await shell.match(page)) ?? fetch(request);
  }
}

/** Built files never change under their name, so one stored copy is the copy. */
async function fromCacheOrNetwork(request, url) {
  const stored = await caches.match(request);
  if (stored) return stored;
  const response = await fetch(request);
  if (response.ok && url.pathname.startsWith('/assets/')) {
    // A full cache must not cost the page a good response.
    const assets = await caches.open(ASSETS);
    assets.put(request, response.clone()).catch(() => {});
  }
  return response;
}

/** Dictionary pages and the ready-made lists are rebuilt now and then: answer fast from storage, refresh behind. */
async function staleWhileRevalidate(request) {
  const dictionary = await caches.open(DICTIONARY);
  const stored = await dictionary.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok) dictionary.put(request, response.clone()).catch(() => {});
    return response;
  });
  if (stored) {
    refresh.catch(() => {});
    return stored;
  }
  return refresh;
}
