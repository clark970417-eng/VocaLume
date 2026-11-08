const CACHE_PREFIX = 'vocalume-mobile-shell-';
const CACHE = CACHE_PREFIX + 'v1';
const HOME = '/mobile/';
const SHELL = new Set([
  HOME,
  '/mobile/mobile.css',
  '/mobile/app.js',
  '/mobile/strings.js',
  '/mobile/translation.js',
  '/mobile/install.js',
  '/mobile/manifest.webmanifest',
  '/mobile/icon-192.png',
  '/mobile/icon-512.png',
  '/mobile/icon-maskable-512.png',
  '/mobile/apple-touch-icon.png',
  '/assets/vocalume.png',
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...SHELL].map(path => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE);
    await Promise.all(old.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname === '/mobile/index.html' ? HOME : url.pathname;
  if (!SHELL.has(path)) return;
  event.respondWith(networkFirst(request, path));
});

async function networkFirst(request, path) {
  // The cache holds only the static shell. API traffic and drafts stay out of it.
  const cache = await caches.open(CACHE).catch(() => null);
  let response;
  try {
    response = await fetch(request, { cache: 'no-cache' });
  } catch {
    return (await cache?.match(path)) || Response.error();
  }
  if (response.ok && !response.redirected) {
    await cache?.put(path, response.clone()).catch(() => {});
  } else if (response.status >= 500) {
    return (await cache?.match(path)) || response;
  }
  return response;
}
