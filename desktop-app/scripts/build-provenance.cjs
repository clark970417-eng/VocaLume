const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const manifestName = 'build-provenance.json'
const digest = value => createHash('sha256').update(value).digest('hex')

function walk(root, directory, accept = () => true) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(root, file, accept)
    if (!entry.isFile() || !accept(file)) return []
    return [{ path: path.relative(root, file).split(path.sep).join('/'), sha256: digest(fs.readFileSync(file)) }]
  })
}

function sourceFiles(root) {
  const files = walk(root, path.join(root, 'src'), file => !/\.(?:test|spec)\.[^/]+$/.test(file))
  // Release workflows generate native helpers after JS compilation. Their
  // Swift sources are hashed below; direct Python bridge sources stay covered.
  files.push(...walk(root, path.join(root, 'resources'), file => /\.(?:py|json|txt)$/.test(file)))
  files.push(...walk(root, path.join(root, 'build')))
  const shared = path.resolve(root, '../extension')
  if (fs.existsSync(shared)) {
    for (const name of fs.readdirSync(shared)) {
      const file = path.join(shared, name)
      if (/\.(?:js|mjs|ts|mts)$/.test(name) && fs.statSync(file).isFile()) {
        files.push({ path: '../extension/' + name, sha256: digest(fs.readFileSync(file)) })
      }
    }
  }
  for (const name of ['package.json', 'package-lock.json', 'electron.vite.config.ts', 'electron-builder.yml', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json',
    'scripts/after-pack.js', 'scripts/before-pack.cjs', 'scripts/build-app.cjs', 'scripts/build-provenance.cjs', 'scripts/voice-tone.swift']) {
    const file = path.join(root, name)
    if (fs.existsSync(file)) files.push({ path: name, sha256: digest(fs.readFileSync(file)) })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

function sourceDigest(root) { return digest(JSON.stringify(sourceFiles(root))) }

function outputFiles(root) {
  const outputs = ['main', 'preload', 'renderer'].flatMap(name => walk(root, path.join(root, 'out', name)))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'))
  for (const required of ['out/main/index.js', 'out/main/slm-worker.js', 'out/preload/index.js', 'out/renderer/index.html']) {
    if (!outputs.some(file => file.path === required)) throw Error('Missing production build: ' + required)
  }
  if (outputs.some(file => /\.(?:test|spec)\.|\.tsbuildinfo$|\.d\.ts(?:\.map)?$/.test(file.path))) {
    throw Error('Typecheck or test artifacts are present in production output; run npm run build again')
  }
  return outputs
}

function recordBuild(root, expectedSourceDigest) {
  const current = sourceDigest(root)
  if (current !== expectedSourceDigest) throw Error('Sources changed while building; run npm run build again')
  const manifest = { schema: 1, version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
    sourceDigest: current, outputs: outputFiles(root) }
  fs.writeFileSync(path.join(root, 'out', manifestName), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

function verifyBuild(root) {
  const file = path.join(root, 'out', manifestName)
  if (!fs.existsSync(file)) throw Error('Build provenance is missing; run npm run build before packaging')
  const manifest = JSON.parse(fs.readFileSync(file))
  if (manifest.schema !== 1 || manifest.sourceDigest !== sourceDigest(root)) {
    throw Error('Compiled App is older than its sources; run npm run build before packaging')
  }
  if (JSON.stringify(manifest.outputs) !== JSON.stringify(outputFiles(root))) {
    throw Error('Compiled App files changed after building; run npm run build again')
  }
  return manifest
}

module.exports = { manifestName, sourceDigest, recordBuild, verifyBuild }
