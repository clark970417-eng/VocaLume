// @kutalia/whisper-node-addon 1.1.0 ships an arm64 binary under mac-x64.
// Build the same upstream source for Intel before electron-builder packages it.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createRequire } = require('node:module')

assert.equal(process.platform, 'darwin', 'Whisper Intel builds require the macOS SDK')
const addonPackage = require.resolve('@kutalia/whisper-node-addon/package.json')
assert.equal(require(addonPackage).version, '1.1.0', 'Review the upstream source pin when updating Whisper')
const electronVersion = require('electron/package.json').version
const cmake = path.join(__dirname, '..', 'node_modules', '.bin', 'cmake-js')
const nodeAddonApi = createRequire(addonPackage).resolve('node-addon-api/package.json')
// This is the whisper.cpp submodule commit of whisper-node-addon v1.1.0.
const revision = 'c9eb98976aac43e76d396ca93a362153e0e33d29'
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vocalume-whisper-x64-'))
const source = path.join(workspace, 'source')
const output = path.join(workspace, 'native')

try {
  execFileSync('git', ['init', '--quiet', source], { stdio: 'inherit' })
  execFileSync('git', ['-C', source, 'fetch', '--quiet', '--depth=1',
    'https://github.com/Kutalia/whisper.cpp.git', revision], { stdio: 'inherit' })
  execFileSync('git', ['-C', source, 'checkout', '--quiet', '--detach', revision], { stdio: 'inherit' })
  execFileSync(cmake, [
    'build', '--directory', source, '--out', path.join(workspace, 'build'),
    '--target', 'addon.node', '--config', 'Release', '--runtime', 'electron',
    '--runtime-version', electronVersion, '--arch', 'x64', '--parallel', '2',
    '--CDCMAKE_OSX_DEPLOYMENT_TARGET=12.0',
    '--CDCMAKE_BUILD_WITH_INSTALL_RPATH=ON', '--CDCMAKE_INSTALL_RPATH=@loader_path',
    '--CDCMAKE_LIBRARY_OUTPUT_DIRECTORY=' + output,
    '--CDCMAKE_LIBRARY_OUTPUT_DIRECTORY_RELEASE=' + output,
    '--CDGGML_NATIVE=OFF', '--CDGGML_AVX2=OFF', '--CDGGML_FMA=OFF',
    '--CDGGML_F16C=OFF', '--CDGGML_BMI2=OFF'
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: [path.dirname(path.dirname(nodeAddonApi)), process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
    }
  })

  const binding = 'addon.node.node'
  const libraries = fs.readdirSync(output).filter(name => /^lib(?:ggml|whisper).*\.dylib$/.test(name))
  for (const name of ['libwhisper.1.dylib', 'libggml.dylib', 'libggml-base.dylib', 'libggml-cpu.dylib']) {
    assert(libraries.includes(name), `Missing Intel Whisper library: ${name}`)
  }
  for (const name of [binding, ...libraries]) {
    const file = path.join(output, name)
    const architecture = execFileSync('/usr/bin/lipo', ['-archs', file], { encoding: 'utf8' }).trim()
    assert.equal(architecture, 'x86_64', `Unexpected architecture in ${name}`)
  }

  const destination = path.join(path.dirname(addonPackage), 'dist', 'mac-x64')
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  for (const name of [binding, ...libraries]) {
    fs.cpSync(path.join(output, name), path.join(destination, name === binding ? 'whisper.node' : name), {
      verbatimSymlinks: true
    })
  }
  console.log('Rebuilt Whisper for Intel macOS from ' + revision)
} finally {
  fs.rmSync(workspace, { recursive: true, force: true })
}
