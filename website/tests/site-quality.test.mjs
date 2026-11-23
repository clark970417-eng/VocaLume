import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const websiteDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = resolve(websiteDir, 'dist');
const mainPages = ['index.html', 'en.html', 'ja.html', 'ko.html', 'zh-CN.html'];
const downloadPages = mainPages.map(page => `download/${page}`);
const expectedOrigin = 'https://vocalume.vercel.app';

function readDist(relativePath) {
  return readFileSync(resolve(distDir, relativePath), 'utf8');
}

function assertLocalAssetsExist(htmlPath, html) {
  const baseDir = dirname(resolve(distDir, htmlPath));
  const patterns = [
    /(?:src|poster)="([^"]+)"/g,
    /<link\b[^>]*href="([^"]+)"/g,
    /url\(([^)]+)\)/g,
  ];
  for (const regex of patterns) {
    for (const match of html.matchAll(regex)) {
      const raw = match[1].trim().replace(/^['"]|['"]$/g, '');
      if (!raw || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('#') || raw.startsWith('data:')) continue;
      const clean = raw.split('?')[0].split('#')[0];
      const target = clean.startsWith('/') ? resolve(distDir, '.' + clean) : resolve(baseDir, clean);
      assert.ok(existsSync(target), `${htmlPath}: missing referenced local asset "${raw}" -> ${target}`);
    }
  }
}

test('all five main pages include SEO, Open Graph, JSON-LD, semantic demo headings, and valid local assets', () => {
  for (const page of mainPages) {
    const html = readDist(page);
    const expectedCanonical = page === 'index.html' ? `${expectedOrigin}/` : `${expectedOrigin}/${page}`;
    assert.ok(html.includes(`<link rel="canonical" href="${expectedCanonical}">`), `${page}: missing canonical`);
    for (const lang of ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'x-default']) {
      assert.match(html, new RegExp(`<link rel="alternate" hreflang="${lang}" href="${expectedOrigin}/`), `${page}: missing absolute hreflang ${lang}`);
    }
    const descMatch = html.match(/<meta name="description" content="([^"]+)">/);
    assert.ok(descMatch && descMatch[1].length >= 35, `${page}: meta description should be descriptive`);
    assert.ok(html.includes('<meta property="og:image" content="https://vocalume.vercel.app/assets/og-card.jpg">'), `${page}: missing og:image`);
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), `${page}: missing twitter:card`);

    const ldMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    assert.ok(ldMatch, `${page}: missing JSON-LD`);
    const ld = JSON.parse(ldMatch[1]);
    assert.equal(ld['@type'], 'SoftwareApplication');
    assert.equal(ld.name, 'VocaLume');

    const demoHeadings = html.match(/<h2 class="demo-card-heading"/g) || [];
    assert.equal(demoHeadings.length, 3, `${page}: all three demo sections must use semantic h2 headings`);
    assert.ok(html.includes('href="site.css?'), `${page}: must use consolidated site.css`);
    assert.ok(!html.includes('orbit.js') && !html.includes('obs-player.js'), `${page}: must not reference removed scripts`);
    assert.ok(!html.includes('demo-poster.png'), `${page}: must use compressed WebP poster`);
    assertLocalAssetsExist(page, html);
  }
});

test('all five download pages have absolute hreflang/canonical and valid local assets', () => {
  for (const page of downloadPages) {
    const html = readDist(page);
    assert.ok(html.includes(`<link rel="canonical" href="${expectedOrigin}/${page}">`), `${page}: missing canonical`);
    assert.ok(html.includes(`hreflang="x-default" href="${expectedOrigin}/download/en.html"`), `${page}: missing x-default hreflang`);
    assert.ok(html.includes('href="../site.css?'), `${page}: must use consolidated site.css`);
    assertLocalAssetsExist(page, html);
  }
});

