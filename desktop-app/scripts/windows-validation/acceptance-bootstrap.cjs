const {app, utilityProcess}=require('electron'),path=require('node:path')
if(!process.env.JTL_UI_PROFILE||!path.isAbsolute(process.env.JTL_UI_PROFILE))throw new Error('An isolated acceptance profile is required')
app.setPath('userData',process.env.JTL_UI_PROFILE)
// Real companion/loopback initialization with disposable settings, rather than
// the UI-only test mode. No real user's settings or browser profile is reused.
delete process.env.JTL_UI_TEST
if (process.env.VOCALUME_REPLAY_MUTE_OUTPUT === '1') {
  app.on('browser-window-created', (_event, window) => window.webContents.setAudioMuted(true))
}
// Optional resource observation without a Node inspector session.
if (process.env.VOCALUME_REPLAY_COLLECT === '1') {
  const fs = require('node:fs')
  const output = path.join(process.env.JTL_UI_PROFILE, 'replay-metrics.ndjson')
  app.whenReady().then(() => {
    const takeSample = () => {
      const processes = app.getAppMetrics().map(({pid,type,cpu,memory}) => ({
        pid,type,cpuSeconds:cpu.cumulativeCPUUsage,privateKiB:memory.privateBytes,workingSetKiB:memory.workingSetSize
      }))
      fs.appendFileSync(output, JSON.stringify({ at: Date.now(), processes }) + '\n')
    }
    takeSample()
    const timer = setInterval(takeSample, 1000)
    timer.unref()
    app.once('will-quit', () => clearInterval(timer))
  })
}
const packagedResources = process.env.VOCALUME_OBS_PACKAGE_RESOURCES
if (packagedResources) {
  // Exercise the built Windows ASAR with the matching Electron runtime, while
  // overriding the profile before startup can touch normal user settings.
  Object.defineProperty(process, 'resourcesPath', { value: packagedResources })
  Object.defineProperty(app, 'isPackaged', { value: true })
}
const diagnostics = process.env.VOCALUME_OBS_WORKER_DIAGNOSTICS === '1'
if (packagedResources || diagnostics) {
  const fork = utilityProcess.fork.bind(utilityProcess)
  utilityProcess.fork = (entry, ...options) => {
    if (path.basename(entry) === 'sensevoice-worker.js') {
      const [args, settings] = options
      const worker = fork(entry, args || [], { ...settings, ...(diagnostics && { stdio: 'pipe' }) })
      if (diagnostics) {
        worker.stderr?.pipe(process.stderr)
        worker.stdout?.pipe(process.stdout)
      }
      const send = worker.postMessage.bind(worker)
      worker.postMessage = (message, ...transfer) => {
        // sherpa-onnx opens tokens with a native reader that can fail on the
        // DOS short path through this harness's model-directory junction.
        if (message.type === 'init' && message.modelsRoot) {
          message = { ...message, modelsRoot: require('node:fs').realpathSync.native(message.modelsRoot) }
        }
        send(message, ...transfer)
      }
      return worker
    }
    const worker = fork(entry, ...options)
    if (diagnostics && path.basename(entry) === 'slm-worker.js') {
      const send = worker.postMessage.bind(worker)
      worker.postMessage = (message, ...transfer) => {
        if (message.type === 'init') {
          // Resolve the acceptance profile's model junction before native GGUF
          // loading. The ordinary installed profile already uses the real path.
          message = { ...message, modelPath: require('node:fs').realpathSync.native(message.modelPath) }
          worker.once('message', result => {
            if (result.type === 'error') console.error('[acceptance] Offline init error:', result.message)
          })
        }
        return send(message, ...transfer)
      }
    }
    return worker
  }
}
require(packagedResources
  ? path.join(packagedResources, 'app.asar', 'out', 'main', 'index.js')
  : path.resolve(__dirname, '../../out/main/index.js'))
