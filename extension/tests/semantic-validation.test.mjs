import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCriticalFacts } from '../semantic-validation.mjs';
import { validateTranslation } from '../translation-policy.mjs';

test('shared validator rejects explicit negation reversed into the same affirmative action', () => {
  const source = '明日は参加しません。';
  assert.equal(assessCriticalFacts(source, '明天會參加。', 'ja-zh').code, 'polarity');
  assert.throws(() => validateTranslation('明天會參加。', 'ja-zh', source), /反轉/u);
  assert.equal(validateTranslation('明天不會參加。', 'ja-zh', source), '明天不會參加。');
  assert.equal(validateTranslation('明天缺席。', 'ja-zh', source), '明天缺席。');
  assert.equal(assessCriticalFacts('参加しないわけじゃない。', '我可以參加。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts('参加しませんか？', '明天會參加嗎？', 'ja-zh'), undefined);
});

test('checks explicit duration values and keeps deadlines distinct from future times', () => {
  const source = '電車は5分後に到着し、10分後に出発します。';
  assert.throws(() => validateTranslation('火車到了。', 'ja-zh', source), /時間或期限/u);
  assert.equal(assessCriticalFacts(source, '火車五分鐘後抵達，十分鐘後出發。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts('5分後に到着、5分以内に連絡します。', '5分鐘後到達，5分鐘後聯絡。', 'ja-zh').code, 'duration');
  assert.equal(assessCriticalFacts('三十分以内に着きます。', '半個小時內會抵達。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts('三十分以内に着きます。', '半個小時後會抵達。', 'ja-zh').code, 'duration');
  assert.equal(assessCriticalFacts('１時間半かかります。', '要花90分鐘。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts('試験で100分の40です。', '考試拿了四成。', 'ja-zh'), undefined);
});

test('matches fractional percentages and percentage points without flagging game points', () => {
  const source = '失業率は四点一パーセントで、前の月から零点一ポイント改善しました。';
  assert.equal(assessCriticalFacts(source, '失業率是百分之四點一，下降0.1個百分點。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts(source, '失業率是4.1%，下降0.1%。', 'ja-zh').code, 'percentage');
  assert.equal(assessCriticalFacts('３ポイントゲット！', '拿到三分了！', 'ja-zh'), undefined);
});

test('preserves a verified monthly comparison and equivalent headcount formats', () => {
  const source = '就業者数は前の月から十六万五千人増加し市場の予想を大きく';
  assert.equal(validateTranslation('就業人數較上季增加16.5萬人，大幅超出市場預期。', 'ja-zh', source),
    '就業人數較上月增加16.5萬人，大幅超出市場預期。');
  assert.equal(assessCriticalFacts(source, '就業人數較上月增加165,000人。', 'ja-zh'), undefined);
  assert.equal(assessCriticalFacts(source, '就業人數較上月增加16.5萬。', 'ja-zh'), undefined);
  assert.throws(() => validateTranslation('就業人數較上月增加16.5人。', 'ja-zh', source), /統計人數/u);
  assert.equal(validateTranslation('就業人數較上季增加16.5萬人。', 'ja-zh', '就業者数は前の四半期から十六万五千人増加しました。'),
    '就業人數較上季增加16.5萬人。');
});

test('recognizes mixed Arabic and Japanese units from live caption transcripts', () => {
  const source = '就業者数は前の月から16万5000人増加し市場の予想を大きく上回りました';
  assert.equal(validateTranslation('就業人數較上季增加16.5萬人，遠超市場預期。', 'ja-zh', source),
    '就業人數較上月增加16.5萬人，遠超市場預期。');
  assert.throws(() => validateTranslation('就業人數較上月增加5000人。', 'ja-zh', source), /統計人數/u);
  assert.equal(assessCriticalFacts('人口は１億２３４５万６７８９人に増加しました。', '人口增至123,456,789人。', 'ja-zh'), undefined);
});

test('a live employment caption cut before the trend keeps its month and headcount open-ended', () => {
  const source = 'アメリカの十月の雇用統計が六日に発表され就業者数は前の月から十六万五千人';
  const output = '美國10月就業統計6日公佈，就業人數較上季增加16.5萬人。';
  const validateCaption = (translation, original = source) => validateTranslation(translation, 'ja-zh', original, [], true);
  assert.equal(validateCaption(output), '美國10月就業統計6日公佈，就業人數與上月相比，16.5萬人……');
  assert.equal(validateCaption(output.replace('上季', '上月')), '美國10月就業統計6日公佈，就業人數與上月相比，16.5萬人……');
  assert.equal(validateTranslation(output, 'ja-zh', source), output);
  assert.throws(() => validateCaption(output.replace('16.5萬人', '5000人')), /統計人數/u);
  assert.equal(validateCaption(output, source.replace('前の月', '前の四半期')), output);
  assert.equal(validateCaption(output, source + '増加しました。'), output.replace('上季', '上月'));
});