test('robots.txt, sitemap.xml, and vercel.json are valid and complete', () => {
  const robots = readDist('robots.txt');
  assert.ok(robots.includes(`Sitemap: ${expectedOrigin}/sitemap.xml`));

  const sitemap = readDist('sitemap.xml');
  for (const url of [
    `${expectedOrigin}/`,
    `${expectedOrigin}/en.html`,
    `${expectedOrigin}/ja.html`,
    `${expectedOrigin}/ko.html`,
    `${expectedOrigin}/zh-CN.html`,
    `${expectedOrigin}/mobile/`,
    `${expectedOrigin}/download/index.html`,
  ]) {
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap.xml missing ${url}`);
  }

  const vercel = JSON.parse(readFileSync(resolve(websiteDir, 'vercel.json'), 'utf8'));
  assert.equal(vercel.outputDirectory, 'dist');
  assert.ok(Array.isArray(vercel.headers) && vercel.headers.length >= 3);
  const swHeader = vercel.headers.find(rule => rule.source === '/mobile/sw.js');
  assert.ok(swHeader, 'vercel.json must configure no-cache for /mobile/sw.js');
  const countryRedirects = vercel.redirects.filter(rule =>
    rule.source === '/' && rule.has?.some(h => h.key === 'x-vercel-ip-country')
  );
  assert.equal(countryRedirects.length, 4, 'vercel.json should include edge country redirects for KR, JP, CN/SG, and fallback en');
  for (const rule of countryRedirects) {
    assert.ok(rule.has.some(h => h.key === 'sec-fetch-dest' && h.value === 'document'));
    assert.ok(rule.missing?.some(m => m.type === 'query' && m.key === 'lang'));
    assert.ok(rule.missing?.some(m => m.type === 'cookie' && m.key === 'vocalume-lang'));
  }
});

test('demo-autoplay skips localized poster overlays, reduced motion, and Save-Data', () => {
  const source = readDist('demo-autoplay.js');

  function runAutoplay({ reducedMotion = false, saveData = false, inert = false, hasPoster = false } = {}) {
    let playCalls = 0;
    let pauseCalls = 0;
    let observerCallback;
    const listeners = {};
    const video = {
      inert,
      muted: false,
      defaultMuted: false,
      paused: true,
      ended: false,
      parentElement: { querySelector: selector => (selector === '.demo-poster' && hasPoster ? {} : null) },
      play() { playCalls++; this.paused = false; return Promise.resolve(); },
      pause() { pauseCalls++; this.paused = true; },
      addEventListener(name, cb) { listeners[name] = cb; },
    };
    const context = {
      document: {
        hidden: false,
        querySelectorAll: () => [video],
        addEventListener() {},
      },
      navigator: { connection: { saveData } },
      matchMedia: () => ({ matches: reducedMotion }),
      window: { IntersectionObserver: true },
      IntersectionObserver: class {
        constructor(cb) { observerCallback = cb; }
        observe() {}
      },
    };
    vm.runInNewContext(source, context);
    observerCallback([{ target: video, isIntersecting: true, intersectionRatio: 0.6 }]);
    return {
      get playCalls() { return playCalls; },
      get pauseCalls() { return pauseCalls; },
      video,
      observerCallback,
    };
  }

  assert.equal(runAutoplay({ hasPoster: true }).playCalls, 0, 'must not autoplay over an active localized poster');
  assert.equal(runAutoplay({ inert: true }).playCalls, 0, 'must not autoplay inert postered video');
  assert.equal(runAutoplay({ reducedMotion: true }).playCalls, 0, 'must not autoplay under prefers-reduced-motion');
  assert.equal(runAutoplay({ saveData: true }).playCalls, 0, 'must not autoplay under Save-Data');

  const eligible = runAutoplay();
  assert.equal(eligible.playCalls, 1, 'eligible non-postered video autoplays when visible');
  eligible.observerCallback([{ target: eligible.video, isIntersecting: false, intersectionRatio: 0 }]);
  assert.equal(eligible.pauseCalls, 1, 'pauses automatically when scrolled out of view');
});

test('language.js saves and restores scroll position and syncs vocalume-lang cookie', async () => {
  const source = readDist('language.js');
  const session = new Map();
  let cookieJar = '';
  const callbacks = {};
  const scrollCalls = [];

  const items = ['auto', 'zh-Hant', 'zh-Hans', 'en', 'ja', 'ko'].map(lang => ({
    dataset: { language: lang },
    addEventListener: (_e, cb) => { callbacks[lang] = cb; },
    focus() {},
  }));
  const root = {
    querySelector: sel => (sel === 'button' ? { addEventListener() {}, setAttribute() {}, focus() {} } : { hidden: true, querySelectorAll: () => items }),
    addEventListener() {},
    contains: () => true,
  };
  const section = { id: 'how', getBoundingClientRect: () => ({ top: 120 }), classList: { contains: () => false } };
  const makeContext = ({ current = 'zh-Hant', path = '/index.html', scrollY = 900 } = {}) => {
    const win = {
      addEventListener() {},
      scrollTo: opts => scrollCalls.push(opts),
    };
    win.top = win;
    const doc = {
      documentElement: { lang: current },
      querySelector: sel => (sel === '[data-language-menu]' ? root : { getBoundingClientRect: () => ({ bottom: 72 }) }),
      querySelectorAll: () => [section],
      getElementById: id => (id === 'how' ? section : null),
      addEventListener() {},
      get cookie() { return cookieJar; },
      set cookie(val) { cookieJar = val; },
    };
    return {
      document: doc,
      navigator: { languages: ['en-US'] },
      localStorage: { getItem: () => null, setItem() {} },
      sessionStorage: {
        getItem: k => session.get(k) ?? null,
        setItem: (k, v) => session.set(k, v),
        removeItem: k => session.delete(k),
      },
      location: { pathname: path, hash: '', search: '', origin: expectedOrigin, protocol: 'https:', replace() {}, assign() {} },
      history: { state: null, scrollRestoration: 'auto', replaceState() {} },
      window: win,
      scrollY,
      URLSearchParams,
      AbortController,
      setTimeout,
      clearTimeout,
      fetch: async () => ({ ok: true, json: async () => ({ language: 'en' }) }),
    };
  };

  vm.runInNewContext(source, makeContext());
  callbacks.en();
  assert.ok(session.has('vocalume-language-position'), 'switching language must save scroll position');
  assert.match(cookieJar, /^vocalume-lang=en;.*SameSite=Lax; Secure$/);

  vm.runInNewContext(source, makeContext({ current: 'en', path: '/en.html', scrollY: 0 }));
  assert.ok(scrollCalls.length >= 1, 'target page must restore saved scroll position');
  assert.equal(session.has('vocalume-language-position'), false, 'saved scroll position should be consumed once');

  callbacks.auto();
  assert.match(cookieJar, /^vocalume-lang=;.*Max-Age=0/);
});
