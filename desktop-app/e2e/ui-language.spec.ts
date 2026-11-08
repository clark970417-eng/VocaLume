import { test, expect, chromium, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { tmpdir } from 'node:os'

async function settingsPage(app: ElectronApplication): Promise<Page> {
  const find = () => app.windows().find(window => window.url().endsWith('/index.html'))
  await expect.poll(() => Boolean(find())).toBe(true)
  return find()!
}

test('desktop interface language switch persists and preserves unsaved translation settings', async () => {
  const app = await electron.launch({ args: [resolve(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, JTL_UI_PROFILE: mkdtempSync(resolve(tmpdir(), 'vocalume-language-')), ELECTRON_DISABLE_GPU: '1', SKIP_ONBOARDING: '1' } })
  try {
    const page = await settingsPage(app)
    const findSubtitle = () => app.windows().find(window => window.url().endsWith('#/subtitle'))
    await expect.poll(() => Boolean(findSubtitle())).toBe(true)
    const subtitle = findSubtitle()!
    await page.getByRole('heading', { name: 'VocaLume', exact: true }).waitFor()
    await page.locator('.interface-language select').selectOption('en')
    await page.getByLabel('Source language', { exact: true }).selectOption('ko')
    await page.getByLabel('Target language', { exact: true }).selectOption('ja')
    await page.getByLabel('Interface language', { exact: true }).selectOption('zh-TW')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
    await expect(page.getByRole('tab', { name: '即時翻譯', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '開始翻譯', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '儲存設定', exact: true })).toBeVisible()
    await expect(page.getByLabel('原文語言', { exact: true })).toHaveValue('ko')
    await expect(page.getByLabel('翻譯語言', { exact: true })).toHaveValue('ja')
    for (const [tab, heading] of [
      ['檔案翻譯', '翻譯音訊或影片檔案'],
      ['字幕與 OBS', '字幕與 OBS'],
      ['模型', '模型與翻譯品質'],
      ['進階設定', '更多設定']
    ]) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
    }
    await page.getByLabel('介面語言', { exact: true }).selectOption('en')
    await expect(page.getByRole('tab', { name: 'Advanced settings', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Live translation', exact: true }).click()
    await expect(page.getByLabel('Source language', { exact: true })).toHaveValue('ko')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().endsWith('#/subtitle'))?.setSize(480, 640))
    await page.getByLabel('Interface language', { exact: true }).selectOption('ja')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(subtitle.locator('html')).toHaveAttribute('lang', 'ja')
    await expect(subtitle.getByRole('region')).toHaveAttribute('aria-label', '字幕')
    await expect(page.getByRole('tab', { name: 'ライブ翻訳', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '翻訳を開始', exact: true })).toBeVisible()
    await expect(page.getByLabel('原文の言語', { exact: true })).toHaveValue('ko')
    await page.getByRole('tab', { name: 'ファイル翻訳', exact: true }).click()
    await expect(page.getByRole('button', { name: 'フォルダーを監視して自動翻訳', exact: true })).toBeVisible()
    const chooseFile = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '翻訳するファイルを選ぶ', exact: true }).click()
    await chooseFile
    await page.getByLabel('表示言語', { exact: true }).selectOption('ko')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(subtitle.locator('html')).toHaveAttribute('lang', 'ko')
    await expect(subtitle.getByRole('region')).toHaveAttribute('aria-label', '자막')
    await expect(page.getByRole('button', { name: '폴더 감시 및 자동 번역', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '고급 설정', exact: true }).click()
    await page.getByText('도움말 및 업데이트', { exact: true }).click()
    await expect(page.getByRole('button', { name: '공식 웹사이트', exact: true })).toBeVisible()
    expect(await page.locator('.settings-content').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true)
    await page.locator('.interface-language select').selectOption('zh-TW')
    await page.reload()
    await expect(page.getByRole('button', { name: '儲存設定', exact: true })).toBeVisible()
    await expect(page.getByLabel('介面語言', { exact: true })).toHaveValue('zh-TW')
  } finally { await app.close() }
})

test('first-run setup exposes the language choice before any model download', async () => {
  const app = await electron.launch({ args: [resolve(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, JTL_UI_PROFILE: mkdtempSync(resolve(tmpdir(), 'vocalume-onboarding-language-')), ELECTRON_DISABLE_GPU: '1', SKIP_ONBOARDING: '' } })
  try {
    const page = await settingsPage(app)
    // Wait for the asynchronous onboarding status before changing locale.
    // The language selector can render before the Quick Start card is ready.
    await page.getByRole('button', { name: /Download & start|下載並開始|下载并开始|ダウンロードして開始|다운로드 후 시작/ }).waitFor({state:'visible',timeout:15000})
    await page.locator('.interface-language select').selectOption('zh-TW')
    await expect(page.getByRole('heading', { name: '歡迎使用 VocaLume' })).toBeVisible()
    await expect(page.getByRole('button', { name: /下載並開始/ })).toBeVisible({timeout:15000})
    await expect(page.getByRole('button', { name: '略過並繼續' })).toBeVisible()
    await page.getByLabel('介面語言', { exact: true }).selectOption('en')
    await expect(page.getByRole('heading', { name: 'Welcome to VocaLume' })).toBeVisible()
  } finally { await app.close() }
})

test('extension switches live UI and caption preview while keeping typed API values', async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
  const page: Page = await browser.newPage({ viewport: { width: 400, height: 750 } })
  const root = resolve(__dirname, '../../extension')
  try {
    await page.addInitScript(() => {
      const listeners: Array<(changes: object, area: string) => void> = []
      const state = JSON.parse(sessionStorage.getItem('testPrefs') || 'null') || { 'vocalume.uiLanguage': 'zh-TW', captionStyleV34: true, popupPanel: 'text' }
      Object.assign(window, { chrome: {
        storage: { local: { get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in state).map(k => [k, state[k]])),
          set: async (values: Record<string, unknown>) => { const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { newValue: v }]))
            Object.assign(state, values); sessionStorage.setItem('testPrefs', JSON.stringify(state)); listeners.forEach(fn => fn(changes, 'local')) } },
          onChanged: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) } },
        runtime: { getManifest: () => ({ version: 'test' }), sendMessage: (message: { type: string }, reply?: (value: unknown) => void) => {
          const result = message.type === 'ui-language-choose' ? undefined : { ok: true, text: { running: false } }
          if (reply) return reply(result)
          return Promise.resolve(result)
        } },
        tabs: { query: async () => [{ id: 1, url: 'https://www.youtube.com/watch?v=test' }] },
        permissions: { contains: async () => false, request: async () => false }
      } })
    })
    await page.route('**/*', async route => {
      const name = new URL(route.request().url()).pathname.slice(1) || 'popup.html'
      const file = resolve(root, name)
      if (!file.startsWith(root + sep) || !existsSync(file)) return route.abort()
      await route.fulfill({ body: readFileSync(file), contentType: ({ '.html': 'text/html', '.mjs': 'application/javascript', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' } as Record<string, string>)[extname(file)] || 'application/octet-stream' })
    })
    await page.goto('https://vocalume.test/popup.html')
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('tab', { name: '文字翻譯', exact: true })).toBeVisible()
    const direction = await page.locator('#readSource').inputValue()
    await page.locator('#uiLanguage').selectOption('en')
    await expect(page.getByRole('tab', { name: 'Text translation', exact: true })).toBeVisible()
    const streamerChat = page.locator('label[for="streamerChatMode"]')
    await expect(streamerChat.locator('strong')).toHaveText('Auto-translate live chat')
    await expect(streamerChat.locator('.platforms')).toHaveText('YouTube / Twitch')
    await page.locator('#uiLanguage').selectOption('zh-CN')
    await expect(streamerChat.locator('strong')).toHaveText('自动翻译直播留言')
    await page.locator('#uiLanguage').selectOption('ja')
    await expect(streamerChat.locator('strong')).toHaveText('ライブチャットを自動翻訳')
    await page.locator('#uiLanguage').selectOption('ko')
    await expect(streamerChat.locator('strong')).toHaveText('라이브 채팅 자동 번역')
    await page.locator('#uiLanguage').selectOption('en')
    await page.locator('#tab-settings').click()
    await page.locator('#apiSettings').evaluate(el => { (el as HTMLDetailsElement).open = true })
    await page.locator('#apiProvider').selectOption('custom')
    await page.locator('#apiModel').fill('my-model')
    await page.locator('#apiKey').fill('test-only-key')
    await expect(page.locator('#translationStatus')).toHaveText('Not applied yet. Save the service.')
    await expect(page.locator('#previewJa')).toHaveText('Source caption')
    await expect(page.locator('#previewZh')).toHaveText('Translated caption')
    await page.locator('#uiLanguage').selectOption('zh-TW')
    await expect(page.locator('#translationStatus')).toHaveText('尚未套用，請儲存服務。')
    await expect(page.locator('#apiModel')).toHaveValue('my-model')
    await expect(page.locator('#apiKey')).toHaveValue('test-only-key')
    await expect(page.locator('#readSource')).toHaveValue(direction)
    await expect(page.locator('#previewJa')).toHaveText('原文字幕')
    await expect(page.locator('#previewZh')).toHaveText('翻譯字幕')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.reload()
    await expect(page.locator('#uiLanguage')).toHaveValue('zh-TW')
    await expect(page.getByRole('tab', { name: '字幕與設定', exact: true })).toBeVisible()
    await page.locator('#tab-text').click()
    const writingSummary = page.locator('#writingOptions > summary')
    const writingOptions = page.locator('#writingOptions')
    for (const width of [200, 240, 320, 400]) {
      await page.setViewportSize({ width, height: 460 })
      for (const locale of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko']) {
        await page.locator('#uiLanguage').selectOption(locale)
        await expect(writingSummary).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
        expect(await page.locator('footer').evaluate(footer => footer.getBoundingClientRect().bottom)).toBeLessThanOrEqual(460)
        const textFits = await writingSummary.evaluate(summary => {
          const text = document.createRange()
          text.selectNodeContents(summary)
          const { left, right } = summary.getBoundingClientRect()
          return [...text.getClientRects()].every(rect => rect.left >= left - 1 && rect.right <= right + 1)
        })
        expect(textFits).toBe(true)
      }
    }
    await writingSummary.focus()
    await page.keyboard.press('Enter')
    await expect(writingOptions).toHaveAttribute('open', '')
    await page.keyboard.press('Space')
    await expect(writingOptions).not.toHaveAttribute('open', '')
  } finally { await browser.close() }
})
