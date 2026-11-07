/** Verify the archive actually contains the tested runtime before installation. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')
const { verifyBuild, manifestName } = require('./build-provenance.cjs')
const app = path.resolve(process.argv[2] || 'dist/mac-arm64/VocaLume.app')
const build = path.resolve(process.argv[3] || 'out')
const executable = path.join(app, 'Contents/MacOS/VocaLume')
const appArchitectures = execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).trim()
const arch = { arm64: 'arm64', x86_64: 'x64' }[appArchitectures]
assert(arch, `Expected a single supported Mac architecture, received ${appArchitectures}`)
const resources = path.join(app, 'Contents/Resources')
for (const name of ['voice-tone-helper', 'capture-claim-helper']) {
  const helper = path.join(resources, 'bridge-scripts/bin', name)
  const architectures = execFileSync('lipo', ['-archs', helper], { encoding: 'utf8' }).trim()
  assert.equal(architectures, appArchitectures, `Mismatched helper architecture: ${name}`)
}
const archive = path.join(resources, 'app.asar')
const entries = asar.listPackage(archive)
const provenance = verifyBuild(path.dirname(build))
assert.deepEqual(JSON.parse(asar.extractFile(archive, 'out/' + manifestName)), provenance, 'Build provenance mismatch')
for (const file of provenance.outputs) {
  assert.deepEqual(asar.extractFile(archive, file.path), fs.readFileSync(path.join(path.dirname(build), file.path)), 'Packaged file mismatch: ' + file.path)
}
for (const entry of entries) {
  assert(!/(?:^|\/)(?:\.test-out|(?:speech-)?benchmark-[^/]*|[^/]*\.gguf)(?:\/|$)/.test(entry), `Test artifact in package: ${entry}`)
  assert(!/^\/out\/.*(?:\.(?:test|spec)\.|\.tsbuildinfo$|\.d\.ts(?:\.map)?$)/.test(entry), 'Development artifact in package: '+entry)
  assert(!/\/node_modules\/@ricky0123\/vad-web(?:\/|$)/.test(entry), `Build-only VAD dependency in package: ${entry}`)
  assert(!/^\/out\/renderer\/vad\/ort-wasm-simd-threaded\.(?:jsep|jspi|asyncify)\.(?:wasm|mjs)$/.test(entry), `Unused VAD backend in package: ${entry}`)
  const ort = entry.match(/\/node_modules\/onnxruntime-node\/bin\/napi-v3\/([^/]+)(?:\/([^/]+))?/)
  if (ort) assert(ort[1] === 'darwin' && (!ort[2] || ort[2] === arch), `Foreign ONNX Runtime file in package: ${entry}`)
  const whisper = entry.match(/\/node_modules\/@kutalia\/whisper-node-addon\/dist\/((?:darwin|mac|linux|win|win32)-[^/]+)/)
  if (whisper) assert([`mac-${arch}`, `darwin-${arch}`].includes(whisper[1]), `Foreign Whisper file in package: ${entry}`)
}
for (const file of ['main/index.js', 'main/slm-worker.js', 'preload/index.js', 'renderer/index.html']) {
  assert.deepEqual(asar.extractFile(archive, 'out/' + file), fs.readFileSync(path.join(build, file)), `Runtime mismatch: ${file}`)
}
const html = asar.extractFile(archive, 'out/renderer/index.html').toString()
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)) {
  assert(asar.extractFile(archive, 'out/renderer/' + match[1].slice(2)).length, `Missing renderer asset: ${match[1]}`)
}
const version = JSON.parse(asar.extractFile(archive, 'package.json')).version
assert.equal(version, JSON.parse(fs.readFileSync('package.json')).version)
assert.deepEqual(fs.readFileSync(path.join(resources, 'bridge-scripts/mlx-whisper-bridge.py')), fs.readFileSync('resources/mlx-whisper-bridge.py'), 'Recognition bridge mismatch')
const vadDir = path.join(resources, 'app.asar.unpacked/out/renderer/vad')
for (const file of ['silero_vad_legacy.onnx', 'silero_vad_v5.onnx', 'vad.worklet.bundle.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  const asset = path.join(vadDir, file)
  assert(fs.existsSync(asset) && fs.statSync(asset).size > 1024, `Missing packaged VAD asset: ${file}`)
}
const nodeModules = path.join(resources, 'app.asar.unpacked/node_modules')
const ortBinding = path.join(nodeModules, 'onnxruntime-node/bin/napi-v3/darwin', arch, 'onnxruntime_binding.node')
const whisperDir = path.join(nodeModules, '@kutalia/whisper-node-addon/dist')
const addon = path.join(whisperDir, `mac-${arch}/whisper.node`)
const addonAlias = path.join(whisperDir, `darwin-${arch}/whisper.node`)
assert.equal(fs.realpathSync(addonAlias), fs.realpathSync(addon), 'Whisper loader alias points to a different binding')
const ffmpeg = path.join(nodeModules, 'ffmpeg-static/ffmpeg')
for (const binary of [ortBinding, addon, ffmpeg]) {
  const architectures = execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/)
  assert(architectures.includes(appArchitectures), `Native architecture mismatch: ${binary} (${architectures.join(', ')})`)
}
const dylibs = execFileSync('otool', ['-L', addon], {encoding:'utf8'})
assert(!/\/(?:Users|home)\//.test(dylibs.split('\n').slice(1).join('\n')), 'Developer library path in native addon')
const commands = execFileSync('otool', ['-l', addon], {encoding:'utf8'})
const rpaths = [...commands.matchAll(/cmd LC_RPATH\n[\s\S]*?\n\s*path (.+?) \(offset /g)].map(m => m[1])
assert(rpaths.includes('@loader_path') && rpaths.every(p => !/^\/(Users|home)\//.test(p)), 'Non-portable addon search path')
execFileSync('codesign', ['--verify', '--deep', '--strict', app], {stdio:'pipe'})
const nativeLoadTested = process.arch === arch
if (nativeLoadTested) {
  execFileSync(executable, ['-e', `
    const assert = require('node:assert/strict')
    const path = require('node:path')
    const modules = path.join(process.argv[1], 'node_modules')
    assert.equal(typeof require(path.join(modules, 'onnxruntime-node')).InferenceSession.create, 'function')
    assert.equal(typeof require(path.join(modules, '@kutalia/whisper-node-addon')).transcribe, 'function')
  `, archive], {env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}, stdio:'pipe'})
  execFileSync(ffmpeg, ['-version'], {stdio:'pipe'})
}
console.log(JSON.stringify({version, arch, entries:entries.length, runtimeMatches:true, sourceMatches:true, rendererAssetsPresent:true, signatureValid:true, portableAddon:true, nativeLoadTested}))
