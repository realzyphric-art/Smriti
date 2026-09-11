/* Smriti service worker — offline-first app shell.
   Static assets are cached on install and the latest app shell is refreshed
   whenever a page loads online, so installed copies remain usable offline. */

const CACHE = 'memorycare-v6';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/precache-manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/smriti-logo-mark.png',
  '/stitch-memorycare-portrait.png',
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE);
  // A single unavailable optional asset must not prevent the service worker
  // from installing. Cache every shell item independently so the app still
  // starts offline when one image or manifest entry is unavailable.
  await Promise.all(SHELL.map((path) => cache.add(path).catch(() => undefined)));
  try {
    const manifestResponse = await fetch('/precache-manifest.json', { cache: 'no-store' });
    const manifest = await manifestResponse.json();
    if (Array.isArray(manifest)) {
      await Promise.all(manifest
        .filter((path) => typeof path === 'string' && path.startsWith('/assets/'))
        .map((path) => cache.add(path).catch(() => undefined)));
    }
  } catch {
    // The shell is still useful if a deployment has no generated manifest.
  }
  const index = await cache.match('/index.html');
  if (!index) return;
  const html = await index.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => path.startsWith('/') && !path.startsWith('/api/'));
  await Promise.all(assets.map((path) => cache.add(path).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => typeof url === 'string' && url.startsWith(self.location.origin) && !new URL(url).pathname.startsWith('/api/'));
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(urls.map((url) => cache.add(url).catch(() => undefined)))),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // For page navigations, serve the cached shell when offline (SPA routing).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Same-origin static assets: cache-first, then update the cache.
  if (url.origin === self.location.origin && url.pathname !== '/sw.js') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // Cross-origin (e.g. fonts): try network, fall back to any cached copy.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
