export const mobileCompanionPage = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#e9f1f4">
  <title>VocaLume 手機翻譯</title>
  <link rel="stylesheet" href="/mobile.css">
  <script src="/mobile.js" defer></script>
</head>
<body>
  <main>
    <header class="shell-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true">文</span>VocaLume</div>
      <p id="connection" class="connection" data-state="offline" role="status">尚未配對</p>
    </header>
    <section id="pairing" class="surface" aria-labelledby="pair-heading">
      <h1 id="pair-heading">連接電腦</h1>
      <p class="hint">輸入桌面版 VocaLume 顯示的手機配對碼。</p>
      <form id="pair-form" method="post" action="/pair">
        <label for="pair-code">配對碼</label>
        <input id="pair-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
          autocapitalize="off" spellcheck="false" required minlength="8" maxlength="8" pattern="[0-9]{8}">
        <button class="primary" id="pair-button" type="submit">配對</button>
        <p id="pair-status" class="feedback" role="status"></p>
      </form>
    </section>
    <div id="workspace" hidden>
      <h1 class="sr-only">VocaLume 手機翻譯</h1>
      <div class="switcher" role="tablist" aria-label="翻譯模式">
        <button id="text-tab" type="button" role="tab" aria-selected="true" aria-controls="text-panel">文字翻譯</button>
        <button id="caption-tab" type="button" role="tab" aria-selected="false" aria-controls="caption-panel" tabindex="-1">即時字幕</button>
      </div>
      <section id="text-panel" class="surface" role="tabpanel" aria-labelledby="text-tab">
        <form id="translation-form">
          <div class="languages">
            <div>
              <label for="source-language">原文語言</label>
              <select id="source-language">
                <option value="ja" selected>日本語</option>
                <option value="zh">繁體中文</option>
                <option value="ko">한국어</option>
              </select>
            </div>
            <button id="swap-languages" class="swap secondary" type="button" aria-label="交換語言" title="交換語言">⇄</button>
            <div>
              <label for="target-language">譯文語言</label>
              <select id="target-language">
                <option value="ja">日本語</option>
                <option value="zh" selected>繁體中文</option>
                <option value="ko">한국어</option>
              </select>
            </div>
          </div>
          <label for="source-text">原文</label>
          <textarea id="source-text" rows="4" placeholder="在這裡貼上或輸入文字" maxlength="3000" required></textarea>
          <button id="translate-button" class="primary" type="submit">翻譯</button>
          <p id="translation-status" class="feedback" role="status"></p>
        </form>
        <div class="result">
          <div class="result-header">
            <label for="result-text">譯文</label>
            <button id="copy-button" class="secondary" type="button" disabled>複製譯文</button>
          </div>
          <textarea id="result-text" rows="4" readonly></textarea>
        </div>
      </section>
      <section id="caption-panel" class="surface" role="tabpanel" aria-labelledby="caption-tab" hidden>
        <p id="subtitle-status" class="hint" role="status">等待電腦字幕。</p>
        <div class="caption" id="caption" hidden>
          <div class="caption-line">
            <h2>原文</h2>
            <p id="caption-source" dir="auto"></p>
          </div>
          <div class="caption-line translated">
            <h2>譯文</h2>
            <p id="caption-target" dir="auto"></p>
          </div>
        </div>
      </section>
      <div class="workspace-footer">
        <button id="disconnect-button" class="secondary" type="button">中斷配對</button>
      </div>
    </div>
  </main>
