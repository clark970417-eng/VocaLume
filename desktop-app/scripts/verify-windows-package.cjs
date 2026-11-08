/** Validate the Windows x64 payload before its installer is uploaded. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')
const { verifyBuild, manifestName } = require('./build-provenance.cjs')

const project = path.resolve(__dirname, '..')
const app = path.resolve(process.argv[2] || 'dist/win-unpacked')
const resources = path.join(app, 'resources')
const archive = path.join(resources, 'app.asar')
const executable = path.join(app, 'VocaLume.exe')
const unpacked = path.join(resources, 'app.asar.unpacked')
const entries = new Set(asar.listPackage(archive).map(entry => entry.replaceAll('\\', '/')))
const extract = file => asar.extractFile(archive, path.normalize(file))

const webOnly = /^(?:@protobufjs\/[^/]+|flatbuffers|guid-typescript|long|platform|protobufjs)$/u
const lock = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'))
for (const [location, metadata] of Object.entries(lock.packages)) {
  const name = location.replace(/^node_modules\//u, '').split('/node_modules/').at(-1)
  if (metadata.dev || name === 'onnxruntime-web' || webOnly.test(name)) continue
  const dependencies = { ...metadata.dependencies, ...metadata.optionalDependencies, ...metadata.peerDependencies }
  for (const dependency of Object.keys(dependencies)) {
    assert(!webOnly.test(dependency), `Windows runtime dependency would be excluded: ${location} → ${dependency}`)
  }
}

const provenance = verifyBuild(project)
assert.deepEqual(JSON.parse(extract('out/' + manifestName)), provenance, 'Build provenance mismatch')
for (const file of provenance.outputs) {
  const packagedHash = createHash('sha256').update(extract(file.path)).digest('hex')
  assert.equal(packagedHash, file.sha256, 'Packaged file mismatch: ' + file.path)
}

const excluded = [
  /\/node_modules\/(?:onnxruntime-web|naudiodon|segfault-handler|deepfilternet3-noise-filter|@ricky0123\/vad-web)(?:\/|$)/,
  /\/node_modules\/(?:@protobufjs\/[^/]+|flatbuffers|guid-typescript|long|platform|protobufjs)(?:\/|$)/,
  /\/node_modules\/node-llama-cpp\/llama\/(?:gitRelease\.bundle|CMakeLists\.txt|(?:addon|cmake|toolchains|xpack)(?:\/|$))/,
  /\/node_modules\/@node-llama-cpp\/win-[^/]+\/bins\/.*\.(?:lib|exp|pdb)$/,
  /\/node_modules\/@huggingface\/transformers\/dist\/(?:transformers(?:\.min|\.web(?:\.min)?)?\.js(?:\.map)?|ort-wasm-[^/]+\.(?:mjs|wasm))$/,
  /\/node_modules\/kokoro-js\/dist\/kokoro\.web\.js$/,
  /^\/out\/renderer\/vad\/ort-wasm-simd-threaded\.(?:jsep|jspi|asyncify)\.(?:wasm|mjs)$/
]
for (const entry of entries) {
  assert(!excluded.some(pattern => pattern.test(entry)), 'Unused Windows payload: ' + entry)
  const ort = entry.match(/\/node_modules\/onnxruntime-node\/bin\/napi-v3\/([^/]+)(?:\/([^/]+))?/)
  if (ort) assert(ort[1] === 'win32' && (!ort[2] || ort[2] === 'x64'), 'Foreign ONNX Runtime file: ' + entry)
  const whisper = entry.match(/\/node_modules\/@kutalia\/whisper-node-addon\/dist\/((?:darwin|mac|linux|win|win32)-[^/]+)/)
  if (whisper) assert(['win-x64', 'win32-x64'].includes(whisper[1]), 'Foreign Whisper file: ' + entry)
  const llama = entry.match(/\/node_modules\/@node-llama-cpp\/((?:linux|mac|win)-[^/]+)/)
  if (llama) assert(/^win-x64(?:-|$)/.test(llama[1]), 'Foreign llama file: ' + entry)
}

const haas = path.join(resources, 'haas-ja')
for (const name of ['speech.exe', 'speech.dll', 'haas-q8.gguf', 'HAAS-APACHE-2.0.txt', 'SPEECH-CPP-MIT.txt']) {
  assert(fs.statSync(path.join(haas, name)).size > 0, 'Missing bundled Haas-ja asset: ' + name)
}
assert.equal(fs.statSync(path.join(haas, 'haas-q8.gguf')).size, 656381472, 'Unexpected Haas-ja model size')
execFileSync(path.join(haas, 'speech.exe'), ['info', '--json', path.join(haas, 'haas-q8.gguf')], {
  cwd: haas, timeout: 45_000, windowsHide: true, stdio: 'inherit'
})

const bridges = path.join(resources, 'bridge-scripts')
for (const file of ['ane-translate-bridge.py', 'mlx-whisper-bridge.py', 'bin/fluid-audio-bridge', 'bin/voice-tone-helper', 'bin/capture-claim-helper']) {
  assert(!fs.existsSync(path.join(bridges, file)), 'Apple-only bridge in Windows payload: ' + file)
}
for (const file of ['careless-whisper-bridge.py', 'moonshine-tiny-ja-bridge.py', 'sensevoice-bridge.py']) {
  assert(fs.statSync(path.join(bridges, file)).size > 0, 'Missing cross-platform bridge: ' + file)
}

for (const file of [
  'out/main/audio-analysis-worker.js',
  'out/main/whisper-worker.js',
  'out/main/sensevoice-worker.js',
  'out/renderer/vad/ort-wasm-simd-threaded.mjs',
  'out/renderer/vad/ort-wasm-simd-threaded.wasm',
  'out/renderer/vad/silero_vad_legacy.onnx',
  'out/renderer/vad/silero_vad_v5.onnx',
  'out/renderer/vad/deepfilter/v2/pkg/df_bg.wasm',
  'out/renderer/vad/deepfilter/v2/models/DeepFilterNet3_onnx.tar.gz',
  'node_modules/onnxruntime-node/bin/napi-v3/win32/x64/DirectML.dll',
  'node_modules/@node-llama-cpp/win-x64/bins/win-x64/llama-addon.node',
  'node_modules/@node-llama-cpp/win-x64-vulkan/bins/win-x64-vulkan/llama-addon.node',
  'node_modules/@node-llama-cpp/win-x64-cuda/bins/win-x64-cuda/llama-addon.node',
  'node_modules/@node-llama-cpp/win-x64-cuda-ext/bins/win-x64-cuda/fallback/ggml-cuda.dll'
]) assert(entries.has('/' + file), 'Missing Windows runtime: ' + file)

const smokeSetup = `
  const assert = require('node:assert/strict')
  const path = require('node:path')
  const { createRequire } = require('node:module')
  const { pathToFileURL } = require('node:url')
  const archive = process.argv[1]
  const load = createRequire(path.join(archive, 'package.json'))
  assert.equal(process.arch, 'x64')
`
const run = (command, args, env = process.env) => execFileSync(command, args, { env, stdio: 'inherit', timeout: 45_000, windowsHide: true })
// Native packages are probed separately because some share DLL names.
for (const smoke of [
  "assert.equal(typeof load('@kutalia/whisper-node-addon').transcribe, 'function')",
  "assert.equal(typeof load('sherpa-onnx-node').OfflineRecognizer, 'function')",
  `assert.equal(typeof load('onnxruntime-node').InferenceSession.create, 'function')
   assert.equal(typeof load('kokoro-js').KokoroTTS.from_pretrained, 'function')
   const entry = path.join(archive, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')
   import(pathToFileURL(entry).href).then(module => assert.equal(typeof module.pipeline, 'function')).catch(fail)`,
  `import(pathToFileURL(load.resolve('node-llama-cpp')).href).then(async ({ getLlama }) => {
     const llama = await getLlama({ gpu: false, build: 'never', skipDownload: true, maxThreads: 1 })
     assert.equal(llama.gpu, false)
     await llama.dispose()
   }).catch(fail)`
]) {
  const script = smokeSetup + `\nfunction fail(error) { console.error(error); process.exitCode = 1 }\n` + smoke
  run(executable, ['-e', script, archive], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })
}
run(path.join(unpacked, 'node_modules/ffmpeg-static/ffmpeg.exe'), ['-hide_banner', '-version'])
console.log(JSON.stringify({ version: provenance.version, entries: entries.size, nativeLoadTested: true }))
