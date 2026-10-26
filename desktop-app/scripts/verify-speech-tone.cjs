const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { createInterface } = require('node:readline')
const { resolve } = require('node:path')
const assert = require('node:assert/strict')

function pcm(file) {
  const wav = readFileSync(file)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  let offset = 12, data
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      assert.equal(wav.readUInt16LE(offset + 8), 1)
      assert.equal(wav.readUInt16LE(offset + 10), 1)
      assert.equal(wav.readUInt32LE(offset + 12), 16000)
      assert.equal(wav.readUInt16LE(offset + 22), 16)
    }
    if (id === 'data') data = wav.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + size % 2
  }
  assert(data?.length)
  const floats = Buffer.alloc(data.length * 2)
  for (let i = 0; i < data.length / 2; i++) floats.writeFloatLE(data.readInt16LE(i * 2) / 32768, i * 4)
  return floats.toString('base64')
}

async function main() {
  const helper = resolve(process.argv[2] || 'resources/bin/voice-tone-helper')
  const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] })
  const lines = createInterface({ input: child.stdout })
  const timer = setTimeout(() => { child.kill(); process.exitCode = 1 }, 15000)
  const cases = [
    { name: 'japanese-speech', audio: pcm('../extension/tests/japanese-fixture.wav'), laugh: false },
    { name: 'silence', audio: Buffer.alloc(16000 * 4 * 3).toString('base64'), laugh: false },
    { name: 'cc0-laughter', audio: pcm('../extension/tests/laughter-fixture.wav'), laugh: true }
  ]
  try {
    const iterator = lines[Symbol.asyncIterator]()
    for (const [id, item] of cases.entries()) {
      const started = performance.now()
      child.stdin.write(JSON.stringify({ id, audio: item.audio }) + '\n')
      const response = await iterator.next()
      assert(!response.done, 'Classifier exited early')
      const result = JSON.parse(response.value)
      assert.equal(result.id, id)
      assert.equal(result.confidence >= .93, item.laugh, item.name)
      console.log(JSON.stringify({ case: item.name, confidence: result.confidence, detected: result.confidence >= .93, ms: performance.now() - started }))
    }
  } finally { clearTimeout(timer); lines.close(); child.stdin.end(); child.kill() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
