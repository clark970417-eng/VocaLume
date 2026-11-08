import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MAX_TEXT_LENGTH, translateMessage } from '../dist/mobile/translation.js'

const request = { text: '明天可以見面嗎？', sourceLanguage: 'zh-TW', targetLanguage: 'ja' }
const reply = text => Response.json({ responseStatus: 200, responseData: { translatedText: text } })

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original)
    else delete globalThis[name]
  })
}

test('requires explicit consent before sending a message off-device', async t => {
  replaceGlobal(t, 'Translator', undefined)
  const network = t.mock.method(globalThis, 'fetch', async () => reply('明日会えますか？'))
  await assert.rejects(translateMessage(request), { code: 'consent' })
  assert.equal(network.mock.callCount(), 0)
  assert.deepEqual(await translateMessage({ ...request, allowOnline: true }), { text: '明日会えますか？', mode: 'online' })
  const [url, options] = network.mock.calls[0].arguments
  assert.equal(url.origin, 'https://api.mymemory.translated.net')
  assert.equal(url.pathname, '/get')
  assert.deepEqual(Object.fromEntries(url.searchParams), { q: request.text, langpair: 'zh-TW|ja' })
  assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer')
  assert.equal(options.cache, 'no-store')
  assert.equal(options.redirect, 'error')
})

test('common phrases and emoji-only content translate offline without consent', async t => {
  replaceGlobal(t, 'navigator', { onLine: false })
  const network = t.mock.method(globalThis, 'fetch')
  assert.deepEqual(await translateMessage({ ...request, text: '謝謝！' }), { text: 'ありがとうございます！', mode: 'device' })
  assert.deepEqual(await translateMessage({ ...request, text: '🥺' }), { text: '🥺', mode: 'device' })
  await assert.rejects(translateMessage({ ...request, allowOnline: true }), { code: 'offline' })
  assert.equal(network.mock.callCount(), 0)
})

test('uses the device translator first and releases it', async t => {
  const destroy = t.mock.fn()
  replaceGlobal(t, 'Translator', {
    async availability(options) {
      assert.deepEqual(options, { sourceLanguage: 'zh-Hant', targetLanguage: 'ja' })
      return 'available'
    },
    async create(options) {
      assert.equal(options.sourceLanguage, 'zh-Hant')
      return { async translate(text) { assert.equal(text, request.text); return '明日会えますか？' }, destroy }
    }
  })
  const network = t.mock.method(globalThis, 'fetch')
  assert.deepEqual(await translateMessage({ ...request, allowOnline: true }), { text: '明日会えますか？', mode: 'device' })
  assert.equal(destroy.mock.callCount(), 1)
  assert.equal(network.mock.callCount(), 0)
})

test('device failure falls back to network only if allowed', async t => {
  replaceGlobal(t, 'Translator', {
    async availability() { return 'downloadable' },
    async create() { throw new Error('Download interrupted') }
  })
  const network = t.mock.method(globalThis, 'fetch', async () => reply('明日会えますか？'))
  await assert.rejects(translateMessage(request), { code: 'consent' })
  assert.equal(network.mock.callCount(), 0)
  assert.equal((await translateMessage({ ...request, allowOnline: true })).mode, 'online')
  assert.equal(network.mock.callCount(), 1)
})

test('respects the provider UTF-8 byte cap and never cuts an emoji in half', async t => {
  replaceGlobal(t, 'Translator', undefined)
  const input = 'まほろ🥺次も見るよ。'.repeat(39)
  const parts = []
  t.mock.method(globalThis, 'fetch', async url => {
    const chunk = url.searchParams.get('q')
    assert.ok(Buffer.byteLength(chunk, 'utf8') <= 500)
    assert.ok(!chunk.includes('\uFFFD'))
    parts.push(chunk)
    return reply(chunk)
  })
  const result = await translateMessage({ ...request, text: input, allowOnline: true })
  assert.ok(parts.length > 1)
  assert.equal(parts.join(''), input)
  assert.equal(result.text, input)
})

test('distinguishes invalid input, quota, invalid provider output and encoded text', async t => {
  replaceGlobal(t, 'Translator', undefined)
  const network = t.mock.method(globalThis, 'fetch', async () => reply('&lt;ok&gt; &amp; &#x1F642;'))
  await assert.rejects(translateMessage({ ...request, text: 'x'.repeat(MAX_TEXT_LENGTH + 1), allowOnline: true }), { code: 'invalid' })
  await assert.rejects(translateMessage({ ...request, targetLanguage: 'zh-TW', allowOnline: true }), { code: 'invalid' })
  assert.equal(network.mock.callCount(), 0)
  assert.equal((await translateMessage({ ...request, allowOnline: true })).text, '<ok> & 🙂')
  network.mock.mockImplementationOnce(async () => Response.json({ responseStatus: 429 }))
  await assert.rejects(translateMessage({ ...request, allowOnline: true }), { code: 'quota' })
  network.mock.mockImplementationOnce(async () => Response.json({ responseStatus: 200, responseData: { translatedText: '' } }))
  await assert.rejects(translateMessage({ ...request, allowOnline: true }), { code: 'failed' })
})

test('abort cancels in-flight provider request without continuing subsequent chunks', async t => {
  replaceGlobal(t, 'Translator', undefined)
  const network = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const controller = new AbortController()
  const pending = translateMessage({ ...request, allowOnline: true, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(network.mock.callCount(), 1)
})
