import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'
import { mkdtempSync, readFileSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'

let app: ElectronApplication
let settingsWindow: Page

test.beforeAll(async () => {
  const profile = mkdtempSync(resolve(tmpdir(), 'jtl-ui-'))
  if (process.env.JTL_TEST_MODELS) symlinkSync(resolve(process.env.JTL_TEST_MODELS),resolve(profile,'models'),process.platform==='win32'?'junction':'dir')
  app = await electron.launch({
    args: [resolve(__dirname, 'isolated-bootstrap.cjs'), ...(process.env.JTL_TEST_MIC_FILE ? [
      '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
      '--use-file-for-fake-audio-capture='+resolve(process.env.JTL_TEST_MIC_FILE)
    ] : [])],
    env: {
      ...process.env,
      JTL_UI_PROFILE: profile,
      // Disable hardware acceleration in CI to avoid GPU issues
      ELECTRON_DISABLE_GPU: '1',
      // Skip Quick Start onboarding so the settings panel renders immediately
      SKIP_ONBOARDING: '1'
    }
  })

  // The app opens two windows: main (settings) and subtitle (transparent).
  // firstWindow() returns whichever opens first.
  const firstWin = await app.firstWindow()
  await firstWin.waitForLoadState('domcontentloaded')

  // Give time for both windows to finish opening
  await firstWin.waitForTimeout(2000)

  // Find the settings window by checking for h1 heading
  for (const win of app.windows()) {
    const headingCount = await win.locator('h1').count().catch(() => 0)
    if (headingCount > 0) {
      settingsWindow = win
      break
    }
  }

  // Fallback: use the first window if we couldn't identify the settings window
  if (!settingsWindow) {
    settingsWindow = firstWin
  }

  // The product may choose a different locale from the machine or IP region.
  // These settings tests use English labels. Language selection has its own spec.
  await settingsWindow.locator('.interface-language select').selectOption('en')
  await expect(settingsWindow.locator('html')).toHaveAttribute('lang', 'en')
})

test.afterAll(async () => {
  await app?.close()
})

async function openSection(name: string): Promise<void> {
  await settingsWindow.getByRole('tab', { name, exact: true }).click()
  await expect(settingsWindow.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}

test.describe('App launch', () => {
  test('should open the main window with correct title', async () => {
    const title = await settingsWindow.title()
    expect(title).toBeTruthy()
  })

  test('should display the settings panel heading', async () => {
    const heading = settingsWindow.locator('h1')
    await expect(heading).toHaveText('VocaLume')
  })

  test('should show status text', async () => {
    const bodyText = await settingsWindow.textContent('body')
    expect(bodyText).toBeTruthy()
  })
})

test.describe('Engine selection', () => {
  test('only shows Mac recognition and translation options when their resources are available', async () => {
    test.skip(process.platform !== 'darwin')
    await openSection('Live translation')
    await settingsWindow.getByRole('combobox', { name: 'Source language' }).selectOption('auto')
    await openSection('Models')
    const macEngines = await settingsWindow.evaluate(async () => {
      return (await window.api.getSettings()).macEngines as {
        appleSilicon: boolean
        appleSpeech: boolean
        appleTranslate: boolean
        qwenAsr: boolean
        speakerIdentification: boolean
        haasJa: boolean
      }
    })
    const speech = settingsWindow.getByRole('combobox', { name: 'STT engine' })
    await expect(speech.locator('option[value="mlx-whisper"]')).toHaveCount(Number(macEngines.appleSilicon))
    await expect(speech.locator('option[value="kotoba-whisper"]')).toHaveCount(Number(macEngines.appleSilicon))
    await expect(speech.locator('option[value="apple-speech-transcriber"]')).toHaveCount(Number(macEngines.appleSpeech))
    await expect(speech.locator('option[value="qwen3-asr"]')).toHaveCount(Number(macEngines.qwenAsr))
    await expect(settingsWindow.getByText('Apple Translate', { exact: true })).toHaveCount(Number(macEngines.appleTranslate))
    await settingsWindow.getByText('Recognition corrections & speakers', { exact: true }).click()
    await expect(settingsWindow.getByRole('checkbox', { name: 'Enable speaker identification' })).toHaveCount(Number(macEngines.speakerIdentification))

    await openSection('Live translation')
    await settingsWindow.getByRole('combobox', { name: 'Source language' }).selectOption('ja')
    await openSection('Models')
    await expect(speech.locator('option[value="haas-ja-fast"]')).toHaveCount(Number(macEngines.haasJa))
    if (macEngines.appleSilicon) await expect(speech).toHaveValue(macEngines.haasJa ? 'haas-ja-fast' : 'kotoba-whisper')
    await openSection('Live translation')
    await settingsWindow.getByRole('combobox', { name: 'Source language' }).selectOption('auto')
  })

  test('should display translation engine radio options', async () => {
    await openSection('Models')

    // Use the radiogroup to scope selectors and avoid strict mode violations
    const engineGroup = settingsWindow.locator('[role="radiogroup"]')
    await expect(engineGroup).toBeVisible()

    // Verify key engine radio inputs exist. Post-#702 the UI is capped at
    // Auto / HY-MT 1.5 / Hunyuan-MT 7B / Online (+ Apple Translate on macOS).
    const radios = engineGroup.locator('input[name="engine"]')
    const count = await radios.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('should allow selecting a different translation engine', async () => {
    await openSection('Models')

    // Select the always-present Hunyuan-MT 7B radio by its unique label text.
    const engineGroup = settingsWindow.locator('[role="radiogroup"]')
    const qualityRadio = engineGroup.locator('label').filter({ hasText: 'Hunyuan-MT 7B' }).locator('input[type="radio"]')
    // dispatchEvent instead of click(): selecting this engine mounts the LLM
    // sub-options subtree, and on the slow GPU-disabled CI runner Playwright's
    // post-click navigation/stability wait can hang for the full action timeout.
    // Dispatching the click directly checks the radio and fires React's onChange
    // without that wait.
    await qualityRadio.dispatchEvent('click')
    await expect(qualityRadio).toBeChecked()
  })

  test('should show STT engine selector', async () => {
    await openSection('Models')

    const sttSelect = settingsWindow.locator('[aria-label="STT engine"]')
    await expect(sttSelect).toBeVisible()

    // Should have at least whisper-local and moonshine options
    const options = sttSelect.locator('option')
    const count = await options.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

test.describe('Start/Stop pipeline', () => {
  test('should have a start button', async () => {
    const startBtn = settingsWindow.locator('button[aria-label="Start translation"]')
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toContainText('Start')
  })

  test('should show Starting state when clicked', async () => {
    test.skip(process.env.JTL_AUDIO_TEST !== '1', 'Set JTL_AUDIO_TEST=1 for an explicit audio-device test')
    if (process.env.JTL_TEST_MODELS) {
      await openSection('Models')
      await settingsWindow.locator('[role="radiogroup"] label').filter({hasText:'HY-MT 1.5 (Offline default)'}).locator('input').check()
    }
    const startBtn = settingsWindow.locator('button[aria-label="Start translation"]')
    await startBtn.click()

    // The button text should change to "Starting..." briefly.
    // The pipeline will likely fail (no models downloaded), but we verify
    // the UI reacts to the click.
    await settingsWindow.waitForTimeout(500)

    // After clicking, the button shows either "Starting..." or "Stop" or has reverted on error
    const btnLocator = settingsWindow.locator('button').filter({ hasText: /Starting|Stop|Start/ })
    const buttonText = await btnLocator.first().textContent()
    expect(buttonText).toBeTruthy()

    // If pipeline actually started, stop it to clean up
    const stopBtn = settingsWindow.locator('button[aria-label="Stop translation"]')
    if (process.env.JTL_TEST_MODELS) await expect(stopBtn).toBeVisible({timeout:60000})
    if (await stopBtn.isVisible().catch(() => false)) {
      await stopBtn.click()
      // Wait for stop to complete
      await settingsWindow.locator('button[aria-label="Start translation"]').waitFor({
        state: 'visible',
        timeout: 10_000
      })
    }
  })
})

test.describe('Settings persistence', () => {
  test('should have microphone selector', async () => {
    await openSection('Live translation')
    const micSelect = settingsWindow.locator('[aria-label="Microphone device"]')
    await expect(micSelect).toBeVisible()
  })

  test('should show config summary panel', async () => {
    await openSection('Models')
    // The config summary shows Speech Recognition, Translation, and Language labels
    await expect(settingsWindow.locator('text=Speech Recognition').first()).toBeVisible()
    await expect(settingsWindow.locator('text=Translation').first()).toBeVisible()
    await expect(settingsWindow.locator('#settings-panel-models').getByText('Language', {exact: true})).toBeVisible()
  })

  test('should have language selectors directly on the translate page', async () => {
    await openSection('Live translation')

    const sourceSelect = settingsWindow.locator('[aria-label="Source language"]')
    await expect(sourceSelect).toBeVisible()

    const targetSelect = settingsWindow.locator('[aria-label="Target language"]')
    await expect(targetSelect).toBeVisible()

    // Source language should default to auto
    await expect(sourceSelect).toHaveValue('auto')
  })

  test('should allow changing target language', async () => {
    await openSection('Live translation')

    const targetSelect = settingsWindow.locator('[aria-label="Target language"]')
    await expect(targetSelect).toBeVisible()
    await targetSelect.selectOption('ja')
    await expect(targetSelect).toHaveValue('ja')
  })
})

test.describe('Window management', () => {
  test('should open two windows (main + subtitle)', async () => {
    const windows = app.windows()
    expect(windows.length).toBeGreaterThanOrEqual(2)
  })

  test('should be able to evaluate in main process', async () => {
    // Verify we can communicate with the Electron main process
    const appPath = await app.evaluate(async ({ app }) => {
      return app.getAppPath()
    })
    expect(appPath).toBeTruthy()
    expect(typeof appPath).toBe('string')
  })

  test('OBS-only keeps the caption file and releases the floating window', async () => {
    const hasOverlay = () => app.windows().some(window => window.url().endsWith('#/subtitle'))
    await openSection('Subtitles & OBS')
    await settingsWindow.getByText('OBS live captions', { exact: true }).click()
    const output = settingsWindow.getByRole('combobox', { name: 'OBS caption output', exact: true })
    await output.selectOption('bilingual')
    const path = await settingsWindow.getByLabel('OBS caption file path').inputValue()
    expect(readFileSync(path, 'utf8')).toBe('')

    const hide = settingsWindow.getByRole('checkbox', { name: 'Hide desktop subtitles while using OBS' })
    await hide.check()
    await expect.poll(hasOverlay).toBe(false)
    await expect(output).toHaveValue('bilingual')
    expect(readFileSync(path, 'utf8')).toBe('')

    await output.selectOption('off')
    await expect.poll(hasOverlay).toBe(true)
  })

  test('Windows caption modes hold one or rotate four completed translations', async () => {
    test.skip(process.platform !== 'win32', 'Windows caption modes')
    await openSection('Subtitles & OBS')
    const mode = settingsWindow.getByRole('combobox', { name: 'Caption mode' })
    await expect(mode).toHaveValue('realtime')
    const overlay = app.windows().find(window => window.url().endsWith('#/subtitle'))!
    await expect(overlay.getByRole('region', { name: 'Subtitles' })).toBeAttached()
    const send = async (number: number, channel = 'translation-result'): Promise<void> => {
      await app.evaluate(({ BrowserWindow }, { number, channel }) => {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/subtitle'))!
        win.webContents.send(channel, { sourceText: 'Source ' + number, translatedText: 'Translation ' + number, timestamp: number })
      }, { number, channel })
    }
    const card = overlay.locator('[aria-live="polite"]').locator('..')
    await send(1)
    await expect(card.getByText('Translation 1', { exact: true })).toBeAttached()
    await send(2, 'draft-result')
    await expect(card.getByText('Translation 2', { exact: true })).toHaveCount(0)
    await expect(card).toHaveCSS('opacity', '0', { timeout: 5000 })

    await mode.selectOption('record')
    await expect.poll(() => settingsWindow.evaluate(async () =>
      (await window.api.getSettings()).subtitleSettings
    )).toMatchObject({ captionMode: 'record' })
    await expect(card).toHaveCSS('opacity', '1')
    for (let number = 2; number <= 5; number++) await send(number)
    await expect(card.getByText(/^Translation [2-5]$/)).toHaveCount(4)
    await expect(card.getByText('Translation 1', { exact: true })).toHaveCount(0)
    await mode.selectOption('realtime')
    await expect(card.getByText(/^Translation [1-5]$/)).toHaveCount(1)
    await expect(card.getByText('Translation 5', { exact: true })).toBeAttached()
  })

  test('optionally hides floating captions near the pointer and restores the latest text', async () => {
    await openSection('Subtitles & OBS')
    const toggle = settingsWindow.getByRole('checkbox', { name: 'Hide subtitles when the pointer is nearby' })
    await expect(toggle).not.toBeChecked()
    await toggle.check()

    const overlay = app.windows().find(window => window.url().endsWith('#/subtitle'))!
    const card = overlay.locator('[aria-live="polite"]').locator('..')
    await expect(card).toBeAttached()
    const restorePointer = await app.evaluateHandle(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/subtitle'))!
      const origin = win.getContentBounds()
      const getCursorScreenPoint = screen.getCursorScreenPoint
      const isVisible = win.isVisible
      screen.getCursorScreenPoint = () => ({ x: origin.x, y: origin.y })
      // Keep the isolated overlay off the user's display.
      win.isVisible = () => true
      win.webContents.send('translation-result', { sourceText: 'こんにちは', translatedText: '你好' })
      return () => {
        screen.getCursorScreenPoint = getCursorScreenPoint
        win.isVisible = isVisible
      }
    })
    try {
      await expect(card).toHaveCSS('opacity', '1')
      const bounds = (await card.boundingBox())!
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + (process.platform === 'win32' ? 5 : -5) }
      const movePointer = (position: { x: number; y: number }) => app.evaluate(({ BrowserWindow, screen }, pos) => {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/subtitle'))!
        const origin = win.getContentBounds()
        const zoom = win.webContents.getZoomFactor()
        screen.getCursorScreenPoint = () => ({ x: origin.x + pos.x * zoom, y: origin.y + pos.y * zoom })
      }, position)

      await movePointer(point)
      await expect(card).toHaveCSS('visibility', 'hidden')
      await expect(card).toHaveCSS('pointer-events', 'none')
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/subtitle'))!
        win.webContents.send('translation-result', { sourceText: 'こんばんは', translatedText: '晚上好' })
      })
      await expect(card).toContainText('晚上好')
      await expect(card).toHaveCSS('visibility', 'hidden')
      await movePointer({ x: 0, y: 0 })
      await expect(card).toHaveCSS('visibility', 'visible')
      await movePointer(point)
      await expect(card).toHaveCSS('visibility', 'hidden')
      await overlay.evaluate(() => window.api.toggleSubtitleEditMode(true))
      await expect(card).toHaveCSS('visibility', 'visible')
      await overlay.evaluate(() => window.api.toggleSubtitleEditMode(false))
      await expect(card).toHaveCSS('visibility', 'hidden')
      await toggle.uncheck()
      await expect(card).toHaveCSS('visibility', 'visible')
    } finally {
      await restorePointer.evaluate(restore => restore())
      await restorePointer.dispose()
    }
  })
})


test.describe('Simple navigation', () => {
  test('common controls need at most one section change and the start button stays in view', async () => {
    for (const name of ['Live translation', 'File translation', 'Subtitles & OBS', 'Models', 'Advanced settings']) {
      await openSection(name)
      await expect(settingsWindow.getByRole('button', {name: 'Start translation', exact: true})).toBeInViewport()
      await expect(settingsWindow.getByRole('button', {name: 'Save settings', exact: true})).toBeInViewport()
    }
    await openSection('File translation')
    await expect(settingsWindow.getByLabel('Choose a file to begin translation')).toBeVisible()
    await openSection('Subtitles & OBS')
    await expect(settingsWindow.getByRole('slider', {name: 'Subtitle font size'})).toBeVisible()
    await openSection('Live translation')
    await expect(settingsWindow.getByRole('combobox', {name: 'Source language', exact: true})).toBeVisible()
    await expect(settingsWindow.getByRole('combobox', {name: 'Audio source', exact: true})).toBeVisible()
  })

  test('switching sections preserves unsaved model and language choices', async () => {
    await openSection('Models')
    await settingsWindow.locator('[role="radiogroup"] label').filter({hasText: 'Hunyuan-MT 7B'}).locator('input').check()
    await openSection('Live translation')
    await settingsWindow.getByRole('combobox', {name: 'Source language', exact: true}).selectOption('ko')
    await settingsWindow.getByRole('combobox', {name: 'Target language', exact: true}).selectOption('zh')
    await settingsWindow.getByRole('button', {name: 'Swap translation languages'}).click()
    await openSection('Models')
    await openSection('Advanced settings')
    await openSection('Live translation')
    await expect(settingsWindow.getByRole('combobox', {name: 'Source language', exact: true})).toHaveValue('zh')
    await expect(settingsWindow.getByRole('combobox', {name: 'Target language', exact: true})).toHaveValue('ko')
    await openSection('Models')
    await expect(settingsWindow.locator('[role="radiogroup"] label').filter({hasText: 'Hunyuan-MT 7B'}).locator('input')).toBeChecked()
  })

  test('section tabs support keyboard navigation', async () => {
    await openSection('Live translation')
    await settingsWindow.getByRole('tab', {name: 'Live translation', exact: true}).press('ArrowRight')
    const textTab = settingsWindow.getByRole('tab', {name: 'Text translation', exact: true})
    await expect(textTab).toBeFocused()
    await textTab.press('ArrowRight')
    const filesTab = settingsWindow.getByRole('tab', {name: 'File translation', exact: true})
    await expect(filesTab).toBeFocused()
    await filesTab.press('End')
    await expect(settingsWindow.getByRole('tab', {name: 'Advanced settings', exact: true})).toBeFocused()
  })
})
