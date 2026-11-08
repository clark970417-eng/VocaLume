import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const requireDesktop = createRequire(new URL('../desktop-app/package.json', import.meta.url))
const phrases = [
  ['今日はいい天気ですね。', /いい天気ですね/u, /天氣.*好/u],
  ['猫が窓のそばで寝ています。', /猫.*窓.*寝ています/u, /(?=.*貓)(?=.*睡)/u],
  ['明日は東京へ行きます。', /東京.*行きます/u, /(?=.*東京)(?=.*去)/u],
]

function fixtureAudio(testDirectory) {
  const ffmpeg = requireDesktop('ffmpeg-static')
  return phrases.map(([sentence], index) => {
    const input = join(testDirectory, `speech-${index}.aiff`)
    const output = join(testDirectory, `speech-${index}.wav`)
    execFileSync('/usr/bin/say', ['-v', 'Kyoko', '-o', input, sentence])
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', input, '-af', 'adelay=200:all=1,apad=pad_dur=2.2', '-ar', '48000', output])
    return readFileSync(output)
  })
}

const log = (label, details) => console.log(label, JSON.stringify(details))

async function waitUntil(timeoutMs, description, inspect) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const value = await inspect()
    if (value) return value
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

export async function runDualLiveIntegration(testDirectory, extensionDirectory) {
  const { chromium } = requireDesktop('playwright')
  const extension = realpathSync(extensionDirectory)
  const extensionId = createHash('sha256').update(extension).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)))
  const fixtures = fixtureAudio(testDirectory)
  const contexts = []
  const streams = []

  const health = ({ popup }) => popup.evaluate(async () => {
    const reply = await chrome.runtime.sendMessage({ type: 'health' })
    if (!reply?.ok) throw new Error(reply?.error || 'Could not read capture status')
    return reply.text
  })
  const control = ({ popup, tabId }, action) => popup.evaluate(({ action, tabId }) =>
    chrome.runtime.sendMessage({ type: 'subtitle-control', action, tabId }), { action, tabId })
  const play = ({ page }, index) => page.locator('video').evaluate(async (video, index) => {
    video.src = `/fixture-${index}.wav`
    await video.play()
    return Date.now()
  }, index)
  const observe = ({ page }) => page.locator('#jtl-subtitles.jtl-visible').evaluateAll(elements =>
    elements[0]?.innerText.trim() || '')
  const match = (caption, index) => {
    const [original, translation] = caption.split('\n')
    const [, source, target] = phrases[index]
    return source.test(original) && target.test(translation || '')
  }

  try {
    for (let index = 0; index < 2; index++) {
      const context = await chromium.launchPersistentContext(join(testDirectory, String(index)), {
        headless: true,
        executablePath: process.env.VOCALUME_TEST_CHROMIUM || chromium.executablePath(),
        ignoreDefaultArgs: ['--mute-audio'],
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
          '--enable-unsafe-webgpu',
          `--allowlisted-extension-id=${extensionId}`,
          '--autoplay-policy=no-user-gesture-required',
        ],
      })
      contexts.push(context)
      const url = `https://www.youtube.com/watch?v=vocalume-test-stream-${index + 1}`
      // Serve the test player locally while allowing the real YouTube content script to run.
      await context.route('https://www.youtube.com/**', route => {
        const requestUrl = route.request().url()
        if (requestUrl === url) {
          return route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><meta charset="utf-8"><title>VocaLume test fixture</title><div id="movie_player"><video controls loop></video></div>',
          })
        }
        const index = /^\/fixture-([0-2])\.wav$/.exec(new URL(requestUrl).pathname)?.[1]
        if (index !== undefined) return route.fulfill({ contentType: 'audio/wav', body: fixtures[Number(index)] })
        return route.abort()
      })
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
      assert.equal(new URL(worker.url()).hostname, extensionId)
      await worker.evaluate(() => chrome.storage.local.set({
        'vocalume.uiLanguage': 'zh-TW',
        speechMode: 'browser',
        subtitleSettings: { captionMode: 'realtime', holdSeconds: 6 },
        languageSettings: { speechSource: 'ja', speechTarget: 'zh' },
      }))
      const popup = await context.newPage()
      await popup.goto(new URL('popup.html', worker.url()).href)
      const page = await context.newPage()
      await page.goto(url)
      const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url)?.id, url)
      assert(Number.isInteger(tabId), 'Could not find the fixture tab')
      streams.push({ page, popup, tabId })
    }

    const started = await Promise.all(streams.map(stream => control(stream, 'start')))
    for (const [index, result] of started.entries()) {
      assert(result?.ok && result.text.running, `Capture ${index + 1} failed to start: ${result?.error || 'unknown error'}`)
    }
    console.log('Waiting for the two Whisper speech models…')
    const ready = await waitUntil(300_000, 'both speech models', async () => {
      const statuses = await Promise.all(streams.map(health))
      for (const status of statuses) assert(status.running, status.lastError || status.modelStatus)
      return statuses.every(status => status.diagnostics.ready) && statuses
    })
    log('Models ready', ready.map(status => [status.diagnostics.model, status.diagnostics.dtype]))

    const began = await Promise.all(streams.map(play))
    const completed = [null, null]
    await waitUntil(75_000, 'both complete, independently translated subtitles', async () => {
      const captions = await Promise.all(streams.map(observe))
      for (const [index, caption] of captions.entries()) {
        assert(!match(caption, 1 - index), 'A translation appeared in the wrong stream')
        if (!completed[index] && match(caption, index)) {
          completed[index] = { caption, elapsedMs: Date.now() - began[index] }
        }
      }
      return completed.every(Boolean)
    })
    assert((await Promise.all(streams.map(health))).every(status => status.running))
    log('Two streams', completed)

    const stopped = await control(streams[0], 'stop')
    assert(stopped?.ok && !stopped.text.running, 'First capture did not stop')
    await waitUntil(3_000, 'the stopped overlay to clear', async () => !(await observe(streams[0])))
    const resumedAt = await play(streams[1], 2)
    const continued = await waitUntil(45_000, 'new audio to translate in the remaining stream', async () => {
      const [first, second] = await Promise.all(streams.map(observe))
      assert.equal(first, '', 'The stopped stream showed a subtitle again')
      return match(second, 2) && second
    })
    const statuses = await Promise.all(streams.map(health))
    assert.deepEqual(statuses.map(status => status.running), [false, true])
    log('Stop isolation passed', { caption: continued, elapsedMs: Date.now() - resumedAt })
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()))
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/dual-live-e2e.mjs\nmacOS. See docs/quality/dual-live-e2e.md for setup.')
    return
  }
  assert.equal(process.platform, 'darwin', 'This test uses macOS synthetic speech')
  const testDirectory = mkdtempSync(join(tmpdir(), 'vocalume-dual-live-'))
  try {
    // A fresh extension ID and fresh profiles keep the test independent of existing browser/App connections.
    const extension = join(testDirectory, 'extension')
    cpSync(fileURLToPath(new URL('../extension/', import.meta.url)), extension, { recursive: true })
    await runDualLiveIntegration(testDirectory, extension)
  } finally {
    rmSync(testDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => { console.error(error); process.exitCode = 1 })
}
