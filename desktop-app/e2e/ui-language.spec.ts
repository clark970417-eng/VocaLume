import { test, expect, chromium, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { tmpdir } from 'node:os'

test('desktop Chinese/English switch persists and preserves unsaved translation settings', async () => {
  const app = await electron.launch({ args: [resolve(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, JTL_UI_PROFILE: mkdtempSync(resolve(tmpdir(), 'vocalume-language-')), ELECTRON_DISABLE_GPU: '1', SKIP_ONBOARDING: '1' } })
  try {
    const page = await app.firstWindow()
    await page.getByRole('heading', { name: 'VocaLume', exact: true }).waitFor()
    await page.getByLabel('Interface language', { exact: true }).selectOption('en')
    await page.getByLabel('Source language', { exact: true }).selectOption('ko')
    await page.getByLabel('Target language', { exact: true }).selectOption('ja')
    await page.getByLabel('Interface language', { exact: true }).selectOption('zh-TW')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
    await expect(page.getByRole('tab', { name: '翻譯', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '開始翻譯', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '儲存設定', exact: true })).toBeVisible()
    await expect(page.getByLabel('原文語言', { exact: true })).toHaveValue('ko')
    await expect(page.getByLabel('翻譯語言', { exact: true })).toHaveValue('ja')
    for (const [tab, heading] of [['字幕', '字幕外觀'], ['模型', '模型與翻譯品質'], ['更多', '更多設定']]) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible()
    }
    await page.getByLabel('介面語言', { exact: true }).selectOption('en')
    await expect(page.getByRole('tab', { name: 'More', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Translate', exact: true }).click()
    await expect(page.getByLabel('Source language', { exact: true })).toHaveValue('ko')
    await page.getByLabel('Interface language', { exact: true }).selectOption('zh-TW')
    await page.reload()
    await expect(page.getByRole('button', { name: '儲存設定', exact: true })).toBeVisible()
    await expect(page.getByLabel('介面語言', { exact: true })).toHaveValue('zh-TW')
  } finally { await app.close() }
})

test('first-run setup exposes the language choice before any model download', async () => {
  const app = await electron.launch({ args: [resolve(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, JTL_UI_PROFILE: mkdtempSync(resolve(tmpdir(), 'vocalume-onboarding-language-')), ELECTRON_DISABLE_GPU: '1', SKIP_ONBOARDING: '' } })
  try {
    const page = await app.firstWindow()
    await page.locator('.interface-language select').selectOption('zh-TW')
    await expect(page.getByRole('heading', { name: '歡迎使用 VocaLume' })).toBeVisible()
    await expect(page.getByRole('button', { name: /下載並開始/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '略過並繼續' })).toBeVisible()
    await page.getByLabel('介面語言', { exact: true }).selectOption('en')
    await expect(page.getByRole('heading', { name: 'Welcome to VocaLume' })).toBeVisible()
  } finally { await app.close() }
})

test('extension switches live UI copy while keeping typed API values and preview text', async () => {
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
        runtime: { getManifest: () => ({ version: 'test' }), sendMessage: (_message: unknown, reply: (value: unknown) => void) => reply({ ok: true, text: { running: false } }) },
        tabs: { query: async () => [{ id: 1, url: 'https://www.youtube.com/watch?v=test' }] },
        permissions: { contains: async () => false, request: async () => false }
      } })
    })
    await page.route('**/*', async route => {
      const name = new URL(route.request().url()).pathname.slice(1) || 'popup.html'
      const file = resolve(root, name)
      if (!file.startsWith(root + '/') || !existsSync(file)) return route.abort()
      await route.fulfill({ body: readFileSync(file), contentType: ({ '.html': 'text/html', '.mjs': 'application/javascript', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' } as Record<string, string>)[extname(file)] || 'application/octet-stream' })
    })
    await page.goto('https://vocalume.test/popup.html')
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('tab', { name: '文字翻譯', exact: true })).toBeVisible()
    const direction = await page.locator('#readSource').inputValue()
    await page.locator('#uiLanguage').selectOption('en')
    await expect(page.getByRole('tab', { name: 'Text translation', exact: true })).toBeVisible()
    await page.locator('#tab-settings').click()
    await page.locator('#apiSettings').evaluate(el => { (el as HTMLDetailsElement).open = true })
    await page.locator('#apiProvider').selectOption('custom')
    await page.locator('#apiModel').fill('my-model')
    await page.locator('#apiKey').fill('test-only-key')
    await expect(page.locator('#translationStatus')).toHaveText('Not applied yet. Save the service.')
    await page.locator('#uiLanguage').selectOption('zh-TW')
    await expect(page.locator('#translationStatus')).toHaveText('尚未套用，請儲存服務。')
    await expect(page.locator('#apiModel')).toHaveValue('my-model')
    await expect(page.locator('#apiKey')).toHaveValue('test-only-key')
    await expect(page.locator('#readSource')).toHaveValue(direction)
    await expect(page.locator('#previewJa')).toHaveText('一緒に楽しみましょう。')
    await expect(page.locator('#previewZh')).toHaveText('一起享受吧。')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.reload()
    await expect(page.locator('#uiLanguage')).toHaveValue('zh-TW')
    await expect(page.getByRole('tab', { name: '字幕與設定', exact: true })).toBeVisible()
  } finally { await browser.close() }
})
