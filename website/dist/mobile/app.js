import { strings } from './strings.js'
import { LANGUAGES, MAX_TEXT_LENGTH, translateMessage } from './translation.js'

const element = id => document.getElementById(id)
const form = element('translator')
const uiLanguage = element('ui-language')
const sourceLanguage = element('source-language')
const targetLanguage = element('target-language')
const sourceText = element('source-text')
const result = element('translation-result')
const allowNetwork = element('allow-network')
const translateButton = element('translate-button')
const copyButton = element('copy-translation')
const status = element('translation-status')
const siteLanguageKey = 'vocalume-site-language'
const languageLabels = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English', ja: '日本語', ko: '한국어' }
const normalize = value => ({ 'zh-TW': 'zh-Hant', 'zh-CN': 'zh-Hans' })[value] ?? value
const supported = value => typeof value === 'string' && Object.hasOwn(strings, value)
let locale = 'zh-Hant', statusKey = '', request = null, lookup = null, revision = 0

function readPreference() {
  try { return localStorage.getItem(siteLanguageKey) } catch { return null }
}

function browserLocale() {
  for (const tag of navigator.languages || [navigator.language]) {
    if (/^zh-(?:Hans|CN|SG)(?:-|$)/i.test(tag)) return 'zh-Hans'
    if (/^zh(?:-|$)/i.test(tag)) return 'zh-Hant'
    const language = tag.split('-')[0].toLowerCase()
    if (supported(language)) return language
  }
  return 'en'
}

function setLocale(next) {
  locale = next
  document.documentElement.lang = next
  const copy = strings[next]
  document.title = `VocaLume · ${copy.title}`
  for (const node of document.querySelectorAll('[data-copy]')) node.textContent = copy[node.dataset.copy]
  for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label', copy[node.dataset.label])
  for (const node of document.querySelectorAll('[data-placeholder]')) node.placeholder = copy[node.dataset.placeholder]
  update()
}

async function selectLocale(value) {
  lookup?.abort()
  const preference = normalize(value)
  uiLanguage.value = supported(preference) ? preference : 'auto'
  if (supported(preference)) {
    setLocale(preference)
    return
  }
  setLocale(browserLocale())
  const controller = new AbortController()
  lookup = controller
  const timer = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch('/api/site-language', { signal: controller.signal, cache: 'no-store', credentials: 'omit' })
    if (!response.ok) return
    const { language } = await response.json()
    if (!controller.signal.aborted && supported(language)) setLocale(language)
  } catch {
    // An unavailable country lookup still leaves the browser language active.
  } finally { clearTimeout(timer) }
}

function validation() {
  if (sourceText.value.length > MAX_TEXT_LENGTH) return 'tooLong'
  if (sourceLanguage.value === targetLanguage.value) return 'pair'
  return ''
}

function update() {
  const copy = strings[locale]
  const invalid = validation()
  const key = invalid || statusKey
  status.textContent = key ? copy[key].replace('{max}', MAX_TEXT_LENGTH) : ''
  translateButton.textContent = request ? copy.translating : copy.translate
  translateButton.disabled = Boolean(request || invalid || !sourceText.value.trim())
  form.setAttribute('aria-busy', String(Boolean(request)))
  copyButton.disabled = !result.value.trim()
}

function setStatus(key) {
  statusKey = key
  update()
}

function resetTranslation() {
  revision++
  request?.abort()
  request = null
  result.value = ''
  result.readOnly = true
  result.removeAttribute('lang')
  setStatus('')
}

for (const select of [sourceLanguage, targetLanguage]) {
  for (const language of LANGUAGES) select.add(new Option(languageLabels[language], language))
  select.addEventListener('change', resetTranslation)
}
sourceLanguage.value = 'ja'
targetLanguage.value = 'zh-TW'

const requested = normalize(new URLSearchParams(location.search).get('lang'))
void selectLocale(requested === 'auto' || supported(requested) ? requested : readPreference())
uiLanguage.addEventListener('change', () => {
  const preference = uiLanguage.value
  try { localStorage.setItem(siteLanguageKey, preference) } catch { /* Keep the current choice for this visit. */ }
  const url = new URL(location.href)
  if (url.searchParams.has('lang')) {
    url.searchParams.delete('lang')
    history.replaceState(null, '', url)
  }
  void selectLocale(preference)
})
window.addEventListener('storage', event => {
  if (event.key === siteLanguageKey) void selectLocale(event.newValue)
})

element('swap-languages').addEventListener('click', () => {
  const source = sourceLanguage.value
  sourceLanguage.value = targetLanguage.value
  targetLanguage.value = source
  resetTranslation()
})
sourceText.addEventListener('input', resetTranslation)
allowNetwork.addEventListener('change', () => {
  if (!allowNetwork.checked && request) resetTranslation()
  else setStatus('')
})
element('clear-message').addEventListener('click', () => {
  sourceText.value = ''
  resetTranslation()
  sourceText.focus()
})
element('paste-message').addEventListener('click', async () => {
  const current = revision
  try {
    const text = await navigator.clipboard.readText()
    if (current !== revision) return
    if (!text.trim()) { setStatus('emptyClipboard'); return }
    sourceText.value = text
    resetTranslation()
    sourceText.focus()
  } catch {
    if (current !== revision) return
    setStatus('manualPaste')
    sourceText.focus()
  }
})
result.addEventListener('input', () => { revision++; setStatus('') })
copyButton.addEventListener('click', async () => {
  const current = revision
  try {
    await navigator.clipboard.writeText(result.value)
    if (current === revision) setStatus('copied')
  } catch {
    if (current !== revision) return
    result.focus()
    result.select()
    setStatus('manualCopy')
  }
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  if (request || validation() || !sourceText.value.trim()) return
  resetTranslation()
  const controller = new AbortController()
  request = controller
  update()
  try {
    const translation = await translateMessage({
      text: sourceText.value, sourceLanguage: sourceLanguage.value, targetLanguage: targetLanguage.value,
      allowOnline: allowNetwork.checked, signal: controller.signal,
      onProgress: () => { if (request === controller) setStatus('preparing') }
    })
    if (request !== controller) return
    result.value = translation.text
    result.lang = targetLanguage.value
    result.readOnly = false
    setStatus(translation.mode)
  } catch (error) {
    if (request === controller) setStatus(['consent', 'offline', 'quota'].includes(error.code) ? error.code : 'failed')
  } finally {
    if (request === controller) {
      request = null
      update()
    }
  }
})
