/** Shared, dependency-free validation/reporting for the frozen speech corpus.
 * Pattern matches are regression signals, never a human accuracy percentage. */
import {createHash} from 'node:crypto';

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function percentile(values, fraction) {
  if (!(fraction >= 0 && fraction <= 1)) throw new Error('Invalid percentile');
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
}
export function distribution(values) {
  const valid = values.filter(Number.isFinite);
  return {count: valid.length, p50: percentile(valid, .5), p95: percentile(valid, .95),
    p99: percentile(valid, .99), max: valid.length ? Math.max(...valid) : null};
}
export function validateCorpus(corpus) {
  if (corpus.version !== 1 || !Array.isArray(corpus.audio) || !corpus.audio.length) throw new Error('Empty or unsupported corpus');
  const ids = new Set();
  for (const row of [...corpus.audio, ...(corpus.context || [])]) {
    if (!/^[a-z0-9-]+$/.test(row.id) || ids.has(row.id)) throw new Error('Invalid or duplicate case ID');
    ids.add(row.id);
    if (!['ja-zh', 'zh-ja'].includes(`${row.from}-${row.to}`)) throw new Error('Expected JA/ZH pair');
    if (!row.text?.trim() || !row.meaning?.trim() || !row.categories?.length) throw new Error('Missing case reference');
    for (const pattern of [...(row.must || []), ...(row.mustNot || [])]) new RegExp(pattern, 'u');
    if (row.segments && (!row.segments.length || row.segments.some(s => !s.text?.trim()))) throw new Error('Empty speaker turn');
  }
  for (const pair of ['ja-zh', 'zh-ja']) {
    if (!corpus.audio.some(r => `${r.from}-${r.to}` === pair)) throw new Error('Both directions are required');
  }
  return corpus;
}
export function readPcm16(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV');
  let validFormat = false, data;
  for (let p = 12; p + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(p + 4), end = p + 8 + size;
    if (end > buffer.length) throw new Error('Truncated WAV');
    const type = buffer.toString('ascii', p, p + 4);
    if (type === 'fmt ') {
      if (size < 16 || buffer.readUInt16LE(p + 8) !== 1 || buffer.readUInt16LE(p + 10) !== 1 ||
          buffer.readUInt32LE(p + 12) !== 16000 || buffer.readUInt16LE(p + 22) !== 16) throw new Error('Mono 16 kHz PCM16 required');
      validFormat = true;
    }
    if (type === 'data') data = buffer.subarray(p + 8, end);
    p = end + size % 2;
  }
  if (!validFormat || !data?.length || data.length % 2) throw new Error('Missing WAV samples');
  return Float32Array.from({length: data.length / 2}, (_, i) => data.readInt16LE(i * 2) / 32768);
}
export function pcmWav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return data;
}
export function qualitySummary(report, corpus) {
  const audio = report.audio || [], text = report.text || [], context = report.context || [];
  const missing = (expected, actual) => expected.filter(r => !actual.some(a => a.id === r.id)).map(r => r.id);
  const missingCases = {audio: missing(corpus.audio, audio), text: missing(corpus.audio, text), context: missing(corpus.context || [], context)};
  const exactCases = [[corpus.audio,audio],[corpus.audio,text],[corpus.context || [],context]].every(([expected, actual]) =>
    actual.length === expected.length && new Set(actual.map(r => r.id)).size === actual.length);
  const empty = [...audio, ...text, ...context].filter(r => !r.translated?.trim()).map(r => r.id);
  return {scope: 'Synthetic fixed-clip recognition and translation; excludes capture, VAD, browser rendering and human review.',
    complete: exactCases && !report.errors?.length && !empty.length && Object.values(missingCases).every(ids => !ids.length),
    missingCases, empty, errors: report.errors || [],
    directions: Object.fromEntries(['ja-zh', 'zh-ja'].map(pair => {
      const rows = audio.filter(r => `${r.from}-${r.to}` === pair);
      return [pair, {cases: rows.length, asrMs: distribution(rows.map(r => r.asrMs)), translationMs: distribution(rows.map(r => r.translationMs)),
        characterErrorRate: distribution(rows.map(r => r.CER)), patternSignalsPassed: rows.filter(r => r.meaningChecksPassed).length}];
    })),
    reviewRequired: [...audio, ...text, ...context].filter(r => !r.meaningChecksPassed).map(r => r.id),
    humanReview: 'pending', commercialQualification: 'not-established'};
}
export function reviewSheet(report, corpus) {
  const reference = new Map([...corpus.audio, ...(corpus.context || [])].map(r => [r.id, r]));
  return {schema: 1, sourceReportHash: sha256(JSON.stringify(report)), reviewer: '', bilingualJaZh: false,
    instructions: 'Listen to the frozen audio; compare the expected meaning, recognized text and translation. 0=no error, 1=minor, 2=meaning-changing. Do not copy automated pattern results as human scores.',
    rows: ['audio', 'text', 'context'].flatMap(kind => (report[kind] || []).map(row => ({kind, id: row.id,
      source: reference.get(row.id)?.text, previous: reference.get(row.id)?.previous,
      expectedMeaning: reference.get(row.id)?.meaning, recognized: row.recognized || row.source, translated: row.translated,
      omission: null, negation: null, tense: null, names: null, naturalness: null, note: ''})))};
}
export function reviewStatus(sheet, expected) {
  const keys = new Set(expected.rows.map(r => `${r.kind}:${r.id}`));
  const rows = sheet.rows || [], scores = ['omission', 'negation', 'tense', 'names', 'naturalness'];
  const sameCases = rows.length === keys.size && new Set(rows.map(r => `${r.kind}:${r.id}`)).size === keys.size &&
    rows.every(r => keys.has(`${r.kind}:${r.id}`));
  const complete = sheet.sourceReportHash === expected.sourceReportHash && !!sheet.reviewer?.trim() &&
    sheet.bilingualJaZh === true && sameCases && rows.length > 0 && rows.every(r => scores.every(k => [0, 1, 2].includes(r[k])));
  return {complete, meaningChangingErrors: complete ? rows.filter(r => scores.some(k => r[k] === 2)).length : null,
    accepted: complete && rows.every(r => scores.every(k => r[k] < 2))};
}
export function soakSummary(report) {
  const finals = report.completed || [], events = report.events || [], metrics = report.metrics || [];
  const durationMs = report.summary?.durationMs || 0;
  const half = durationMs / 2;
  return {scope: 'Repeated synthetic Japanese audio through paced Silero VAD, ASR and translation; excludes browser/microphone, diverse streams and Chinese speech.',
    complete: !report.fatal && !['failed','interrupted','running'].includes(report.status) && durationMs >= 3600000 && finals.length > 0 &&
      !finals.some(r => !r.translated?.trim() || !Number.isFinite(r.endToChineseMs)) && !events.some(r => r.error),
    durationMs, finals: finals.length, missingFinals: finals.filter(r => !r.translated?.trim()).length,
    errors: events.filter(e => e.error), fatal: report.fatal || null,
    endOfCaptureWindowToTranslationMs: distribution(finals.map(r => r.endToChineseMs)),
    firstHalfMs: distribution(finals.filter(r => r.atMs < half).map(r => r.endToChineseMs)),
    secondHalfMs: distribution(finals.filter(r => r.atMs >= half).map(r => r.endToChineseMs)),
    slowestCues: [...finals].sort((a, b) => b.endToChineseMs - a.endToChineseMs).slice(0, 10),
    firstSourceMs: distribution(events.filter(e => e.type === 'first-source').map(e => e.latencyMs)),
    parentRssBytes: distribution(metrics.map(m => m.rss)),
    thermalStates: [...new Set(metrics.map(m => m.thermal?.thermalState).filter(Boolean))],
    finalCacheStats: metrics.at(-1)?.cache || null,
    repeatedInputCacheBenefit: 'possible; not an uncached throughput benchmark', humanReview: 'pending'};
}
