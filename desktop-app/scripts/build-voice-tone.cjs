const { execFileSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
if (process.platform === 'darwin') {
  const output = join(__dirname, '../resources/bin')
  mkdirSync(output, { recursive: true })
  execFileSync('/usr/bin/xcrun', ['swiftc', '-O', join(__dirname, 'voice-tone.swift'), '-o', join(output, 'voice-tone-helper')], { stdio: 'inherit' })
}
