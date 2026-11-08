// An isolated run of the production desktop capture and subtitle paths.
// Use the same local WAV and boundary metadata for both builds. No real microphone,
// settings profile, browser session or network provider is used.
import { _electron as electron } from 'playwright'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { watch } from 'node:fs'
import { access, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('Requires an Apple Silicon Mac.')
if (process.argv.length !== 7) throw Error('Usage: node scripts/benchmark-mac-live.mjs BUILD_MAIN WAV BOUNDARIES_JSON REPORT_JSON LABEL')
const [build, wav, boundaries, output, label] = process.argv.slice(2)
const paths = [build, wav, boundaries, output].map(value => resolve(value))
const [main, audio, metadata, reportPath] = paths
const fixture = JSON.parse(await readFile(metadata, 'utf8'))
const wavBytes = await readFile(audio)
const hash = createHash('sha256').update(wavBytes).digest('hex')
if (fixture.sha256 !== hash || !Array.isArray(fixture.speechFileEndsMs) || !fixture.speechFileEndsMs.length ||
    !Number.isFinite(fixture.durationMs) || fixture.durationMs < 1000 || fixture.durationMs > 180_000 ||
    fixture.speechFileEndsMs.some((value, index, all) => !Number.isFinite(value) ||
      value <= (all[index - 1] ?? 0) || value >= fixture.durationMs)) throw Error('Invalid fixture boundaries or checksum.')
const textTimes = process.env.JTL_BENCH_TEXT === '1' ? fixture.textRequestAtMs ?? [3900, 10500, 17200] : []
if (!Array.isArray(textTimes) || textTimes.some(value => !Number.isFinite(value) || value < 0 || value >= fixture.durationMs)) {
  throw Error('Invalid text request schedule.')
}

const runtime = join(homedir(), 'Library', 'Application Support', 'VocaLume', 'haas-ja')
const ggufName = 'HY-MT1.5-1.8B-Q4_K_M.gguf'
const model = join(homedir(), 'Library', 'Application Support', 'live-translate', 'models', 'gguf', ggufName)
await Promise.all([access(join(runtime, 'speech')), access(join(runtime, 'haas-q8.gguf')), access(model), access(main)])
const profile = await mkdtemp(join(tmpdir(), 'vocalume-mac-live-profile-'))
await mkdir(join(profile, 'models', 'gguf'), { recursive: true })
await symlink(model, join(profile, 'models', 'gguf', ggufName))
const settings = {
  uiLanguageChoice: 'en', isFirstRun: false, hasCompletedSetup: true, translationEngine: 'offline-hymt15',
  sttEngine: 'haas-ja-fast', sourceLanguage: 'ja', targetLanguage: 'zh', streamingIntervalMs: 800,
  audioSource: 'microphone', noiseSuppressionEnabled: process.env.JTL_BENCH_DENOISE === '1',
  slmKvCacheQuant: true, slmSpeculativeDecoding: false,
  ttsEnabled: false, virtualMicEnabled: false, draftSttEnabled: false, speakerDiarizationEnabled: false,
  adaptiveRoutingEnabled: false, cloudRealtimeEnabled: false, geminiLiveEnabled: false
}
await writeFile(join(profile, 'config.json'), JSON.stringify(settings))
const report = { label, settings, fixture, status: 'starting', thermal: [], notices: [], finals: [], diagnostics: [], workMetrics: [], captionPhases: [] }
const runtimeLogCounts = { previewSttResults: 0, previewDeliveries: 0, finalDeliveries: 0 }
const command = promisify(execFile)
const measurePressure = process.env.JTL_BENCH_PRESSURE === '1'
const measureGpu = process.env.JTL_BENCH_GPU === '1'
const pressureSamples = []
async function sampleMacPressure() {
  const output = (path, args) => command(path, args, { timeout: 1200, maxBuffer: 32 * 1024 })
    .then(result => result.stdout, () => '')
  const [power, therm, vm] = await Promise.all([
    output('/usr/bin/pmset', ['-g']),
    output('/usr/bin/pmset', ['-g', 'therm']),
    output('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])
  ])
  const lowPower = /^\s*lowpowermode[ \t]+([01])[ \t]*$/im.exec(power)?.[1]
  const speed = /CPU_Speed_Limit\s*=\s*(\d+)/i.exec(therm)?.[1]
  return {
    at: Date.now(),
    lowPowerMode: lowPower == null ? null : lowPower === '1',
    speedLimitPercent: speed == null ? null : Number(speed),
    memoryPressure: { '1': 'nominal', '2': 'warning', '4': 'critical' }[vm.trim()] ?? 'unknown'
  }
}
async function sampleMacResources(rootPid) {
  const [processes, power, gpu] = await Promise.allSettled([
    command('/bin/ps', ['-Ao', 'pid=,ppid=,%cpu=,rss=,comm='], { timeout: 1000, maxBuffer: 2 * 1024 * 1024 }),
    command('/usr/sbin/ioreg', ['-r', '-c', 'AppleSmartBattery', '-l'], { timeout: 1000, maxBuffer: 2 * 1024 * 1024 }),
    measureGpu ? command('/usr/sbin/ioreg', ['-r', '-c', 'IOAccelerator', '-l'], { timeout: 1000, maxBuffer: 2 * 1024 * 1024 })
      : Promise.resolve({ stdout: '' })
  ])
  const rows = processes.status === 'fulfilled' ? processes.value.stdout.trim().split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), cpu: Number(match[3]), rssKiB: Number(match[4]), name: match[5] }] : []
  }) : []
  const tree = new Set([rootPid])
  for (let size = 0; tree.size !== size;) {
    size = tree.size
    for (const row of rows) if (tree.has(row.parent)) tree.add(row.pid)
  }
  const descendants = rows.filter(row => tree.has(row.pid))
  const sum = key => descendants.reduce((total, row) => total + row[key], 0)
  const data = power.status === 'fulfilled' ? power.value.stdout : ''
  const gpuData = gpu.status === 'fulfilled' ? gpu.value.stdout : ''
  const field = (name, source = data) => {
    const value = source.match(new RegExp(`"${name}"\\s*=\\s*(\\d+)`))?.[1]
    return value == null ? null : Number(value)
  }
  return {
    at: Date.now(), appTreeCpu: descendants.length ? sum('cpu') : null,
    appTreeRssKiB: descendants.length ? sum('rssKiB') : null,
    haasChild: descendants.some(row => /\/speech$/.test(row.name)),
    inputPowerMw: field('SystemPowerIn'), inputCurrentMa: field('SystemCurrentIn'),
    inputVoltageMv: field('SystemVoltageIn'), inputAccumulatorCount: field('SystemPowerInAccumulatorCount'),
    externalConnected: data.match(/"ExternalConnected"\s*=\s*(Yes|No)/)?.[1] ?? null,
    isCharging: data.match(/"IsCharging"\s*=\s*(Yes|No)/)?.[1] ?? null,
    batteryTemperatureRaw: field('Temperature'),
    gpuRegistry: measureGpu ? {
      device: field('Device Utilization %', gpuData), renderer: field('Renderer Utilization %', gpuData),
      tiler: field('Tiler Utilization %', gpuData)
    } : undefined
  }
}
const recordDiagnostic = text => {
  if (report.diagnostics.length < 60 && text.trim()) report.diagnostics.push(text.trim().slice(0, 500))
}
const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null
}
const summarize = values => ({
  count: values.length, p50: quantile(values, 0.5), p95: quantile(values, 0.95),
  p99: quantile(values, 0.99), max: quantile(values, 1)
})
const rendererTiming = () => {
  const marks = { frames: [], longTasks: [], timer: [], visibility: document.visibilityState }
  let previous
  requestAnimationFrame(function sample(now) {
    if (previous !== undefined) marks.frames.push({ at: Date.now(), gap: now - previous })
    previous = now
    requestAnimationFrame(sample)
  })
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) marks.longTasks.push({ at: performance.timeOrigin + entry.startTime, gap: entry.duration })
    }).observe({ type: 'longtask' })
  }
  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    marks.timer.push({ at: Date.now(), gap: now - last })
    last = now
  }, 20)
  window.benchRendererTiming = marks
}
async function observeObsFrameOutput(executable, path) {
  const capture = { file: [], frames: [], writeMs: [] }
  const config = join(dirname(path), 'isolated-libobs')
  await mkdir(config)
  let previous = await readFile(path, 'utf8')
  const reader = spawn(resolve(executable), [path, config], { stdio: ['ignore', 'pipe', 'pipe'] })
  let running = true
  let problem = null
  reader.on('error', error => { problem = error })
  reader.on('exit', () => { running = false })
  reader.stderr?.on('data', value => recordDiagnostic(value.toString()))
  const lines = createInterface({ input: reader.stdout })
  lines.on('line', line => {
    const frame = /^VL_FRAME (\d+) (\d+) (\d+)$/.exec(line)
    if (frame) capture.frames.push({ at: Number(frame[1]), hash: frame[2], coloredPixels: Number(frame[3]) })
  })
  let reads = Promise.resolve()
  const watcher = watch(dirname(path), (_event, filename) => {
    if (filename && filename !== basename(path)) return
    const at = Date.now()
    reads = reads.then(async () => {
      const contents = await readFile(path, 'utf8')
      if (contents !== previous) {
        capture.file.push({ at, contents })
        previous = contents
      }
    }).catch(error => { problem = error })
  })
  const close = () => {
    watcher.close()
    lines.close()
    reader.kill('SIGTERM')
  }
  const deadline = Date.now() + 10_000
  while (!capture.frames.length && running && !problem && Date.now() < deadline) await delay(50)
  if (!capture.frames.length || problem) {
    close()
    throw problem ?? Error('OBS test renderer did not produce an initial frame.')
  }
  return { capture, close }
}
const stopStates = new Set(['serious', 'critical'])
let app
let obsOutput
try {
  app = await electron.launch({
    args: [fileURLToPath(new URL('../e2e/isolated-bootstrap.cjs', import.meta.url)),
      '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    env: { ...process.env, JTL_UI_PROFILE: profile, JTL_UI_BUILD: main, SKIP_ONBOARDING: '1' },
    timeout: 20_000
  })
  app.process().stderr?.on('data', value => recordDiagnostic(value.toString()))
  let stdoutTail = ''
  app.process().stdout?.on('data', value => {
    const lines = (stdoutTail + value.toString()).split('\n')
    stdoutTail = lines.pop() ?? ''
    for (const line of lines) {
      const work = line.match(/Caption work:\s*(\{.*\})$/)?.[1]
      if (work) {
        try { report.workMetrics.push(JSON.parse(work)) } catch { /* An incomplete log is not a measurement. */ }
      }
      const timing = line.match(/Caption timing: final audio to source (\d+)ms, (?:queue (\d+)ms, translation (\d+)ms|source to translation (\d+)ms)/)
      if (timing) report.captionPhases.push({
        finalToSourceMs: Number(timing[1]), queueMs: timing[2] == null ? null : Number(timing[2]),
        translationMs: Number(timing[3] ?? timing[4])
      })
      const obsTiming = line.match(/^\[OBS\] Caption file ready in (\d+)ms$/)
      if (obsTiming) report.obs?.writeMs.push(Number(obsTiming[1]))
      if (line.includes('[pipeline:stream] STT:')) runtimeLogCounts.previewSttResults++
      if (line.includes('[audio] streaming:')) runtimeLogCounts.previewDeliveries++
      if (line.includes('[audio] finalize:')) runtimeLogCounts.finalDeliveries++
      if (/haas|audio|pipeline|translation/i.test(line)) recordDiagnostic(line)
    }
  })
  const initialThermal = await app.evaluate(({ powerMonitor }) => powerMonitor.getCurrentThermalState())
  report.thermal.push({ at: Date.now(), state: initialThermal })
  if (stopStates.has(initialThermal)) throw Error(`Start deferred due to thermal state: ${initialThermal}.`)
  await app.evaluate(({ app, BrowserWindow, powerMonitor }) => {
    const times = { samples: [], thermal: [], speedLimits: [] }
    globalThis.benchMacLive = times
    powerMonitor.on('thermal-state-change', value => times.thermal.push({ at: Date.now(), state: value.state }))
    powerMonitor.on('speed-limit-change', value => times.speedLimits.push({ at: Date.now(), limit: value.limit }))
    const preventTimerThrottle = window => window.webContents.setBackgroundThrottling(false)
    for (const window of BrowserWindow.getAllWindows()) preventTimerThrottle(window)
    app.on('browser-window-created', (_event, window) => preventTimerThrottle(window))
    let last = performance.now()
    setInterval(() => {
      const now = performance.now()
      times.samples.push({ at: Date.now(), gap: now - last })
      last = now
    }, 20).unref()
  })
  const settingsWindow = await app.firstWindow()
  await settingsWindow.waitForLoadState('domcontentloaded')
  const windowsDeadline = Date.now() + 8_000
  let subtitlePage
  while (Date.now() < windowsDeadline) {
    subtitlePage = app.windows().find(page => page.url().endsWith('#/subtitle'))
    if (subtitlePage) break
    await delay(100)
  }
  const settingsPage = app.windows().find(page => !page.url().endsWith('#/subtitle')) ?? settingsWindow
  const speechStarts = []
  let vadReady = null
  let noiseFilterReady = false
  settingsPage.on('console', message => {
    const text = message.text()
    recordDiagnostic(text)
    if (text.includes('Detected real speech start')) speechStarts.push(Date.now())
    if (text.includes('started micVAD')) vadReady = Date.now()
    if (text.includes('DeepFilterNet3 initialized at')) noiseFilterReady = true
  })
  settingsPage.on('pageerror', error => recordDiagnostic(error.message))
  if (!subtitlePage) throw Error('Subtitle renderer did not open.')
  await subtitlePage.waitForLoadState('domcontentloaded')
  await Promise.all([settingsPage.evaluate(rendererTiming), subtitlePage.evaluate(rendererTiming)])
  await settingsPage.evaluate(async ({ wavBase64, textTimes, sampleRate }) => {
    const marks = { mic: 0, finals: [], interim: [], status: [] }
    window.benchMacLive = marks
    const context = new AudioContext(sampleRate ? { sampleRate } : undefined)
    const bytes = Uint8Array.from(atob(wavBase64), char => char.charCodeAt(0))
    const audio = await context.decodeAudioData(bytes.buffer)
    const destination = context.createMediaStreamDestination()
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!constraints?.audio) throw Error('Fixture only supplies audio.')
      if (!marks.mic) {
        await context.resume()
        const source = context.createBufferSource()
        source.buffer = audio
        source.connect(destination)
        marks.mic = Date.now()
        source.start()
        if (textTimes.length) {
          const text = '先週、友人から古い写真が届きました。写真に写っていたのは、昔住んでいた町にある小さな公園です。夕方になると、よくそこを歩きながら翌日の予定を考えました。'
          const endings = ['今年は駅前の店に行きます。', '明日は町の図書館に行きます。', '来月は友人に会いに行きます。']
          marks.text = []
          for (const [index, at] of textTimes.entries()) {
            setTimeout(async () => {
              const start = Date.now()
              try {
                const suffix = index < endings.length ? endings[index] : `また${index + 1}日に連絡します。`
                const result = await window.api.translateText(text + suffix, 'ja', 'zh')
                if (!result?.trim()) throw Error('Empty text translation.')
                marks.text.push({ at, completed: true, elapsed: Date.now() - start, translation: result })
              } catch (error) {
                marks.text.push({ at, completed: false, elapsed: Date.now() - start, error: String(error) })
              }
            }, at)
          }
        }
      }
      return destination.stream
    }
    window.api.onStatusUpdate(text => marks.status.push(text))
    window.api.onTranslationResult(value => {
      if (!value.isInterim && value.translatedText) marks.finals.push({ ...value, receivedAt: Date.now() })
    })
    window.api.onInterimResult(value => marks.interim.push({ at: Date.now(), source: value.sourceText }))
  }, { wavBase64: wavBytes.toString('base64'), textTimes, sampleRate: fixture.mediaStreamSampleRate })
  await subtitlePage.evaluate(() => {
    const entries = []
    window.benchMacLive = entries
    let previous = ''
    new MutationObserver(() => {
      const text = document.body.innerText.trim()
      if (text !== previous) {
        entries.push({ at: Date.now(), text })
        previous = text
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  if (process.env.JTL_BENCH_OBS_FRAME_READER) {
    const result = await settingsPage.evaluate(() => window.api.configureObsCaptions('bilingual'))
    if (result.error || result.mode !== 'bilingual') throw Error('VocaLume did not enable bilingual OBS output.')
    obsOutput = await observeObsFrameOutput(process.env.JTL_BENCH_OBS_FRAME_READER, result.path)
    report.obs = obsOutput.capture
  }
  const start = settingsPage.locator('button[aria-label="Start translation"]')
  await start.waitFor({ state: 'attached', timeout: 8_000 })
  const startedAt = Date.now()
  await start.click({ timeout: 5_000 })
  let captureStarted = 0
  const resources = []
  const macResources = []
  for (;;) {
    const now = Date.now()
    if (!captureStarted) captureStarted = await settingsPage.evaluate(() => window.benchMacLive.mic)
    const system = await app.evaluate(({ app, powerMonitor }) => ({
      at: Date.now(), state: powerMonitor.getCurrentThermalState(),
      processes: app.getAppMetrics().map(process => ({
        type: process.type, rssKiB: process.memory.workingSetSize, cpu: process.cpu.percentCPUUsage
      }))
    }))
    resources.push(system)
    if (stopStates.has(system.state)) throw Error(`Stopped due to thermal state: ${system.state}.`)
    if (resources.length % 2 === 1) macResources.push(await sampleMacResources(app.process().pid))
    if (measurePressure && resources.length % 10 === 1) {
      const pressure = await sampleMacPressure()
      pressureSamples.push(pressure)
      if (pressure.memoryPressure === 'critical') throw Error('Stopped due to critical memory pressure.')
    }
    if (captureStarted && now >= captureStarted + fixture.durationMs + 1500) break
    if (!captureStarted && now >= startedAt + 30_000) {
      const status = await settingsPage.evaluate(() => document.body.innerText.slice(-600))
      throw Error(`Capture did not start. ${status}`)
    }
    await delay(800)
  }
  const stop = settingsPage.locator('button[aria-label="Stop translation"]')
  if (obsOutput) report.obs.stopRequestedAt = Date.now()
  if (await stop.count()) await stop.click({ timeout: 5_000 })
  await delay(obsOutput ? 2500 : 500)
  const timing = await settingsPage.evaluate(() => ({ ...window.benchMacLive, render: window.benchRendererTiming }))
  const overlay = await subtitlePage.evaluate(() => ({ entries: window.benchMacLive, render: window.benchRendererTiming }))
  const mainTiming = await app.evaluate(() => globalThis.benchMacLive)
  const captureEnd = captureStarted + fixture.durationMs
  report.captureStartedAt = captureStarted
  report.captureStartupMs = captureStarted - startedAt
  report.thermal.push(...mainTiming.thermal, ...resources.map(({ at, state }) => ({ at, state })))
  if (measurePressure) report.speedLimitEvents = mainTiming.speedLimits
  report.notices = timing.status
  report.resources = resources
  report.macResources = macResources
  report.finals = timing.finals.map(({ sourceText, translatedText, timestamp, receivedAt }) => ({
    sourceText, translatedText, engineAt: timestamp - captureStarted, rendererAt: receivedAt - captureStarted,
    subtitleDomAt: (overlay.entries.find(entry => entry.at >= timestamp && entry.text.includes(translatedText))?.at ?? NaN) - captureStarted
  }))
  const sessionGaps = samples => samples.filter(({ at }) => at >= captureStarted && at <= captureEnd).map(({ gap }) => gap)
  report.mainEventLoopGapMs = summarize(sessionGaps(mainTiming.samples))
  report.rendererEventLoopGapMs = summarize(sessionGaps(timing.render.timer))
  report.renderers = Object.fromEntries([['settings', timing.render], ['subtitle', overlay.render]].map(([name, render]) => {
    const frames = sessionGaps(render.frames)
    return [name, {
      visibility: render.visibility, frameGapsMs: summarize(frames), framesOver33Ms: frames.filter(value => value > 33.34).length,
      longTasksMs: summarize(sessionGaps(render.longTasks)), timerGapsMs: summarize(sessionGaps(render.timer))
    }]
  }))
  report.interimEvents = timing.interim.length
  report.runtimeLogCounts = runtimeLogCounts
  report.sourceInterim = timing.interim.map(({ at, source }) => ({ at: at - captureStarted, source }))
  report.speechStartsMs = speechStarts.map(at => at - captureStarted)
  report.vadReadyMs = vadReady == null ? null : vadReady - captureStarted
  report.noiseFilterReady = noiseFilterReady
  report.textRequests = timing.text
  report.status = report.finals.length ? 'completed' : 'no-final-captions'
  if (report.status !== 'completed') process.exitCode = 1
} catch (error) {
  report.status = 'failed-or-stopped'
  report.error = String(error)
  process.exitCode = 1
} finally {
  obsOutput?.close()
  await app?.close().catch(() => {})
  if (measurePressure) report.pressure = pressureSamples
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
}
