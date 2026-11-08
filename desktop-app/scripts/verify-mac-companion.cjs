/** Exercise a packaged Mac runtime and real native capture lock without models. */
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { createServer } = require('node:net')
const { join, resolve } = require('node:path')
const { createInterface } = require('node:readline')
const { installMac } = require('../../extension/desktop/install-mac.cjs')
const { decoder, endpoint } = require('../../extension/desktop/windows-host.cjs')

async function verify() {
  assert.equal(process.platform, 'darwin')
  const bundle = resolve(process.argv[2])
  const app = join(bundle, 'Contents/MacOS/VocaLume')
  const helper = join(bundle, 'Contents/Resources/bridge-scripts/bin/capture-claim-helper')
  const { claimMacCapture } = await import('../../extension/desktop/capture-lease.mjs')
  const fixture = await mkdtemp('/tmp/vl-native-')
  const children = new Set(), sockets = new Set()
  let server, externalRelease
  const extensionId = 'b'.repeat(32)
  const send = (stream, value) => {
    const payload = Buffer.from(JSON.stringify(value))
    const header = Buffer.alloc(4)
    header.writeUInt32LE(payload.length)
    stream.write(Buffer.concat([header, payload]))
  }
  function openHost(launcher) {
    const child = spawn(launcher, [`chrome-extension://${extensionId}/`], { stdio: 'pipe' })
    children.add(child)
    const replies = new Map()
    let stderr = '', failure
    child.stdout.on('data', decoder(message => {
      const pending = replies.get(message.id)
      if (!pending || message.progress || message.event) return
      replies.delete(message.id)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(new Error(message.error))
    }))
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    const fail = error => {
      failure = error
      for (const pending of replies.values()) pending.reject(error)
      replies.clear()
    }
    child.once('error', fail)
    child.once('exit', () => fail(new Error('Native host exited: ' + stderr)))
    child.stdin.on('error', fail)
    return {
      request(op, fields = {}) {
        return new Promise((resolveReply, reject) => {
          if (failure) { reject(failure); return }
          const id = ++sequence
          replies.set(id, { resolve: resolveReply, reject })
          send(child.stdin, { id, op, ...fields })
        })
      },
      async close() {
        if (child.exitCode !== null || child.signalCode !== null) return
        const exited = once(child, 'exit')
        child.stdin.end()
        await exited
      }
    }
  }
  let sequence = 0
  const timeout = setTimeout(() => {
    for (const child of children) child.kill()
    console.error('Mac native messaging smoke test timed out')
    process.exitCode = 1
  }, 15000)
  try {
    const launcher = installMac({ extensionId, app, home: fixture })
    const manifest = JSON.parse(await readFile(join(fixture, 'Library/Application Support/Google/Chrome/NativeMessagingHosts/org.jtl.companion.json'), 'utf8'))
    assert.equal(manifest.path, launcher)
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${extensionId}/`])
    const socketPath = endpoint(join(fixture, 'Library/Application Support/JapaneseLiveCaption'), 'darwin')
    const claimPath = socketPath + '-capture'
    const first = openHost(launcher)
    const second = openHost(launcher)
    assert.deepEqual(await first.request('status', { launch: false }), { captureActive: false, desktopUI: false })
    assert.deepEqual(await first.request('browser-claim', { subscription: 'first', launch: false }), { role: 'browser', coordinated: true })
    assert.equal(await claimMacCapture(helper, claimPath), null, 'the App cannot acquire a browser-owned capture')
    assert.deepEqual(await second.request('browser-claim', { subscription: 'second', launch: false }), { role: 'busy', coordinated: false })
    await first.close()
    // Wait briefly for the helper to observe EOF after a browser crash/exit.
    for (let attempt = 0; !externalRelease && attempt < 10; attempt++) {
      externalRelease = await claimMacCapture(helper, claimPath)
      if (!externalRelease) await new Promise(done => setTimeout(done, 30))
    }
    assert.equal(typeof externalRelease, 'function')
    assert.deepEqual(await second.request('browser-claim', { subscription: 'second', launch: false }), { role: 'busy', coordinated: false })
    const original = '日本語の国を紹介します。'
    const translated = '介紹日本的國家。'
    server = createServer(socket => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      createInterface({ input: socket }).on('line', line => {
        const message = JSON.parse(line)
        const result = message.op === 'browser-claim' && message.launch === false
          ? { role: 'shared', subscription: message.subscription }
          : message.op === 'translate' ? { text: translated } : { text: original, pending: true }
        socket.write(JSON.stringify({ id: message.id, ok: true, result }) + '\n')
      })
    })
    server.listen(socketPath)
    await once(server, 'listening')
    assert.deepEqual(await second.request('browser-claim', { subscription: 'second', launch: false }),
      { role: 'shared', subscription: 'second' })
    assert.deepEqual(await second.request('decode'), { text: original, pending: true })
    assert.deepEqual(await second.request('translate', { direction: 'ja-zh', text: original }), { text: translated })
    await second.close()
    console.log('Packaged Mac host: registration, no-launch browser capture, capture exclusivity, mirror and draft transport passed')
  } finally {
    clearTimeout(timeout)
    externalRelease?.()
    for (const child of children) child.kill()
    for (const socket of sockets) socket.destroy()
    server?.close()
    await rm(fixture, { recursive: true, force: true })
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
