import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUiLanguage, uiLanguagePreference, translateUiText } from '../ui-language.mjs';

test('interface preference supports Chinese, English and system fallback', () => {
  assert.equal(resolveUiLanguage('zh-TW', ['en-US']), 'zh-TW');
  assert.equal(resolveUiLanguage('en', ['zh-TW']), 'en');
  assert.equal(resolveUiLanguage('auto', ['zh-Hant-TW', 'en-US']), 'zh-TW');
  assert.equal(resolveUiLanguage('auto', ['en-US', 'zh-TW']), 'en');
  assert.equal(resolveUiLanguage('auto', ['fr-FR', 'zh-CN']), 'zh-TW');
  assert.equal(resolveUiLanguage('auto', []), 'en');
  for (const value of [null, '', 'ja', {}, '__proto__']) assert.equal(uiLanguagePreference(value), 'auto');
});

test('Chinese covers navigation, controls, accessible copy and common status messages', () => {
  for (const [en, zh] of [['Translate', '翻譯'], ['Subtitles', '字幕'], ['Models', '模型'],
    ['More', '更多'], ['Save settings', '儲存設定'], ['Start translation', '開始翻譯'],
    ['Speech Recognition', '語音辨識'], ['Interface language', '介面語言'], ['Engine ready', '引擎就緒']]) {
    assert.equal(translateUiText(en, 'zh-TW'), zh);
    assert.equal(translateUiText(en, 'en'), en);
  }
});

test('localizes parameterized status without translating its file or error details', () => {
  assert.equal(translateUiText('Opening {0}...', 'zh-TW', ['My English.mp4']), '正在開啟 My English.mp4…');
  assert.equal(translateUiText('Up to date (v4.6.0)', 'zh-TW'), '已是最新版本（v4.6.0）');
  assert.equal(translateUiText('Finished {0} ({1})', 'zh-TW', ['my.mp3', '1:23']), '已完成 my.mp3（1:23）');
  assert.equal(translateUiText('等待翻譯 2 句 · 失敗 1 句', 'en'), 'Pending: 2 · Failed: 1');
  assert.equal(translateUiText('已在 1:23 取消 sample.mp3', 'en'), 'Cancelled sample.mp3 at 1:23');
});

test('popup English option covers Chinese labels and dynamic status updates', () => {
  assert.equal(translateUiText('文字翻譯', 'en'), 'Text translation');
  assert.equal(translateUiText('語音字幕', 'en'), 'Live captions');
  assert.equal(translateUiText('翻譯失敗：network offline', 'en'), 'Translation failed: network offline');
  assert.equal(translateUiText('尚未套用，請儲存服務。', 'en'), 'Not applied yet. Save the service.');
});

test('unrecognized content and proper names remain literal; the formatter executes no markup', () => {
  for (const text of ['まほろちゃん、ありがとう！', 'https://my.service/v1', 'gpt-model-v1', '<script>test</script>']) {
    assert.equal(translateUiText(text, 'zh-TW'), text);
    assert.equal(translateUiText(text, 'en'), text);
  }
  assert.equal(translateUiText('Error: {0}', 'zh-TW', ['<img src=x>']), '錯誤：<img src=x>');
});
