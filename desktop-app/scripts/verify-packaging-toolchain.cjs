// Exercise the interfaces used by electron-builder after security overrides.
// Uses tiny fixture files only; never loads speech/translation models.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

async function verifyNativeModuleFilters(source, destination) {
  const { getConfig } = require('app-builder-lib/out/util/config/config')
  const { getMainFileMatchers, getNodeModuleFileMatcher } = require('app-builder-lib/out/fileMatcher')
  const { expandMacro } = require('app-builder-lib/out/util/macroExpander')
  const config = await getConfig(path.resolve(__dirname, '..'))
  const info = { config, projectDir: source, buildResourcesDir: 'build', debugLogger: { isEnabled: false } }
  const ortRoot = 'node_modules/onnxruntime-node/bin/napi-v3'
  const whisperRoot = 'node_modules/@kutalia/whisper-node-addon/dist'
  const targets = [
    ['mac', 'arm64', 'darwin', ['mac-arm64', 'darwin-arm64']],
    ['mac', 'x64', 'darwin', ['mac-x64', 'darwin-x64']],
    ['win', 'x64', 'win32', ['win-x64', 'win32-x64']],
    ['linux', 'x64', 'linux', ['linux-x64']]
  ]
  const whisperDirs = new Set(targets.flatMap(target => target[3]))
  for (const [platform, arch, nodePlatform, nativeDirs] of targets) {
    const expand = pattern => expandMacro(pattern, arch, {}, { os: platform })
    const matchers = getMainFileMatchers(source, destination, expand, config[platform], { info }, path.join(source, 'dist'), false)
    assert.equal(matchers.length, 1, `${platform}-${arch}: use one application allowlist`)
    const matchesApp = relative => matchers[0].createFilter()(path.join(source, relative), { isDirectory: () => false })
    for (const included of ['out/main/index.js', 'out/renderer/index.html', 'package.json']) assert(matchesApp(included), included)
    for (const excluded of ['.test-out/profile/config.json', 'models/local.gguf', 'out/main/soak-example.cjs',
      'out/benchmark-results/report.txt', 'out/speech-benchmark-results/report.txt',
      'out/main/engine.test.js', 'out/main/engine.spec.js', 'out/main/engine.tsbuildinfo', 'out/main/engine.d.ts', 'out/main/engine.d.ts.map']) {
      assert(!matchesApp(excluded), `${platform}-${arch}: included ${excluded}`)
    }
    const filter = getNodeModuleFileMatcher(source, destination, expand, config[platform], info).createFilter()
    const matches = (relative, isDirectory = false) => filter(path.join(source, relative), {
      moduleFullFilePath: path.normalize(relative), isDirectory: () => isDirectory
    })
    assert(matches(`${whisperRoot}/js/index.js`))
    assert(matches('node_modules/onnxruntime-node/dist/binding.js'))
    for (const entry of ['@huggingface/transformers/dist/transformers.node.mjs',
      '@huggingface/transformers/dist/transformers.node.cjs', 'kokoro-js/dist/kokoro.js',
      'kokoro-js/dist/kokoro.cjs', 'kokoro-js/voices/af_heart.bin', 'node-llama-cpp/dist/index.js',
      'naudiodon/build/Release/naudiodon.node']) {
      assert(matches(`node_modules/${entry}`), `${platform}-${arch}: missing runtime ${entry}`)
    }
    for (const entry of ['onnxruntime-web/dist/ort.min.mjs', '@huggingface/transformers/src/transformers.js',
      '@huggingface/transformers/types/transformers.d.ts', '@huggingface/transformers/dist/transformers.web.js',
      'kokoro-js/dist/kokoro.web.js', 'node-llama-cpp/llama/gitRelease.bundle',
      'naudiodon/portaudio/bin/libportaudio.so.2', 'naudiodon/scratch/smokeSine.js',
      'segfault-handler/example.js', 'onnxruntime-node/script/install.js']) {
      assert.equal(matches(`node_modules/${entry}`), platform !== 'mac', `${platform}-${arch}: ${entry}`)
    }
    for (const native of whisperDirs) {
      const keep = nativeDirs.includes(native)
      assert.equal(matches(`${whisperRoot}/${native}`, true), keep, `${platform}-${arch}: ${native}`)
      assert.equal(matches(`${whisperRoot}/${native}/whisper.node`), keep, `${platform}-${arch}: ${native}/whisper.node`)
    }
    for (const os of ['darwin', 'linux', 'win32']) {
      for (const cpu of ['arm64', 'x64']) {
        const binding = `${ortRoot}/${os}/${cpu}/onnxruntime_binding.node`
        const keep = os === nodePlatform && cpu === arch
        assert.equal(matches(binding), keep, `${platform}-${arch}: ${binding}`)
        assert.equal(matches(`node_modules/@huggingface/transformers/${binding}`), keep, `${platform}-${arch}: nested ${binding}`)
      }
    }
  }
}

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vocalume-packaging-'))
  const asar = await import('@electron/asar')
  try {
    const source = path.join(dir, 'source')
    await fs.mkdir(path.join(source, 'nested'), { recursive: true })
    await fs.writeFile(path.join(source, 'package.json'), '{"name":"fixture","main":"index.js"}')
    await fs.writeFile(path.join(source, 'index.js'), 'module.exports = 42\n')
    await fs.writeFile(path.join(source, 'nested', 'binding.node'), 'native-fixture')
    await fs.writeFile(path.join(source, 'nested', '.keep'), 'hidden-fixture')
    const archive = path.join(dir, 'app.asar')
    await asar.createPackageWithOptions(source, archive, { unpack: '**/*.node' })
    assert.equal(asar.extractFile(archive, 'index.js').toString(), 'module.exports = 42\n')
    assert.equal(asar.statFile(archive, 'nested/binding.node').unpacked, true)
    assert.equal(await fs.readFile(`${archive}.unpacked/nested/binding.node`, 'utf8'), 'native-fixture')
    assert.ok(asar.listPackage(archive).some(name => name.replaceAll('\\', '/').endsWith('/nested/.keep')))
    const { checkFileInArchive } = require('app-builder-lib/out/asar/asarFileChecker')
    await checkFileInArchive(archive, 'index.js', 'fixture')
    const { FileMatcher } = require('app-builder-lib/out/fileMatcher')
    const patterns = []
    new FileMatcher(source, path.join(dir, 'dest'), value => value, ['**/*', '!**/*.map']).computeParsedPatterns(patterns)
    assert.ok(patterns.some(pattern => pattern.match('nested/binding.node')))
    await verifyNativeModuleFilters(source, path.join(dir, 'dest'))
    const { FileList } = require('filelist')
    const fixtureGlob = `${source.replaceAll('\\', '/')}/**/*`
    assert.ok(new FileList().include(fixtureGlob).toArray().some(file => file.endsWith('index.js')))
    const ejs = require('ejs')
    assert.equal(ejs.render('<%= name %>', { name: 'VocaLume' }), 'VocaLume')
    const universal = await import('@electron/universal')
    assert.equal(typeof universal.makeUniversalApp, 'function')
    // Exercise electron-winstaller's callback consumer and both cleanup paths.
    const { promisify } = require('node:util')
    const fromInstaller = createRequire(require.resolve('electron-winstaller/package.json'))
    const temp = fromInstaller('temp')
    temp.track()
    const tempDir = await promisify(temp.mkdir)({ dir, prefix: 'async-' })
    await fs.writeFile(path.join(tempDir, 'child.txt'), 'cleanup')
    const opened = await temp.open({ dir, prefix: 'file-' })
    await promisify(require('node:fs').close)(opened.fd)
    await temp.cleanup()
    await assert.rejects(fs.stat(tempDir), { code: 'ENOENT' })
    await assert.rejects(fs.stat(opened.path), { code: 'ENOENT' })
    const syncDir = temp.mkdirSync({ dir, prefix: 'sync-' })
    await fs.mkdir(path.join(syncDir, 'nested'))
    await fs.writeFile(path.join(syncDir, 'nested', 'child'), 'cleanup')
    temp.cleanupSync()
    await assert.rejects(fs.stat(syncDir), { code: 'ENOENT' })
    console.log('Packaging compatibility passed: ASAR read/unpack, native filters for four targets, FileList/EJS, universal import, native temp cleanup')
  } finally {
    asar.uncacheAll()
    await fs.rm(dir, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
