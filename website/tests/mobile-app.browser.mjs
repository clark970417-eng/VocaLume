// Run with `node --test website/tests/mobile-app.browser.mjs` from the repository root.
// Optional executable path overrides support independently installed browser builds.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices, webkit } from '../../desktop-app/node_modules/playwright/index.mjs';

const publicDir = fileURLToPath(new URL('../dist/', import.meta.url));
const cloudUrl = 'https://api.mymemory.translated.net/get**';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const profiles = [
  { name: 'iPhone Safari', device: 'iPhone 13', engine: webkit, executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH },
  { name: 'compact iPhone Safari', device: 'iPhone 13', width: 375, engine: webkit, executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH },
  { name: 'Android Chrome', device: 'Pixel 7', engine: chromium, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
];

let origin;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  const file = resolve(publicDir, '.' + name);
  if (!file.startsWith(resolve(publicDir) + sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

async function phone(profile, callback, { deviceTranslation, serviceWorkers = 'block' } = {}) {
  const browser = await profile.engine.launch({ executablePath: profile.executablePath, headless: true });
  try {
    const { defaultBrowserType, ...device } = devices[profile.device];
    if (profile.width) {
      device.viewport = { ...device.viewport, width: profile.width };
      device.screen = { ...device.screen, width: profile.width };
    }
    const context = await browser.newContext({ ...device, serviceWorkers });
    context.setDefaultTimeout(7500);
    await context.addInitScript(deviceTranslation => {
      const translator = deviceTranslation == null ? undefined : {
        async availability() { return 'available'; },
        async create() {
          return { async translate() { return deviceTranslation; }, destroy() {} };
        }
      };
      Object.defineProperty(globalThis, 'Translator', { value: translator, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: async () => globalThis.fixtureClipboard ?? '',
          writeText: async text => { globalThis.fixtureClipboard = text; }
        }
      });
    }, deviceTranslation);
    const page = await context.newPage();
    await callback(page, context);
  } finally {
    await browser.close();
  }
}

async function openMobile(page, lang = 'zh-TW') {
  await page.goto(`${origin}/mobile/?lang=${lang}`);
  await page.locator('#source-text').waitFor();
}

function respond(route, text, status = 200) {
  return route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*' },
    json: { responseStatus: status, responseData: { translatedText: text } }
  });
}

async function valueAppears(page, selector, value) {
  try {
    await page.waitForFunction(([selector, value]) => document.querySelector(selector).value === value, [selector, value]);
  } catch (error) {
    throw new Error(`Expected ${selector} to have value ${value}; status: ${await page.locator('#translation-status').textContent()}`, { cause: error });
  }
}

for (const profile of profiles) {
  test(`${profile.name}: usable layout and app installation assets`, async () => {
    await phone(profile, async page => {
      await openMobile(page);
      assert.match(await page.locator('html').getAttribute('lang'), /^zh-(?:TW|Hant)$/i);
      const { width, content } = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth
      }));
      assert.equal(width, profile.width ?? devices[profile.device].viewport.width);
      assert.ok(content <= width, 'Page overflows the phone screen');
      for (const selector of ['#source-text', '#translation-result', '#translate-button', '#swap-languages']) {
        assert.equal(await page.locator(selector).isVisible(), true, `${selector} must be visible`);
      }
      const manifestUrl = await page.locator('link[rel=manifest]').getAttribute('href');
      assert.ok(manifestUrl);
      const manifestLink = new URL(manifestUrl, page.url());
      const response = await page.request.get(manifestLink.href);
      assert.ok(response.ok());
      const manifest = await response.json();
      assert.equal(new URL(manifest.start_url, manifestLink).pathname, '/mobile/');
      assert.equal(manifest.display, 'standalone');
      for (const size of ['192x192', '512x512']) {
        const icon = manifest.icons.find(icon => icon.sizes.split(' ').includes(size));
        assert.ok(icon, `Missing ${size} install icon`);
        assert.ok((await page.request.get(new URL(icon.src, manifestLink).href)).ok());
      }
    });
  });
}

