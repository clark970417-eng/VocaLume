import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const origin = 'https://vocalume.example';
const asset = name => new URL(`../dist/mobile/${name}`, import.meta.url);
const workerSource = await readFile(asset('sw.js'), 'utf8');

function workerHarness() {
  const handlers = new Map();
  const stored = new Map();
  const deleted = [];
  const fetched = [];
  const cacheName = 'vocalume-mobile-shell-v1';
  let fetchResponse = async () => new Response('online');
  let precached = [];
  let didSkipWaiting = false;
  let didClaim = false;
  runInNewContext(workerSource, {
    self: {
      location: { origin },
      addEventListener: (name, callback) => handlers.set(name, callback),
      skipWaiting: async () => { didSkipWaiting = true; },
      clients: { claim: async () => { didClaim = true; } },
    },
    caches: {
      open: async name => {
        assert.equal(name, cacheName);
        return {
          addAll: async requests => { precached = Array.from(requests, request => request.url); },
          put: async (key, response) => { stored.set(key, response); },
          match: async key => stored.get(key)?.clone(),
        };
      },
      keys: async () => [cacheName, 'vocalume-mobile-shell-v0', 'other-app'],
      delete: async key => { deleted.push(key); },
    },
    Request: class extends Request {
      constructor(path, options) { super(new URL(path, origin), options); }
    },
    Response,
    URL,
    fetch: async (request, options) => {
      fetched.push({ request, options });
      return fetchResponse();
    },
  });
  return {
    waitFor(name) {
      let pending;
      handlers.get(name)({ waitUntil: promise => { pending = promise; } });
      return pending;
    },
    request(path, method = 'GET') {
      let pending;
      handlers.get('fetch')({
        request: new Request(new URL(path, origin), { method }),
        respondWith: promise => { pending = promise; },
      });
      return pending;
    },
    fetched, deleted, stored,
    fetchWith: response => { fetchResponse = response; },
    get precached() { return precached; },
    get didSkipWaiting() { return didSkipWaiting; },
    get didClaim() { return didClaim; },
  };
}

test('mobile manifest stays scoped to the app and declares correctly sized icons', async () => {
  const manifest = JSON.parse(await readFile(asset('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.scope, '/mobile/');
  assert.equal(manifest.start_url, manifest.scope);
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512', '512x512']);
  assert.equal(manifest.icons[2].purpose, 'maskable');
  for (const icon of manifest.icons) {
    const png = await readFile(asset(icon.src));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('worker precaches the mobile shell and cleans up only older mobile caches', async () => {
  const worker = workerHarness();
  await worker.waitFor('install');
  assert.ok(worker.precached.includes(origin + '/mobile/'));
  assert.ok(worker.precached.includes(origin + '/mobile/translation.js'));
  assert.ok(worker.precached.every(url => !url.includes('/api/')));
  assert.equal(worker.didSkipWaiting, true);
  await worker.waitFor('activate');
  assert.deepEqual(worker.deleted, ['vocalume-mobile-shell-v0']);
  assert.equal(worker.didClaim, true);
});

test('worker prefers the updated shell online and falls back to it offline', async () => {
  const worker = workerHarness();
  worker.stored.set('/mobile/', new Response('old shell'));
  worker.fetchWith(async () => new Response('new shell'));
  assert.equal(await (await worker.request('/mobile/')).text(), 'new shell');
  assert.equal(worker.fetched[0].options.cache, 'no-cache');
  worker.fetchWith(async () => { throw new Error('offline'); });
  assert.equal(await (await worker.request('/mobile/index.html?lang=ja')).text(), 'new shell');
});

test('worker ignores translation requests, third-party assets and unrelated pages', () => {
  const worker = workerHarness();
  assert.equal(worker.request('/api/mobile-translate', 'POST'), undefined);
  assert.equal(worker.request('/api/site-language'), undefined);
  assert.equal(worker.request('/mobile/?message=sample', 'POST'), undefined);
  assert.equal(worker.request('https://elsewhere.example/mobile/'), undefined);
  assert.equal(worker.request('/index.html'), undefined);
  assert.equal(worker.fetched.length, 0);
  assert.equal(worker.stored.size, 0);
});
