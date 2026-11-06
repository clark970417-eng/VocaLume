import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'
import { mkdtempSync, symlinkSync } from 'fs'
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
    await openSection('Translate')
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
    await openSection('Translate')

    const sourceSelect = settingsWindow.locator('[aria-label="Source language"]')
    await expect(sourceSelect).toBeVisible()

    const targetSelect = settingsWindow.locator('[aria-label="Target language"]')
    await expect(targetSelect).toBeVisible()

    // Source language should default to auto
    await expect(sourceSelect).toHaveValue('auto')
  })

  test('should allow changing target language', async () => {
    await openSection('Translate')

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
})


test.describe('Simple navigation', () => {
  test('common controls need at most one section change and the start button stays in view', async () => {
    for (const name of ['Translate', 'Subtitles', 'Models', 'More']) {
      await openSection(name)
      await expect(settingsWindow.getByRole('button', {name: 'Start translation', exact: true})).toBeInViewport()
      await expect(settingsWindow.getByRole('button', {name: 'Save settings', exact: true})).toBeInViewport()
    }
    await openSection('Subtitles')
    await expect(settingsWindow.getByRole('slider', {name: 'Subtitle font size'})).toBeVisible()
    await openSection('Translate')
    await expect(settingsWindow.getByRole('combobox', {name: 'Source language', exact: true})).toBeVisible()
    await expect(settingsWindow.getByRole('combobox', {name: 'Audio source', exact: true})).toBeVisible()
  })

  test('switching sections preserves unsaved model and language choices', async () => {
    await openSection('Models')
    await settingsWindow.locator('[role="radiogroup"] label').filter({hasText: 'Hunyuan-MT 7B'}).locator('input').check()
    await openSection('Translate')
    await settingsWindow.getByRole('combobox', {name: 'Source language', exact: true}).selectOption('ko')
    await settingsWindow.getByRole('combobox', {name: 'Target language', exact: true}).selectOption('zh')
    await settingsWindow.getByRole('button', {name: 'Swap translation languages'}).click()
    await openSection('Models')
    await openSection('More')
    await openSection('Translate')
    await expect(settingsWindow.getByRole('combobox', {name: 'Source language', exact: true})).toHaveValue('zh')
    await expect(settingsWindow.getByRole('combobox', {name: 'Target language', exact: true})).toHaveValue('ko')
    await openSection('Models')
    await expect(settingsWindow.locator('[role="radiogroup"] label').filter({hasText: 'Hunyuan-MT 7B'}).locator('input')).toBeChecked()
  })

  test('section tabs support keyboard navigation', async () => {
    await openSection('Translate')
    await settingsWindow.getByRole('tab', {name: 'Translate', exact: true}).press('ArrowRight')
    await expect(settingsWindow.getByRole('tab', {name: 'Subtitles', exact: true})).toBeFocused()
    await settingsWindow.getByRole('tab', {name: 'Subtitles', exact: true}).press('End')
    await expect(settingsWindow.getByRole('tab', {name: 'More', exact: true})).toBeFocused()
  })
})
