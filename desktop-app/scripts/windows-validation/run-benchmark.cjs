// Run from a Windows checkout after npm ci && npm run build.
// No downloads, cloud calls, microphone capture or browser automation.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
if (process.platform !== 'win32' || !process.argv[2]) {
  console.error('Usage on Windows: node scripts/windows-validation/run-benchmark.cjs C:\\path\\to\\assets')
  process.exit(1)
}
const assets = path.resolve(process.argv[2])
for (const name of ['jfk.wav', 'ggml-base.bin', 'HY-MT1.5-1.8B-Q4_K_M.gguf']) {
  if (!fs.existsSync(path.join(assets, name))) throw new Error('Missing asset: ' + name)
}
if (!fs.existsSync(path.join(root, 'out/main/slm-worker.js'))) throw new Error('Run npm run build first')
fs.mkdirSync(path.join(assets, 'models'), { recursive: true })
const base = path.join(assets, 'models/ggml-base.bin')
if (!fs.existsSync(base)) fs.copyFileSync(path.join(assets, 'ggml-base.bin'), base)
const converted = spawnSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-i', path.join(assets, 'jfk.wav'),
  '-f', 'f32le', '-ac', '1', '-ar', '16000', path.join(assets, 'jfk.f32')], { encoding: 'utf8', windowsHide: true })
if (converted.status !== 0) throw new Error(converted.stderr || 'FFmpeg failed')
const entry = path.join(root, 'out/main/verify-windows-benchmark.cjs')
try {
  require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'translation-harness.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'cjs', packages: 'external' })
  const env = { ...process.env, VOCALUME_BENCH_ASSETS: assets }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(require('electron'), [entry], { env, encoding: 'utf8', timeout: 140000,
    windowsHide: true, maxBuffer: 10000000 })
  fs.writeFileSync(path.join(assets, 'translation-demo.log'), (result.stdout || '') + '\n' + (result.stderr || ''))
  process.stdout.write(result.stdout || '')
  if (result.status !== 0) {
    process.stderr.write(result.error?.message || result.stderr || 'Benchmark failed')
    process.exitCode = 1
  }
} finally {
  fs.rmSync(entry, { force: true })
}
