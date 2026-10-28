import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const { sourceDigest, recordBuild, verifyBuild } = createRequire(import.meta.url)('../../desktop-app/scripts/build-provenance.cjs');

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'vocalume-build-'));
  t.after(() => rmSync(parent, { recursive: true }));
  const root = join(parent, 'desktop-app');
  const write = (file, contents) => {
    const full = join(root, file);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  };
  write('package.json', JSON.stringify({ version: '4.6.0' }));
  write('src/main/index.ts', 'export const current = true;');
  write('resources/bridge.py', 'print("ready")');
  write('../extension/stream-core.mjs', 'export const ready = true;');
  for (const file of ['main/index.js', 'main/slm-worker.js', 'preload/index.js', 'renderer/index.html']) write('out/' + file, 'built:' + file);
  return { root, write, record: () => recordBuild(root, sourceDigest(root)) };
}

test('a fresh complete build verifies without exposing local paths', t => {
  const f = fixture(t), recorded = f.record();
  assert.deepEqual(verifyBuild(f.root), recorded);
  assert.equal(recorded.outputs.length, 4);
  assert.ok(!readFileSync(join(f.root, 'out/build-provenance.json'), 'utf8').includes(f.root));
});

for (const file of ['src/main/index.ts', '../extension/stream-core.mjs', 'resources/bridge.py', 'package.json']) {
  test('packaging rejects stale output after changing ' + file, t => {
    const f = fixture(t); f.record();
    f.write(file, file === 'package.json' ? '{"version":"4.6.1"}' : 'changed');
    assert.throws(() => verifyBuild(f.root), /older than its sources/);
  });
}

test('packaging rejects missing provenance and incomplete runtime output', t => {
  const f = fixture(t);
  assert.throws(() => verifyBuild(f.root), /provenance is missing/);
  rmSync(join(f.root, 'out/main/slm-worker.js'));
  assert.throws(() => f.record(), /Missing production build/);
});

test('packaging rejects modified or added runtime assets after compilation', t => {
  const f = fixture(t); f.record();
  f.write('out/renderer/late.js', 'unexpected');
  assert.throws(() => verifyBuild(f.root), /files changed after building/);
  rmSync(join(f.root, 'out/renderer/late.js'));
  f.write('out/main/index.js', 'old runtime');
  assert.throws(() => verifyBuild(f.root), /files changed after building/);
});

test('source edits during compilation cannot be stamped as a current build', t => {
  const f = fixture(t), before = sourceDigest(f.root);
  f.write('src/main/index.ts', 'edited during build');
  assert.throws(() => recordBuild(f.root, before), /Sources changed while building/);
});

test('release-native helpers generated after JS compilation do not invalidate its source stamp', t => {
  const f=fixture(t);f.record();
  f.write('resources/bin/fluid-audio-bridge','generated native helper');
  assert.equal(verifyBuild(f.root).schema,1);
});

test('typecheck/test artifacts cannot become part of a production build',t=>{
  const f=fixture(t);
  f.write('out/main/pipeline.test.js','development code');
  assert.throws(()=>f.record(),/test artifacts are present/);
});
