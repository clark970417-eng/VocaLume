// Run with node_modules/electron/dist/electron.exe after npm run build.
// --same-process reproduces the observed load-order problem; default is isolated.
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'vocalume-native-smoke-')))
app.whenReady().then(async () => {
  require('@kutalia/whisper-node-addon')
  const start = performance.now()
  if (process.argv.includes('--same-process')) {
    try {
      const { getLlama } = await import('node-llama-cpp')
      const llama = await getLlama({ gpu: 'auto', build: 'never', skipDownload: true })
      console.log(JSON.stringify({ mode: 'same-process', devices: await llama.getGpuDeviceNames() }))
      app.exit(0)
    } catch (error) { console.error(error.message); app.exit(1) }
    return
  }
  let last = start, maxGap = 0
  const heartbeat = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now }, 20)
  const child = utilityProcess.fork(join(__dirname, '../../out/main/gpu-probe.js'), [], { stdio: 'ignore' })
  const timer = setTimeout(() => { clearInterval(heartbeat); child.kill(); app.exit(1) }, 15000)
  child.on('message', reply => {
    clearTimeout(timer); clearInterval(heartbeat)
    console.log(JSON.stringify({ whisperLoaded: true, reply, elapsedMs: Math.round(performance.now() - start), mainLoopMaxGapMs: Math.round(maxGap) }))
    child.kill(); app.exit(Array.isArray(reply.gpuNames) ? 0 : 1)
  })
}).catch(error => { console.error(error); app.exit(1) })
