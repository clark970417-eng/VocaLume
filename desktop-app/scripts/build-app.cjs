const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const { sourceDigest, recordBuild, manifestName } = require('./build-provenance.cjs')

const root = path.resolve(__dirname, '..')
const before = sourceDigest(root)
const previous = path.join(root, 'out', manifestName)
if (fs.existsSync(previous)) fs.unlinkSync(previous)
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
  { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
const manifest = recordBuild(root, before)
console.log('Build provenance recorded for ' + manifest.outputs.length + ' production files')