</body>
</html>`

export const mobileCompanionStyle = `
:root {
  color-scheme: light;
  --ink: #152e3b;
  --muted: #435b66;
  --canvas: #e9f1f4;
  --paper: #f8fcff;
  --line: #adc3cb;
  --action: #175365;
  --ready: #205944;
  --caption: #d9ede7;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--canvas); color: var(--ink); }
main { width: min(100%, 40rem); margin: 0 auto; padding: 1rem clamp(.875rem, 4.4vw, 2rem) 2rem; }
.shell-header, .brand, .result-header { display: flex; align-items: center; }
.shell-header { justify-content: space-between; flex-wrap: wrap; gap: .5rem 1rem; margin-bottom: 1rem; }
.brand { gap: .625rem; font-size: 1.125rem; font-weight: 760; letter-spacing: -.025em; }
.brand-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .6rem .6rem .6rem .18rem; background: var(--action); color: var(--paper); font-size: .875rem; }
.connection { margin: 0; color: var(--muted); font-size: .875rem; line-height: 1.6; }
.connection::before { display: inline-block; width: .45rem; height: .45rem; margin-right: .4rem; border-radius: 50%; background: currentColor; vertical-align: .12em; content: ""; }
.connection[data-state="ready"] { color: var(--ready); }
.surface { padding: clamp(1rem, 4vw, 1.6rem); border: 1px solid var(--line); border-radius: 1.15rem; background: var(--paper); }
h1 { margin: 0 0 .4rem; font-size: clamp(1.5rem, 7vw, 2rem); letter-spacing: -.04em; }
p.hint { margin: 0 0 1rem; color: var(--muted); line-height: 1.58; }
#subtitle-status:empty { display: none; }
label { display: block; margin-bottom: .35rem; font-size: .91rem; line-height: 1.4; font-weight: 670; }
input, textarea, select, button { font: inherit; }
input, textarea, select { display: block; min-width: 0; width: 100%; border: 1px solid var(--line); border-radius: .65rem; background: #fff; color: var(--ink); }
input, select { min-height: 2.85rem; padding: .5rem .6rem; }
textarea { padding: .7rem; line-height: 1.6; resize: vertical; }
textarea[readonly] { background: var(--canvas); }
button { min-width: 2.75rem; min-height: 2.75rem; border: 1px solid transparent; border-radius: .68rem; padding: .45rem .8rem; font-weight: 680; color: var(--ink); cursor: pointer; }
button:disabled { color: var(--muted); opacity: .6; cursor: default; }
:focus-visible { outline: 3px solid var(--action); outline-offset: 2px; }
.primary { width: 100%; margin-top: .7rem; background: var(--action); color: #fff; }
.primary:disabled { color: #fff; }
.secondary { background: var(--paper); color: var(--action); border-color: var(--line); }
#pair-code { max-width: 100%; letter-spacing: .2em; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.switcher { display: grid; grid-template-columns: 1fr 1fr; gap: .35rem; margin-bottom: .65rem; padding: .3rem; border: 1px solid var(--line); border-radius: .95rem; }
.switcher button { background: transparent; }
.switcher button[aria-selected="true"] { background: var(--action); color: #fff; }
.languages { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: .4rem; align-items: end; margin-bottom: .95rem; }
.swap { font-size: 1.3rem; padding: .2rem; }
.feedback { margin: .6rem 0 0; color: var(--muted); line-height: 1.4; }
.feedback:empty { display: none; }
.feedback[data-error="true"] { color: #872b38; }
.result { margin-top: 1rem; padding-top: .85rem; border-top: 1px solid var(--line); }
.result-header { justify-content: space-between; gap: .4rem; margin-bottom: .35rem; }
.result-header label { margin: 0; }
.workspace-footer { display: flex; justify-content: flex-end; margin-top: .65rem; }
.caption { display: grid; gap: .65rem; }
.caption-line { padding: .85rem; border-radius: .75rem; background: var(--canvas); }
.caption-line.translated { border-inline-start: .32rem solid var(--ready); background: var(--caption); }
.caption-line h2 { margin: 0 0 .3rem; color: var(--muted); font-size: .8rem; font-weight: 680; }
.caption-line p { margin: 0; font-size: clamp(1.08rem, 5.2vw, 1.45rem); line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.translated p { font-weight: 640; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`

export const mobileCompanionScript = String.raw`
const get = id => document.getElementById(id)
const connection = get('connection')
const pairStatus = get('pair-status')
const translationStatus = get('translation-status')
const subtitleStatus = get('subtitle-status')
const source = get('source-text')
const target = get('result-text')
const sourceLanguage = get('source-language')
const targetLanguage = get('target-language')
const modeTabs = [get('text-tab'), get('caption-tab')]
let token = ''
let captionsController
let translationController

function status(element, message, error = false) {
  element.textContent = message
  element.dataset.error = String(error)
}

function clearCaption() {
  get('caption').hidden = true
  get('caption-source').textContent = ''
  get('caption-target').textContent = ''
}

function switchTab(tab, focus = false) {
  for (const entry of modeTabs) {
    const active = entry === tab
    entry.setAttribute('aria-selected', String(active))
    entry.tabIndex = active ? 0 : -1
    get(entry.getAttribute('aria-controls')).hidden = !active
  }
  if (focus) tab.focus()
}

function setConnection(message, ready = false) {
  connection.textContent = message
  connection.dataset.state = ready ? 'ready' : 'offline'
}

function disconnect(message = '', error = false) {
  token = ''
  captionsController?.abort()
  translationController?.abort()
  clearCaption()
  source.value = ''
  target.value = ''
  status(translationStatus, '')
  get('workspace').hidden = true
  get('pairing').hidden = false
  get('pair-code').value = ''
  setConnection('尚未配對')
  status(pairStatus, message, error)
  get('pair-code').focus()
}

function auth(session) {
  return { Authorization: 'Bearer ' + session }
}

function post(path, data, session, signal) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? auth(session) : {}) },
    body: JSON.stringify(data),
    signal,
    credentials: 'same-origin',
    cache: 'no-store'
  })
}

get('pair-form').addEventListener('submit', async event => {
  event.preventDefault()
  const button = get('pair-button')
  if (button.disabled) return
  button.disabled = true
  status(pairStatus, '正在配對…')
  try {
    const reply = await post('/pair', {code: get('pair-code').value.trim()})
    if (!reply.ok) {
      status(pairStatus, reply.status === 429 ? '嘗試次數過多，請稍後重試。' : '配對失敗，請確認電腦上的配對碼。', true)
      return
    }
    const data = await reply.json()
    if (typeof data.token !== 'string' || !data.token) throw new Error('Incorrect reply')
    token = data.token
    get('pair-code').value = ''
    status(pairStatus, '')
    get('pairing').hidden = true
    get('workspace').hidden = false
    setConnection('已配對', true)
    switchTab(modeTabs[0], true)
    connectCaptions()
  } catch {
    status(pairStatus, '連不到 VocaLume，請確認電腦與連線。', true)
  } finally {
    button.disabled = false
  }
})

get('disconnect-button').addEventListener('click', () => disconnect())
for (const tab of modeTabs) {
  tab.addEventListener('click', () => switchTab(tab))
  tab.addEventListener('keydown', event => {
    const index = modeTabs.indexOf(tab)
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      switchTab(modeTabs[1 - index], true)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      switchTab(modeTabs[event.key === 'Home' ? 0 : 1], true)
    }
  })
}

function clearTranslation() {
  translationController?.abort()
  translationController = undefined
  target.value = ''
  status(translationStatus, '')
  get('copy-button').disabled = true
  get('translate-button').disabled = false
}
for (const [element, event] of [[source, 'input'], [sourceLanguage, 'change'], [targetLanguage, 'change']]) {
  element.addEventListener(event, clearTranslation)
}
get('swap-languages').addEventListener('click', () => {
  [sourceLanguage.value, targetLanguage.value] = [targetLanguage.value, sourceLanguage.value]
  clearTranslation()
})

get('translation-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (!token) return
  const text = source.value.trim()
  const from = sourceLanguage.value
  const to = targetLanguage.value
  if (!text || from === to) {
    status(translationStatus, !text ? '請輸入要翻譯的文字。' : '請選擇不同的原文與譯文語言。', true)
    return
  }
  clearTranslation()
  const controller = new AbortController()
  translationController = controller
  get('translate-button').disabled = true
  status(translationStatus, '電腦正在翻譯…')
  try {
    const reply = await post('/translate', {text, from, to}, token, controller.signal)
    if (controller.signal.aborted) return
    if (reply.status === 401) {
      disconnect('配對已失效，請重新配對。', true)
      return
    }
    if (!reply.ok) {
      const busy = reply.status === 429 || reply.status === 503
      status(translationStatus, busy ? '電腦忙碌，請稍後再翻譯。' : '翻譯失敗，請檢查電腦上的翻譯模型。', true)
      return
    }
    const data = await reply.json()
    if (controller.signal.aborted) return
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Empty translation')
    target.value = data.text
    get('copy-button').disabled = false
    status(translationStatus, '翻譯完成')
  } catch {
    if (!controller.signal.aborted) status(translationStatus, '未收到譯文，請重新翻譯。', true)
  } finally {
    if (translationController === controller) {
      translationController = undefined
      get('translate-button').disabled = false
    }
  }
})

