import { chromium, expect, test, type Browser, type Frame, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const extension = resolve(__dirname, '../../extension')
const site = 'chat.vocalume.test'
const input = '明天見！'
const output = 'また明日！'
const composer = '<form><textarea aria-label="輸入訊息"></textarea><button type="submit">Send</button></form>'

let browser: Browser
test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
})
test.afterAll(async () => { await browser?.close() })

async function loadPage(page: Page, body: string, host = site) {
  await page.route('**/*', route => {
    const content = new URL(route.request().url()).pathname === '/room' ? composer : body
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>
      body { margin: 80px 30px 20px }
      form { display: grid; gap: 20px; width: 300px }
      textarea { height: 60px }
      iframe { width: 440px; height: 320px }
    </style>${content}` })
  })
  await page.goto(`https://${host}/`)
}

async function loadComposer(frame: Frame, { access = true, deferred = false } = {}) {
  await frame.evaluate(({ output, access, deferred }) => {
    const site = location.hostname
    let accessChanged: ((changes: object, area: string) => void) | undefined
    let complete: (() => void) | undefined
    const state = {
      requests: [] as object[],
      submitted: [] as string[],
      finished: false,
      allow() { accessChanged?.({ genericSiteAccess: { newValue: { [site]: true } } }, 'local') },
      finish() { complete?.() },
      attach() {
        const form = document.querySelector('form')!
        const box = form.querySelector('textarea')!
        // Track the framework model separately from the DOM value.
        const value = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!
        let tracked = box.value
        let model = tracked
        Object.defineProperty(box, 'value', {
          configurable: true,
          get() { return value.get!.call(this) },
          set(next) { tracked = String(next); value.set!.call(this, next) }
        })
        box.addEventListener('input', () => {
          if (box.value !== tracked) model = tracked = box.value
        })
        form.addEventListener('submit', event => {
          event.preventDefault()
          state.submitted.push(model)
        })
      }
    }
    Object.assign(window, {
      testComposer: state,
      chrome: {
        runtime: {
          onMessage: { addListener() {} },
          sendMessage(payload: { type: string }, reply: (result: unknown) => void) {
            if (payload.type !== 'make-draft') {
              reply({ ok: true, text: { running: false, items: [] } })
              return
            }
            state.requests.push(payload)
            complete = () => {
              reply({ ok: true, text: { draft: output } })
              state.finished = true
            }
            if (!deferred) complete()
          }
        },
        storage: {
          onChanged: { addListener(listener: typeof accessChanged) { accessChanged = listener } },
          local: { get: async () => ({ websiteTextOptInEnabled: true, genericSiteAccess: { [site]: access } }) }
        }
      }
    })
    state.attach()
  }, { output, access, deferred })
  for (const file of ['streamer-vocabulary.js', 'translation-guards.js', 'dom-changes.js', 'caption-window.js', 'social-content.js']) {
    await frame.addScriptTag({ path: resolve(extension, file) })
  }
  await frame.addStyleTag({ path: resolve(extension, 'social-content.css') })
}

test('an opted-in generic site translates a Chinese-labeled composer and submits its Japanese model', async () => {
  const page = await browser.newPage()
  try {
    await loadPage(page, `<input type="search" aria-label="搜尋"><div role="textbox" contenteditable="true" aria-label="名稱"></div>${composer}`)
    await loadComposer(page.mainFrame(), { access: false })
    const button = page.locator('.jtl-social-language')
    const box = page.locator('form textarea')
    await box.fill(input)
    await expect(button).toHaveCount(0)
    await page.evaluate(() => (window as any).testComposer.allow())
    await expect(button).toBeVisible()
    await box.press('Tab')
    await expect(box).toHaveValue(output)
    expect(await page.evaluate(() => (window as any).testComposer.submitted)).toEqual([])
    expect(await page.evaluate(() => (window as any).testComposer.requests)).toEqual([
      { type: 'make-draft', text: input, direction: 'zh-ja' }
    ])
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    expect(await page.evaluate(() => (window as any).testComposer.submitted)).toEqual([output])
  } finally { await page.close() }
})

test('a lookalike hostname still requires explicit site opt-in', async () => {
  const page = await browser.newPage()
  try {
    await loadPage(page, '<div class="chat-input">' + composer + '</div>', 'notbilibili.com')
    await loadComposer(page.mainFrame(), { access: false })
    const box = page.locator('form textarea')
    await box.fill(input)
    await expect(page.locator('.jtl-social-language')).toHaveCount(0)
    await box.press('Tab')
    expect(await page.evaluate(() => (window as any).testComposer.requests)).toEqual([])
  } finally { await page.close() }
})

test('same-site chat frames keep their drafts and captured submissions separate', async () => {
  const page = await browser.newPage()
  try {
    await loadPage(page, '<iframe name="first" src="/room"></iframe><iframe name="second" src="/room"></iframe>')
    const first = page.frame('first')!
    const second = page.frame('second')!
    await loadComposer(first)
    await loadComposer(second)
    await first.locator('form textarea').fill(input)
    await second.locator('form textarea').fill('今天好冷。')
    await first.locator('.jtl-social-language').click()
    await expect(first.locator('form textarea')).toHaveValue(output)
    await expect(second.locator('form textarea')).toHaveValue('今天好冷。')
    await first.getByRole('button', { name: 'Send', exact: true }).click()
    expect(await first.evaluate(() => (window as any).testComposer.submitted)).toEqual([output])
    expect(await second.evaluate(() => (window as any).testComposer.submitted)).toEqual([])
  } finally { await page.close() }
})

test('a late translation from a removed SPA composer cannot replace a different chat draft', async () => {
  const page = await browser.newPage()
  try {
    await loadPage(page, composer)
    await loadComposer(page.mainFrame(), { deferred: true })
    await page.locator('form textarea').fill(input)
    await page.locator('.jtl-social-language').click()
    await expect.poll(() => page.evaluate(() => (window as any).testComposer.requests.length)).toBe(1)
    await page.evaluate(html => {
      document.querySelector('form')!.outerHTML = html
      ;(window as any).testComposer.attach()
    }, composer)
    await page.locator('form textarea').fill('另一個聊天室')
    await page.evaluate(() => (window as any).testComposer.finish())
    await expect.poll(() => page.evaluate(() => (window as any).testComposer.finished)).toBe(true)
    await expect(page.locator('.jtl-social-language')).toBeEnabled()
    await expect(page.locator('form textarea')).toHaveValue('另一個聊天室')
    expect(await page.evaluate(() => (window as any).testComposer.submitted)).toEqual([])
  } finally { await page.close() }
})
