import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { localizedWebsiteUrl, WEBSITE_ORIGIN } from '../website-language.mjs';

const key = 'vocalume.uiLanguage';
const regionKey = 'vocalume.uiRegionLocale';
function storage(preference, region) {
  let listener;
  const settings = {[key]: preference, [regionKey]: region};
  function change(value, name = key) {
    if (settings[name] === value) return;
    settings[name] = value;
    listener({[name]: {newValue: value}}, 'local');
  }
  return {
    chrome: {
      storage: {
        local: {
          get: async () => ({...settings}),
          set: async values => {for (const [name, value] of Object.entries(values)) change(value, name);},
        },
        onChanged: {addListener: callback => {listener = callback;}},
      },
    },
    change,
    settings,
  };
}
function run(file, context) {
  runInNewContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
}

test('injected labels update without replacing the retry control or translated text', async () => {
  const store = storage('en');
  const attributes = new Map();
  const retryButton = {nodeType: 1};
  const text = {nodeType: 3, nodeValue: ''};
  const line = {
    children: [text, retryButton],
    firstChild: text,
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: name => attributes.get(name),
  };
  const context = {
    chrome: store.chrome,
    navigator: {languages: ['en-US']},
    document: {querySelectorAll: () => [line]},
    window: {addEventListener() {}},
  };
  run('page-language.js', context);
  const ui = context.VocaLumePageLanguage;
  ui.bind(line, '翻譯暫時失敗。');
  ui.bind(line, '重新翻譯這則內容', 'aria-label');
  await Promise.resolve();
  assert.equal(text.nodeValue, 'Translation unavailable.');
  store.change('ja');
  assert.equal(text.nodeValue, '翻訳できませんでした。');
  assert.equal(attributes.get('aria-label'), 'この翻訳を再試行');
  assert.equal(line.children[1], retryButton);
  ui.bind(line, () => 'ありがとうございました！');
  store.change('ko');
  assert.equal(text.nodeValue, 'ありがとうございました！');
});

test('the extension website bridge uses the same language codes as official-site links', async () => {
  const store = storage('zh-TW');
  const delivered = [];
  const window = {
    addEventListener() {},
    postMessage: (message, origin) => delivered.push([message.type, message.preference, message.locale, message.live, origin]),
  };
  window.top = window;
  run('website-language-content.js', {
    chrome: store.chrome, location: {origin: WEBSITE_ORIGIN}, navigator: {languages: ['ja-JP']}, window,
  });
  await Promise.resolve();
  for (const locale of ['zh-CN', 'en', 'ja', 'ko']) store.change(locale);
  store.change('auto');
  assert.deepEqual(delivered, ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'auto'].map((locale, index) => {
    const preference = new URL(localizedWebsiteUrl(locale)).searchParams.get('lang');
    return ['VOCALUME_UI_LANGUAGE', preference, locale === 'auto' ? undefined : preference, index !== 0, WEBSITE_ORIGIN];
  }));
});

test('injected interface auto locale uses the shared region while preserving manual choices', async () => {
  const store = storage('auto', {locale: 'ko'});
  const context = {
    chrome: store.chrome,
    navigator: {languages: ['ja-JP']},
    document: {querySelectorAll: () => []},
    window: {addEventListener() {}},
  };
  run('page-language.js', context);
  const ui = context.VocaLumePageLanguage;
  await Promise.resolve();
  assert.equal(ui.text('翻譯中…'), '번역 중…');
  store.change('en');
  store.change({locale: 'zh-CN'}, regionKey);
  assert.equal(ui.text('翻譯中…'), 'Translating…');
  store.change('auto');
  assert.equal(ui.text('翻譯中…'), '翻译中…');
  store.change({locale: null}, regionKey);
  assert.equal(ui.text('翻譯中…'), '翻訳中…');
});

test('site choices reach the extension and only the official page can change the preference', async () => {
  const store = storage('en');
  const pendingKey = 'vocalume-site-pending-language';
  const pending = new Map([[pendingKey, JSON.stringify({preference: 'ko', changedAt: Date.now()})]]);
  let onMessage;
  const window = {
    addEventListener(type, callback) { if (type === 'message') onMessage = callback; },
    postMessage() {},
    sessionStorage: {getItem: key => pending.get(key), removeItem: key => pending.delete(key)},
  };
  window.top = window;
  run('website-language-content.js', {chrome: store.chrome, location: {origin: WEBSITE_ORIGIN}, window});
  await new Promise(setImmediate);
  assert.equal(store.settings[key], 'ko');
  assert.equal(pending.has(pendingKey), false);
  const message = (preference, fields = {}) => onMessage({
    source: window, origin: WEBSITE_ORIGIN, data: {type: 'VOCALUME_SITE_UI_LANGUAGE', preference}, ...fields,
  });
  message('ja', {source: {}});
  message('ja', {origin: 'https://different.example'});
  message('__proto__');
  await new Promise(setImmediate);
  assert.equal(store.settings[key], 'ko');
  message('zh-Hans');
  await new Promise(setImmediate);
  assert.equal(store.settings[key], 'zh-CN');
  message('auto');
  await new Promise(setImmediate);
  assert.equal(store.settings[key], 'auto');
});
