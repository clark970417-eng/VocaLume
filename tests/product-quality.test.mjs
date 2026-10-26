import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCorpus, pcmWav, readPcm16, percentile, distribution, qualitySummary, reviewSheet, reviewStatus, soakSummary} from '../desktop-app/scripts/product-quality.mjs';

const corpus = JSON.parse(readFileSync(new URL('./fixtures/product-quality-v1.json', import.meta.url)));
test('frozen corpus covers both directions and the declared stress conditions', () => {
  validateCorpus(corpus);
  for (const pair of ['ja-zh', 'zh-ja']) for (const category of ['fast-speech','colloquial','game-effects','proper-names','speaker-turns','speaker-overlap','negation','tense']) {
    assert.ok(corpus.audio.some(r => `${r.from}-${r.to}` === pair && r.categories.includes(category)), pair + ':' + category);
  }
  assert.throws(() => validateCorpus({...corpus, audio: []}));
  assert.throws(() => validateCorpus({...corpus, audio: [...corpus.audio, corpus.audio[0]]}));
  assert.throws(() => validateCorpus({...corpus, audio: corpus.audio.filter(r => r.from === 'ja')}));
});
test('tail percentiles include the slowest sample; absent data stays absent', () => {
  assert.equal(percentile([4, 1, 100, 2], .95), 100);
  assert.deepEqual(distribution([]), {count:0,p50:null,p95:null,p99:null,max:null});
  assert.equal(distribution([NaN, Infinity, 5]).count, 1);
});
test('PCM validation rejects truncated, wrong-rate and empty fixtures', () => {
  const wav = pcmWav(new Float32Array([.2, -.3]));
  assert.equal(readPcm16(wav).length, 2);
  assert.throws(() => readPcm16(wav.subarray(0, 45)));
  const wrong = Buffer.from(wav); wrong.writeUInt32LE(44100, 24);
  assert.throws(() => readPcm16(wrong));
  assert.throws(() => readPcm16(pcmWav(new Float32Array())));
});
test('missing results cannot become a passing quality report', () => {
  const summary = qualitySummary({audio:[],text:[],context:[]}, corpus);
  assert.equal(summary.complete, false);
  assert.equal(summary.directions['ja-zh'].translationMs.p95, null);
  assert.equal(summary.commercialQualification, 'not-established');
});
test('human review requires an identified bilingual reviewer and the exact measured cases', () => {
  const report = {audio:[{id:corpus.audio[0].id,translated:'示範結果'}]};
  const expected = reviewSheet(report, corpus);
  assert.equal(reviewStatus(expected, expected).accepted, false);
  const complete = {...expected, reviewer:'Example reviewer', bilingualJaZh:true, rows:expected.rows.map(r=>({...r,omission:0,negation:0,tense:0,names:0,naturalness:0}))};
  assert.equal(reviewStatus(complete, expected).accepted, true);
  assert.equal(reviewStatus({...complete,sourceReportHash:'other'}, expected).accepted, false);
  assert.equal(reviewStatus({...complete,rows:[]}, expected).accepted, false);
  assert.equal(reviewStatus({...complete,rows:complete.rows.map(r=>({...r,negation:2}))}, expected).accepted, false);
});
test('one-hour gate rejects abbreviated, crashed or empty-output soak runs', () => {
  const report = {summary:{durationMs:3600000},completed:[{translated:'完成',endToChineseMs:100,atMs:3000}],events:[]};
  assert.equal(soakSummary(report).complete, true);
  assert.equal(soakSummary({...report,summary:{durationMs:3599999}}).complete, false);
  assert.equal(soakSummary({...report,fatal:'worker exited'}).complete, false);
  assert.equal(soakSummary({...report,completed:[]}).complete, false);
  assert.equal(soakSummary({...report,completed:[{translated:''}]}).complete, false);
});