for (const profile of profiles.filter(profile => !profile.width)) {
  test(`${profile.name}: pastes, translates and copies an edited reply only with cloud consent`, async () => {
    await phone(profile, async (page, context) => {
      const incoming = 'こんばんは。明日は何時に集合する？';
      const incomingTranslation = '晚安。明天幾點集合？';
      const reply = '我們明天九點集合吧。';
      const translatedReply = '明日は9時に集合しましょう。';
      const editedReply = '明日は9時に集合しよう！';
      const requests = [];
      await context.route(cloudUrl, route => {
        const url = new URL(route.request().url());
        requests.push({ text: url.searchParams.get('q'), pair: url.searchParams.get('langpair') });
        return respond(route, requests.length === 1 ? incomingTranslation : translatedReply);
      });
      await openMobile(page);
      assert.equal(await page.locator('#allow-network').isChecked(), false);
      await page.evaluate(text => { globalThis.fixtureClipboard = text; }, incoming);
      await page.locator('#paste-message').click();
      await valueAppears(page, '#source-text', incoming);
      const translate = page.locator('#translate-button');
      if (await translate.isEnabled()) await translate.click();
      assert.deepEqual(requests, []);
      assert.equal(await page.locator('#translation-result').inputValue(), '');

      await page.locator('#allow-network').check();
      await translate.click();
      await valueAppears(page, '#translation-result', incomingTranslation);
      await page.locator('#swap-languages').click();
      assert.equal(await page.locator('#translation-result').inputValue(), '');
      await page.locator('#source-text').fill(reply);
      await translate.click();
      await valueAppears(page, '#translation-result', translatedReply);
      await page.locator('#translation-result').fill(editedReply);
      await page.locator('#copy-translation').click();
      assert.equal(await page.evaluate(() => globalThis.fixtureClipboard), editedReply);
      assert.deepEqual(requests.map(request => request.text), [incoming, reply]);
      const [first, second] = requests;
      assert.equal(first.pair, second.pair.split('|').reverse().join('|'));
      assert.match(first.pair, /^ja(?:-JP)?\|zh(?:-TW|-CN)?$/i);
    });
  });
}

test('Android Chrome: browser translation stays on device when available', async () => {
  await phone(profiles.at(-1), async (page, context) => {
    let requests = 0;
    await context.route(cloudUrl, route => { requests++; return route.abort(); });
    await openMobile(page, 'en');
    await page.locator('#source-text').fill('おはよう、よく眠れましたか？');
    await page.locator('#translate-button').click();
    await valueAppears(page, '#translation-result', '早安。');
    assert.equal(requests, 0);
    assert.equal(await page.locator('#allow-network').isChecked(), false);
  }, { deviceTranslation: '早安。' });
});

test('iPhone Safari: automatic locale uses IP and all five interface choices preserve the draft', async () => {
  await phone(profiles[0], async (page, context) => {
    await context.route('**/api/site-language', route => route.fulfill({ json: { language: 'ko' } }));
    await openMobile(page, 'auto');
    await page.waitForFunction(() => document.documentElement.lang === 'ko');
    await page.locator('#source-text').fill('測試訊息');
    const titles = {
      'zh-Hant': '聊天文字翻譯', 'zh-Hans': '聊天文字翻译', en: 'Translate chat messages',
      ja: 'チャット翻訳', ko: '채팅 메시지 번역'
    };
    for (const [locale, title] of Object.entries(titles)) {
      await page.locator('#ui-language').selectOption(locale);
      assert.equal(await page.locator('h1').textContent(), title);
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('#source-text').inputValue(), '測試訊息');
    }
  });
});

test('iPhone Safari: changing the draft invalidates a pending cloud response', async () => {
  await phone(profiles[0], async (page, context) => {
    let release;
    let started;
    const requested = new Promise(resolve => { started = resolve; });
    await context.route(cloudUrl, async route => {
      await new Promise(resolve => { release = resolve; started(); });
      await respond(route, 'This result is now stale.').catch(() => {});
    });
    await openMobile(page, 'en');
    await page.locator('#allow-network').check();
    await page.locator('#source-text').fill('後で会おう。');
    await page.locator('#translate-button').click();
    await Promise.race([requested, delay(7500, undefined, { ref: false }).then(() => {
      throw new Error('Timed out waiting for the cloud translation request');
    })]);
    await page.locator('#source-text').fill('明日会おう。');
    release();
    await page.waitForFunction(() => !document.querySelector('#translate-button').disabled);
    assert.equal(await page.locator('#source-text').inputValue(), '明日会おう。');
    assert.equal(await page.locator('#translation-result').inputValue(), '');
    assert.equal(await page.locator('#copy-translation').isDisabled(), true);
  });
});

test('Android Chrome: the installed app shell opens offline without uploading a draft', async () => {
  await phone(profiles.at(-1), async (page, context) => {
    let requests = 0;
    await context.route(cloudUrl, route => { requests++; return route.abort(); });
    await openMobile(page);
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration('/mobile/'))?.active?.state === 'activated');
    await context.setOffline(true);
    await page.reload();
    await page.locator('#source-text').fill('おやすみなさい。');
    await page.locator('#translate-button').click();
    await valueAppears(page, '#translation-result', '晚安。');
    await page.locator('#source-text').fill('明日会おう。');
    if (await page.locator('#translate-button').isEnabled()) await page.locator('#translate-button').click();
    assert.equal(requests, 0);
    assert.equal(await page.locator('#translation-result').inputValue(), '');
    assert.ok(await page.locator('#translation-status').isVisible());
  }, { serviceWorkers: 'allow' });
});
