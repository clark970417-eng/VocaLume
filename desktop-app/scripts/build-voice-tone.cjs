const { execFileSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
if (process.platform === 'darwin') {
  const output = join(__dirname, '../resources/bin')
  mkdirSync(output, { recursive: true })
  for (const [source, name] of [['voice-tone.swift', 'voice-tone-helper'], ['capture-claim.swift', 'capture-claim-helper']]) {
    execFileSync('/usr/bin/xcrun', ['swiftc', '-O', join(__dirname, source), '-o', join(output, name)], { stdio: 'inherit' })
  }
}
