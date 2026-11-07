import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTaiwanLivestreamTerminology, normalizeTaiwanChinese } from '../taiwan-chinese.mjs';

test('normalizes Simplified and regional Traditional provider output', () => {
  assert.equal(normalizeTaiwanChinese('视频软件与网络设置。'), '影片軟體與網路設定。');
  assert.equal(normalizeTaiwanChinese('視頻軟件與網絡設置。'), '影片軟體與網路設定。');
  assert.equal(normalizeTaiwanChinese('只有一只貓。'), '只有一隻貓。');
  assert.equal(normalizeTaiwanChinese('USB-C [NAME0] @myname'), 'USB-C [NAME0] @myname');
});

test('broadcast terminology requires source evidence and preserves mixed distribution senses', () => {
  const output = '明天開始廣播。';
  assert.equal(applyTaiwanLivestreamTerminology('明日の配信が始まります。', output), '明天開始直播。');
  assert.equal(applyTaiwanLivestreamTerminology('ニュースを配信します。', output), output);
  assert.equal(applyTaiwanLivestreamTerminology('ソフトウェアを配信します。明日の配信も始めます。', output), output);
  assert.equal(applyTaiwanLivestreamTerminology('あとで配信します。', output, '次回のライブ配信です。'), '明天開始直播。');
});