get('copy-button').addEventListener('click', async () => {
  if (!target.value) return
  try {
    await navigator.clipboard.writeText(target.value)
    status(translationStatus, '已複製譯文')
  } catch {
    target.focus()
    target.select()
    target.setSelectionRange(0, target.value.length)
    let copied = false
    try { copied = document.execCommand('copy') } catch {}
    status(translationStatus, copied ? '已複製譯文' : '譯文已選取，可用手機的複製選單。')
  }
})

function renderCaption(payload) {
  if (payload === null) {
    clearCaption()
    subtitleStatus.textContent = '等待電腦字幕。請在電腦上開始語音翻譯。'
    return
  }
  if (typeof payload?.sourceText !== 'string' || typeof payload?.translatedText !== 'string') return
  get('caption').hidden = false
  get('caption-source').textContent = payload.sourceText
  get('caption-target').textContent = payload.translatedText
  subtitleStatus.textContent = ''
}

async function readCaptions(body, signal) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const {done, value} = await reader.read()
      if (done || signal.aborted) break
      buffer += decoder.decode(value, {stream: true})
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      if (buffer.length > 65536) throw new Error('Caption frame too large')
      for (const frame of frames) {
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
        if (data) renderCaption(JSON.parse(data))
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function backoff(ms, signal) {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return }
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, {once: true})
  })
}

function connectCaptions() {
  if (!token) return
  captionsController?.abort()
  clearCaption()
  subtitleStatus.textContent = '正在連接字幕…'
  const controller = new AbortController()
  captionsController = controller
  void followCaptions(token, controller.signal)
}

async function followCaptions(session, signal) {
  let delay = 1000
  while (!signal.aborted && session === token) {
    try {
      const reply = await fetch('/events', {headers: auth(session), signal, cache: 'no-store'})
      if (signal.aborted) return
      if (reply.status === 401) {
        disconnect('配對已失效，請重新配對。', true)
        return
      }
      if (!reply.ok || !reply.body) throw new Error('Could not open caption stream')
      setConnection('已配對', true)
      subtitleStatus.textContent = '等待電腦字幕。'
      delay = 1000
      await readCaptions(reply.body, signal)
    } catch {
      // Both network failures and interrupted streams use the same retry.
    }
    if (signal.aborted) return
    clearCaption()
    setConnection('字幕連線中斷')
    subtitleStatus.textContent = '正在重新連接字幕…'
    await backoff(delay, signal)
    delay = Math.min(8000, delay * 2)
  }
}

window.addEventListener('online', connectCaptions)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && token) connectCaptions()
})
`
