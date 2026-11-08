import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { localizedWebsiteUrl, WEBSITE_ORIGIN } from '../website-language.mjs';

const key = 'vocalume.uiLanguage';
function storage(preference) {
  let listener;
  return {
    chrome: {
      storage: {
        local: {get: async () => ({[key]: preference})},
        onChanged: {addListener: callback => {listener = callback;}},
      },
    },
    change(value) {listener({[key]: {newValue: value}}, 'local');},
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
    postMessage: (message, origin) => delivered.push([message.type, message.locale, message.live, origin]),
  };
  window.top = window;
  run('website-language-content.js', {
    chrome: store.chrome, location: {origin: WEBSITE_ORIGIN}, navigator: {languages: ['ja-JP']}, window,
  });
  await Promise.resolve();
  for (const locale of ['zh-CN', 'en', 'ja', 'ko']) store.change(locale);
  store.change('auto');
  assert.deepEqual(delivered, ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'ja'].map((locale, index) => [
    'VOCALUME_UI_LANGUAGE', new URL(localizedWebsiteUrl(locale)).searchParams.get('lang'), index !== 0, WEBSITE_ORIGIN,
  ]));
});
