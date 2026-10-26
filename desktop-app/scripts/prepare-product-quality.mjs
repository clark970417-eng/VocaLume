/** Generate redistributable authored controls. macOS TTS is only a control;
 * synthetic effects/pitch changes are not real games, accents or speakers. */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {release} from 'node:os';
import {validateCorpus, readPcm16, pcmWav, sha256} from './product-quality.mjs';

if (process.platform !== 'darwin') throw new Error('Prepare with macOS voices, then copy the exact WAVs and manifest to other machines.');
const destination = resolve(process.argv[2] || '.test-out/product-quality-v1');
if (existsSync(join(destination, 'manifest.json'))) throw new Error('Use a new output directory; do not silently regenerate a frozen audio set.');
mkdirSync(destination, {recursive: true});
const corpusBytes = readFileSync('../tests/fixtures/product-quality-v1.json');
const corpus = validateCorpus(JSON.parse(corpusBytes));
const ffmpeg = resolve('node_modules/ffmpeg-static/ffmpeg');
const rows = [];
for (const row of corpus.audio) {
  const segments = row.segments || [{text: row.text}];
  const rendered = segments.map((segment, i) => {
    const voice = segment.voice || (row.from === 'ja' ? 'Kyoko' : 'Meijia');
    const aiff = join(destination, `${row.id}-${i}.aiff`), wav = join(destination, `${row.id}-${i}.wav`);
    execFileSync('say', ['-v', voice, '-r', '180', '-o', aiff, segment.text]);
    const effects = ['aresample=22050'];
    if (segment.pitch) effects.push(`asetrate=22050*${segment.pitch},aresample=22050,atempo=${1 / segment.pitch}`);
    if (row.speed) effects.push(`atempo=${row.speed}`);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', aiff,
      '-af', effects.join(','), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    return {samples: readPcm16(readFileSync(wav)), voice};
  });
  const starts = [0];
  for (let i = 1; i < rendered.length; i++) starts[i] = Math.max(0, starts[i - 1] + rendered[i - 1].samples.length + Math.round((row.overlap ? -.45 : .28) * 16000));
  const audio = new Float32Array(Math.max(...rendered.map((r, i) => starts[i] + r.samples.length)) + 4800);
  rendered.forEach((r, i) => r.samples.forEach((v, j) => { audio[starts[i] + j] += v * (row.overlap ? .65 : .85); }));
  if (row.effects) {
    // Deterministic synthetic game-like beeps and clicks, roughly 18 dB below speech RMS.
    const rms = Math.sqrt(audio.reduce((s, v) => s + v * v, 0) / audio.length);
    let seed = 20261026;
    for (let i = 0; i < audio.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const t = i / 16000, phase = t % 1.3, envelope = phase < .09 ? 1 - phase / .09 : 0;
      audio[i] += rms * .18 * envelope * (Math.sin(2 * Math.PI * 680 * t) + (seed / 0xffffffff * 2 - 1));
    }
  }
  const bytes = pcmWav(audio);
  writeFileSync(join(destination, row.id + '.wav'), bytes);
  rows.push({...row, sha256: sha256(bytes), audioMs: audio.length / 16,
    synthesis: {voices: rendered.map(r => r.voice), rate: 180, speed: row.speed || 1, syntheticEffects: !!row.effects, overlap: !!row.overlap}});
}
const manifest = {...corpus, corpusSha256: sha256(corpusBytes), generatedOn: {platform: process.platform, release: release()}, audio: rows};
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({directory: destination, cases: rows.length, manifestSha256: sha256(JSON.stringify(manifest)), scope: corpus.provenance}));
