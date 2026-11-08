export const LANGUAGES = Object.freeze(['zh-TW', 'zh-CN', 'en', 'ja', 'ko'])
export const MAX_TEXT_LENGTH = 1000
const browserLanguage = { 'zh-TW': 'zh-Hant', 'zh-CN': 'zh' }
const onlineEndpoint = 'https://api.mymemory.translated.net/get'
const maxOnlineBytes = 500
const encoder = new TextEncoder()

const phrases = [
  ['你好！', '你好！', 'Hello!', 'こんにちは！', '안녕하세요!'],
  ['早安！', '早上好！', 'Good morning!', 'おはようございます！', '좋은 아침이에요!'],
  ['晚安。', '晚安。', 'Good night.', 'おやすみなさい。', '안녕히 주무세요.'],
  ['謝謝！', '谢谢！', 'Thank you!', 'ありがとうございます！', '감사합니다!']
]

function failure(code) {
  return Object.assign(new Error(code), { code })
}

function shortPhrase(text, source, target) {
  const key = value => value.replace(/[。.!！]+$/u, '').toLowerCase()
  const phrase = phrases.find(row => key(row[source]) === key(text))
  return phrase?.[target]
}

// MyMemory limits input to 500 UTF-8 bytes. Keep Unicode code points
// together, and prefer a sentence or word boundary in the second half.
function* splitOnlineText(text) {
  let start = 0
  while (start < text.length) {
    let end = start, boundary = start, bytes = 0
    for (const character of text.slice(start)) {
      const length = encoder.encode(character).length
      if (bytes + length > maxOnlineBytes) break
      bytes += length
      end += character.length
      if (bytes >= maxOnlineBytes / 2 && /[\s。！？!?]/u.test(character)) boundary = end
    }
    if (end < text.length && boundary > start) end = boundary
    yield text.slice(start, end)
    start = end
  }
}

function decodeText(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return text.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    if (name[0] !== '#') return names[name.toLowerCase()]
    const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : entity
  })
}

async function translateOnline(text, sourceLanguage, targetLanguage, signal) {
  const request = new AbortController()
  const cancel = () => request.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 20000)
  try {
    const chunks = []
    for (const part of splitOnlineText(text)) {
      signal?.throwIfAborted()
      const body = part.trim()
      if (!/[\p{L}\p{N}]/u.test(body)) {
        chunks.push(part)
        continue
      }
      const url = new URL(onlineEndpoint)
      url.searchParams.set('q', body)
      url.searchParams.set('langpair', `${sourceLanguage}|${targetLanguage}`)
      const response = await fetch(url, {
        signal: request.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error'
      })
      if (response.status === 429) throw failure('quota')
      if (!response.ok) throw failure('failed')
      const result = await response.json()
      const output = result?.responseData?.translatedText
      if (Number(result?.responseStatus) === 429 || (typeof output === 'string' && /^MYMEMORY WARNING:.*FREE TRANSLATIONS/i.test(output))) throw failure('quota')
      if (Number(result?.responseStatus) !== 200 || typeof output !== 'string' || !output.trim()) throw failure('failed')
      const leading = part.indexOf(body)
      chunks.push(part.slice(0, leading) + decodeText(output.trim()) + part.slice(leading + body.length))
    }
    return chunks.join('')
  } catch (error) {
    signal?.throwIfAborted()
    throw failure(error?.code === 'quota' ? 'quota' : 'failed')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function translateMessage({ text, sourceLanguage, targetLanguage, allowOnline = false, signal, onProgress }) {
  const source = LANGUAGES.indexOf(sourceLanguage)
  const target = LANGUAGES.indexOf(targetLanguage)
  if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH || !text.trim() || source < 0 || target < 0 || source === target) throw failure('invalid')
  signal?.throwIfAborted()
  const message = text.trim()
  const phrase = shortPhrase(message, source, target)
  if (phrase || !/[\p{L}]/u.test(message)) return { text: phrase ?? message, mode: 'device' }

  if (typeof globalThis.Translator?.availability === 'function' && typeof globalThis.Translator?.create === 'function') {
    const options = {
      sourceLanguage: browserLanguage[sourceLanguage] ?? sourceLanguage,
      targetLanguage: browserLanguage[targetLanguage] ?? targetLanguage
    }
    let translator
    try {
      const deadline = AbortSignal.timeout(30000)
      const deviceSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
      const available = await globalThis.Translator.availability(options)
      deviceSignal.throwIfAborted()
      if (available !== 'unavailable') {
        translator = await globalThis.Translator.create({
          ...options, signal: deviceSignal,
          monitor(monitor) {
            monitor.addEventListener('downloadprogress', event => onProgress?.(event.loaded))
          }
        })
        const translated = await translator.translate(message, { signal: deviceSignal })
        deviceSignal.throwIfAborted()
        if (translated?.trim()) return { text: translated, mode: 'device' }
      }
    } catch {
      signal?.throwIfAborted()
    } finally {
      translator?.destroy?.()
    }
  }

  if (allowOnline !== true) throw failure('consent')
  if (globalThis.navigator?.onLine === false) throw failure('offline')
  return { text: await translateOnline(message, sourceLanguage, targetLanguage, signal), mode: 'online' }
}
