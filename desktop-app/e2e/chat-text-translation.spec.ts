import { test, expect } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let profile: string

test.beforeEach(async () => {
  profile = mkdtempSync(resolve(tmpdir(), 'vocalume-chat-text-'))
  app = await electron.launch({
    args: [resolve(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, JTL_UI_PROFILE: profile, ELECTRON_DISABLE_GPU: '1', SKIP_ONBOARDING: '1' }
  })
})

test.afterEach(async () => {
  try {
    await app?.close()
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})

async function textPanel() {
  const find = () => app.windows().find(window => window.url().endsWith('/index.html'))
  await expect.poll(() => Boolean(find()), { timeout: 20_000 }).toBe(true)
  const page = find()!
  await page.locator('.interface-language select').selectOption('en')
  await page.getByRole('tab', { name: 'Text translation', exact: true }).click()
  return { page, panel: page.getByRole('tabpanel', { name: 'Text translation', exact: true }) }
}

test('paste a chat draft, reverse the text languages, translate and copy an edited reply', async () => {
  const { page, panel } = await textPanel()
  const source = panel.getByRole('combobox', { name: 'Source language', exact: true })
  const target = panel.getByRole('combobox', { name: 'Target language', exact: true })
  const original = panel.getByLabel('Original message', { exact: true })
  const translated = panel.getByLabel('Translated message', { exact: true })
  const pasted = '謝謝今天的直播'
  const reply = '今日の配信ありがとうございました！'

  // Keep the machine clipboard untouched by the test. The translation uses
  // the real main-process route and an existing phrase that needs no model.
  await page.evaluate(pasted => {
    let value = pasted
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => value,
        writeText: async (text: string) => { value = text }
      }
    })
  }, pasted)
  await expect(source).toHaveValue('ja')
  await expect(target).toHaveValue('zh')
  await original.fill('おやすみなさい。')
  await panel.getByRole('button', { name: 'Translate', exact: true }).click()
  await expect(translated).toHaveValue('晚安。')

  await panel.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect(original).toHaveValue(pasted)
  await expect(translated).toHaveValue('')
  await panel.getByRole('button', { name: 'Swap languages', exact: true }).click()
  await expect(source).toHaveValue('zh')
  await expect(target).toHaveValue('ja')
  await expect(original).toHaveValue(pasted)
  await panel.getByRole('button', { name: 'Translate', exact: true }).click()
  await expect(translated).toHaveValue(reply)
  await translated.fill(reply + '😊')
  await panel.getByRole('button', { name: 'Copy translation', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(reply + '😊')
  await panel.getByRole('button', { name: 'Swap languages', exact: true }).click()
  await expect(translated).toHaveValue('')
  await expect(panel.getByRole('button', { name: 'Copy translation', exact: true })).toBeDisabled()

  const language = page.locator('.interface-language select')
  await language.selectOption('ja')
  await expect(page.getByRole('tab', { name: 'テキスト翻訳', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '翻訳をコピー', exact: true })).toBeVisible()
  await language.selectOption('ko')
  await expect(page.getByRole('tab', { name: '텍스트 번역', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '번역 복사', exact: true })).toBeVisible()
  await expect(page.getByLabel('원본 메시지', { exact: true })).toHaveValue(pasted)
})

test('editing the original while translation runs cannot show or copy an outdated reply', async () => {
  const { panel } = await textPanel()
  await app.evaluate(({ ipcMain }) => {
    const pending = new Map<string, (result: string) => void>()
    Object.assign(globalThis, { chatTextTestRequests: pending })
    ipcMain.removeHandler('translate-text')
    ipcMain.handle('translate-text', (_event, text: string) =>
      new Promise<string>(resolve => pending.set(text, resolve)))
  })
  const original = panel.getByLabel('Original message', { exact: true })
  const translated = panel.getByLabel('Translated message', { exact: true })
  const translate = panel.getByRole('button', { name: 'Translate', exact: true })
  const copy = panel.getByRole('button', { name: 'Copy translation', exact: true })
  const hasRequest = (text: string) => app.evaluate((_electron, text) =>
    (globalThis as unknown as { chatTextTestRequests: Map<string, () => void> }).chatTextTestRequests.has(text), text)
  const finish = (text: string, result: string) => app.evaluate((_electron, [text, result]) =>
    (globalThis as unknown as { chatTextTestRequests: Map<string, (result: string) => void> }).chatTextTestRequests.get(text)?.(result), [text, result])

  await original.fill('おはようございます。')
  await translate.click()
  await expect.poll(() => hasRequest('おはようございます。')).toBe(true)
  await original.fill('おやすみなさい。')
  await finish('おはようございます。', '早安。')
  await expect(translate).toBeEnabled()
  await expect(translated).toHaveValue('')
  await expect(copy).toBeDisabled()

  await translate.click()
  await expect.poll(() => hasRequest('おやすみなさい。')).toBe(true)
  await finish('おやすみなさい。', '晚安。')
  await expect(translated).toHaveValue('晚安。')
  await expect(copy).toBeEnabled()
})
