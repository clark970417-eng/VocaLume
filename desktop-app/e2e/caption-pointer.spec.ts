import { chromium, expect, test, type Browser, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const extension = resolve('../extension')
let browser: Browser

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
})

test.afterAll(async () => {
  await browser?.close()
})

async function fixture(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`
    <style>
      body { height: 1800px; margin: 0 }
      #full { height: 700px }
      #under { position: fixed; inset: 0; width: 100%; height: 100% }
    </style>
    <main id="full"><button id="under">Player control</button></main>
    <div id="captions"></div>
  `)
  await page.evaluate(() => {
    const saved: Record<string, unknown> = { captionStyleV34: true }
    Object.defineProperty(window, 'chrome', {
      value: { storage: { local: { get: async () => saved, set: async (values: object) => Object.assign(saved, values) } } },
      configurable: true
    })
    Object.assign(window, { captionWrites: saved, playerClicks: 0 })
    document.querySelector('#under')!.addEventListener('click', () => { (window as any).playerClicks++ })
  })
  await page.addStyleTag({ path: resolve(extension, 'caption-window.css') })
  await page.addScriptTag({ path: resolve(extension, 'caption-window.js') })
  await page.evaluate(async () => {
    const controller = new (window as any).JtlCaptionWindow(document.querySelector('#captions'), 'testRect')
    ;(window as any).captions = controller
    await Promise.resolve()
    controller.place({ x: .2, y: .25, w: .4, h: .3 })
    controller.apply({ captionOpacity: 65, hideOnHover: true })
    controller.render([{ original: 'こんにちは', translated: '你好' }])
  })
  return page
}

test('the active subtitle stays in place, passes clicks through, and resumes outside its bounds', async () => {
  const page = await fixture()
  try {
    const captions = page.locator('#captions')
    const box = (await captions.boundingBox())!
    await expect(captions).toHaveCSS('opacity', '0.65')
    const middle = box.y + box.height / 2
    await page.mouse.move(box.x - 10, middle)
    await expect(captions).toHaveCSS('opacity', '0')
    await page.mouse.click(box.x + 40, middle)
    expect(await page.evaluate(() => (window as any).playerClicks)).toBe(1)
    await page.mouse.move(box.x - 14, middle)
    await expect(captions).toHaveCSS('opacity', '0')
    await page.mouse.move(box.x - 24, middle)
    await expect(captions).toHaveCSS('opacity', '0.65')
    expect(await captions.boundingBox()).toEqual(box)
    await expect(captions).toContainText('你好')

    await page.mouse.move(box.x + 40, middle)
    await page.evaluate(() => (window as any).captions.render([]))
    await expect(captions).toHaveCSS('visibility', 'hidden')
    expect(await page.evaluate(() => !!(window as any).captions.pointerTracking)).toBe(false)
  } finally { await page.close() }
})

test('Alt drag and resize still save position, including after fullscreen reparenting', async () => {
  const page = await fixture()
  try {
    // Headless Chromium cannot enter native macOS fullscreen. Replay the
    // DOM transition the YouTube adapter performs on fullscreenchange.
    await page.evaluate(() => {
      document.querySelector('#full')!.append(document.querySelector('#captions')!)
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const captions = page.locator('#captions')
    const initial = (await captions.boundingBox())!
    await page.mouse.move(initial.x + 30, initial.y + 30)
    await expect(captions).toHaveCSS('opacity', '0')
    await page.keyboard.down('Alt')
    await expect(captions).toHaveCSS('opacity', '0.65')
    await page.mouse.down()
    await page.mouse.move(initial.x + 70, initial.y + 60)
    await page.mouse.up()
    const moved = (await captions.boundingBox())!
    expect(moved.x).toBeCloseTo(initial.x + 40)
    expect(moved.y).toBeCloseTo(initial.y + 30)
    await page.mouse.move(moved.x + moved.width, moved.y + moved.height)
    await page.mouse.down()
    await page.mouse.move(moved.x + moved.width + 35, moved.y + moved.height + 25)
    await page.mouse.up()
    await page.keyboard.up('Alt')
    const resized = (await captions.boundingBox())!
    expect(resized.width).toBeCloseTo(moved.width + 35)
    expect(resized.height).toBeCloseTo(moved.height + 25)
    expect(await page.evaluate(() => (window as any).captionWrites.testRect)).toBeTruthy()
    await page.mouse.move(30, 30)
    await expect(captions).toHaveCSS('opacity', '0.65')

    await page.evaluate(() => document.querySelector('#full')!.remove())
    await expect.poll(() => page.evaluate(() => !!(window as any).captions.pointerTracking)).toBe(false)
  } finally { await page.close() }
})

test('scrolling and resizing recheck the actual caption bounds under a stationary pointer', async () => {
  const page = await fixture()
  try {
    const captions = page.locator('#captions')
    await page.evaluate(() => {
      const parent = document.querySelector<HTMLElement>('#full')!
      parent.style.transform = 'translateZ(0)'
      parent.append(document.querySelector('#captions')!)
    })
    const box = (await captions.boundingBox())!
    await page.mouse.move(box.x + box.width - 10, box.y + 30)
    await expect(captions).toHaveCSS('opacity', '0')
    await page.evaluate(() => window.scrollTo(0, 330))
    await expect(captions).toHaveCSS('opacity', '0.65')
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(captions).toHaveCSS('opacity', '0')
    await page.setViewportSize({ width: 750, height: 700 })
    await expect(captions).toHaveCSS('opacity', '0.65')
  } finally { await page.close() }
})
