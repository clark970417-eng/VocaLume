// Shared social and general website adapter: page/chat/comment translation,
// reviewable writing drafts, and the tab-audio caption surface.
(() => {
  if (window.__jtlSocial) return;
  window.__jtlSocial = true;

  const host = location.hostname.toLowerCase();
  const isDomain = domain => host === domain || host.endsWith(`.${domain}`);
  const site = isDomain('bilibili.com') ? 'bilibili'
    : isDomain('tiktok.com') ? 'tiktok'
    : isDomain('twitch.tv') ? 'twitch'
    : isDomain('facebook.com') ? 'facebook'
    : isDomain('instagram.com') ? 'instagram'
    : isDomain('discord.com') || isDomain('discordapp.com') ? 'discord'
    : 'generic';
  const dedicatedSite = site !== 'generic';
  const editableSelector = 'textarea, input:not([type]), input[type="text"], [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]';
  const draftPurpose = /comment|message|chat|reply|post|留言|評論|评论|訊息|消息|私訊|私信|聊天|回覆|回复|發佈|发布|弹幕|彈幕|コメント|メッセージ|返信|チャット|投稿|댓글|메시지|답글|채팅|게시/iu;
  const excludedPurpose = /search|搜尋|搜索|検索|검색|e-?mail|電子郵件|电子邮件|メールアドレス|이메일|password|密碼|密码|パスワード|비밀번호|電話|电话|phone|url|網址|网址|login|登入|登录|ログイン|로그인/iu;
  const chatContainer = '[role="log"], [data-testid*="composer" i], [data-testid*="chat-input" i], [data-testid*="message-input" i]';

  const configs = {
    discord: {
      // Channel headings, usernames, roles and live announcers are not messages.
      title: [],
      text: ['[id^="message-content-"]'],
      composer: ['[role="textbox"][data-slate-editor="true"]', 'main [role="textbox"][contenteditable="true"]']
    },
    bilibili: {
      title: ['h1.video-title', 'h1[title]', '.video-title', '.live-title', '.room-title'],
      text: [
        '.danmaku-item .danmaku-content', '.chat-item .danmaku-content',
        '.chat-item .text', '.live-chat-item .content', '.reply-content',
        '.root-reply .reply-content', '.sub-reply-content',
        '.comment-container .text', 'bili-comment-renderer [class*="content"]'
      ],
      composer: [
        '#chat-control-panel-vm textarea', 'chat-control-panel textarea',
        '.chat-input-ctnr textarea', '.chat-input-ctnr input[type="text"]',
        '.chat-input-ctnr [contenteditable="true"]', 'textarea.chat-input', 'input.chat-input',
        '.chat-input textarea', '.chat-input input', '.chat-input[contenteditable="true"]', '.chat-input [contenteditable="true"]',
        'textarea[placeholder*="弹幕"]', 'input[placeholder*="弹幕"]', '[contenteditable="true"][data-placeholder*="弹幕"]',
        '[contenteditable="true"][aria-label*="弹幕"]',
        '.reply-box textarea', '.reply-box [contenteditable="true"]',
        '.comment-box textarea', '.comment-box [contenteditable="true"]',
        '.comment-send textarea', '.bili-comment [contenteditable="true"]',
        'textarea[placeholder*="评论"]'
      ]
    },

    twitch: {
      title: ['h1[data-a-target="stream-title"]', '[data-a-target="stream-title"]', 'h1'],
      text: ['[data-a-target="chat-line-message-body"]', '[data-test-selector="chat-line-message-body"]', '.chat-line__message'],
      composer: [
        '[data-a-target="chat-input"] textarea',
        '[data-a-target="chat-input"] [contenteditable="true"]',
        '.chat-input [data-slate-editor="true"]',
        'textarea[data-a-target="chat-input"]', '[data-a-target="chat-input"] input',
        'input[data-a-target="chat-input"]',
        '[contenteditable="true"][data-a-target="chat-input"]'
      ]
    },
    tiktok: {
      title: ['h1[data-e2e="browse-video-desc"]', '[data-e2e="browser-nickname"] + div', 'h1'],
      text: [
        '[data-e2e="chat-message"] [data-e2e="message-text"]',
        '[data-e2e="chat-message"] [class*="CommentContent"]',
        '[data-e2e="chat-message"]', '[data-e2e="comment-level-1"]',
        '[data-e2e="comment-level-2"]',
        '[data-e2e="comment-item"] [class*="CommentText"]',
        '[class*="DivCommentItemContainer"] [class*="CommentText"]'
      ],
      composer: [
        '[data-e2e="comment-input"] textarea', '[data-e2e="comment-input"] input', '[data-e2e="comment-input"] [contenteditable="true"]',
        '[data-e2e="chat-input"] textarea', '[data-e2e="chat-input"] input', '[data-e2e="chat-input"] [contenteditable="true"]',
        '[class*="CommentInput"] textarea', '[class*="CommentInput"] [contenteditable="true"]',
        '[contenteditable="true"][data-placeholder*="comment" i]',
        '[contenteditable="true"][aria-label*="comment" i]',
        '[contenteditable="true"][data-placeholder*="chat" i]',
        '[contenteditable="true"][aria-label*="chat" i]'
      ]
    },
    facebook: {
      title: ['[role="main"] h1', 'main h1', 'h1'],
      text: [
        '[role="article"] [dir="auto"]', '[role="log"] [dir="auto"]',
        '[aria-label*="comment" i] [dir="auto"]', '[aria-label*="留言"] [dir="auto"]',
        '[aria-label*="評論"] [dir="auto"]', '[data-ad-preview="message"]'
      ],
      composer: [
        '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
        '[contenteditable="true"][aria-label*="comment" i]', '[contenteditable="true"][aria-label*="留言"]',
        'textarea[placeholder*="comment" i]', 'textarea[placeholder*="留言"]'
      ]
    },
    instagram: {
      title: ['main h1', 'article h1', 'h1'],
      text: [
        'article ul li span[dir="auto"]', 'article [role="button"] + span[dir="auto"]',
        '[role="dialog"] ul li span[dir="auto"]', '[role="log"] [dir="auto"]',
        '[aria-label*="comment" i] [dir="auto"]'
      ],
      composer: [
        'textarea[placeholder*="comment" i]', 'textarea[aria-label*="comment" i]',
        '[contenteditable="true"][role="textbox"]', '[contenteditable="true"][aria-label*="comment" i]'
      ]
    },
    generic: {
      title: ['main h1', '[role="main"] h1', 'article h1', 'h1'],
      text: [
        '[role="log"] [role="listitem"]', '[role="log"] [dir="auto"]',
        '[role="feed"] [role="article"] p', '[role="article"] [class*="comment" i]',
        '[class*="comment" i] p', '[class*="message" i] [dir="auto"]',
        '[data-testid*="comment" i]', '[data-testid*="message" i]',
        '[aria-label*="comment" i] [dir="auto"]', '[aria-label*="chat" i] [dir="auto"]'
      ],
      composer: [
        '[contenteditable="true"][role="textbox"]',
        'textarea[placeholder*="comment" i]', 'textarea[placeholder*="message" i]',
        'textarea[placeholder*="chat" i]', 'textarea[placeholder*="reply" i]',
        '[contenteditable="true"][aria-label*="comment" i]',
        '[contenteditable="true"][aria-label*="message" i]',
        '[contenteditable="true"][aria-label*="chat" i]',
        '[contenteditable="true"][aria-label*="reply" i]'
      ]
    }
  };
  const config = configs[site];
  const composerSelectors = [...config.composer, editableSelector];
  let translated = new WeakMap();
  const lineOwners = new WeakMap();
  const composers = new WeakMap();
  const composing = new WeakSet();
  let activeComposer;
  let activeControls;
  let composerLayoutObserver;
  let composerPosition;
  let contextInvalid = false;
  let pageObserver;
  const contextRecoveryMessage = '擴充功能已重新載入。請先保留未送出的留言，再重新整理此頁恢復翻譯。';
  const cache = new Map();
  const translationInFlight = new Map();
  const translationQueue = [];
  let activeTranslations = 0;
  let translationOrder = 0;
  const MAX_ACTIVE_TRANSLATIONS = 3;
  const MAX_CACHED_TRANSLATIONS = 500;
  let enabled = false;
  let globalTextEnabled = true;
  let currentSiteEnabled = dedicatedSite;
  let epoch = 0;
  let subtitleRevision = 0;
  let subtitleExpiryTimer;
  let lastSubtitleSignature = '';
  let captionBox;
  let streamerChatMode = false;
  let languageSettings={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
  const pageUi = globalThis.VocaLumePageLanguage;
  const domChanges = globalThis.VocaLumeDomChanges;
  const uiText = value => pageUi?.text(value) ?? value;
  function setUi(element, value, property = 'textContent') {
    if (pageUi) { pageUi.bind(element, value, property); return; }
    const text = typeof value === 'function' ? value() : value;
    if (property === 'textContent') { if (element.textContent !== text) element.textContent = text; }
    else element.setAttribute(property, text);
  }
  const langLabel=code=>{const label=({ja:'日',zh:'中',en:'英',ko:'韓',es:'西',fr:'法',de:'德',pt:'葡',it:'義',ru:'俄',th:'泰',vi:'越',id:'印尼',ar:'阿'})[code]||code.toUpperCase();return pageUi?.label(code,label)??label;};
  const direction=kind=>`${languageSettings[kind+'Source']}-${languageSettings[kind+'Target']}`;
  const languagePattern={ja:/[\u3040-\u30ff]/,zh:/[\u3400-\u9fff]/,ko:/[\uac00-\ud7af]/,ru:/[\u0400-\u04ff]/,ar:/[\u0600-\u06ff]/,th:/[\u0e00-\u0e7f]/};
  const matchesLanguage=(text,lang)=>(lang==='ja'&&globalThis.VocaLumeStreamerVocabulary?.isStandaloneGreeting(text))||(languagePattern[lang]?.test(text)??/[A-Za-zÀ-ž]/.test(text));
  const matchesReadLanguage=text=>globalThis.VocaLumeTranslationGuards.shouldTranslateReading(text,languageSettings.readSource,languageSettings.readTarget);

  const hasJapanese = text => /[\u3040-\u30ff]/.test(text);
  const hasChinese = text => /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function messageTextNode(node) {
    if (!node?.querySelectorAll || site === 'discord') return node;
    const explicit = node.querySelector?.([
      '[data-e2e="message-text"]', '[class*="CommentContent"]', '[class*="CommentText"]',
      '.danmaku-content', '.reply-content', '.sub-reply-content'
    ].join(','));
    if (explicit && matchesReadLanguage(clean(explicit.innerText || explicit.textContent))) return explicit;

    // TikTok's fallback chat selector can cover the avatar, nickname, badge and
    // message in one React container. Prefer the smallest Japanese leaf that is
    // not part of account metadata so names and rankings are not translated.
    const metadata = '[data-e2e*="user" i],[data-e2e*="avatar" i],[class*="Author"],[class*="Avatar"],[class*="Nickname"],[class*="UserName"],a';
    const candidates = [...node.querySelectorAll('span,p,div')].filter(element => {
      if (element.closest?.(metadata)) return false;
      const text = clean(element.innerText || element.textContent);
      if (!text || !matchesReadLanguage(text)) return false;
      return ![...element.children].some(child => matchesReadLanguage(clean(child.innerText || child.textContent)));
    });
    return candidates.sort((a, b) => clean(a.innerText || a.textContent).length - clean(b.innerText || b.textContent).length)[0] || node;
  }

  function bridgeError(error) {
    const description = String(error?.message || error || '本機翻譯服務未啟動');
    if (!contextInvalid && !/extension context invalidated/i.test(description)) return new Error(description);
    if (!contextInvalid) {
      contextInvalid = true;
      clearTimeout(subtitleExpiryTimer);
      pageObserver?.disconnect?.();
      composerLayoutObserver?.disconnect();
      if (captionBox) {
        captionBox.controller.render([]);
        captionBox.hidden = true;
      }
      const button = activeControls?.children[0], status = activeControls?.children[1];
      if (button) { button.disabled = true; setUi(button, contextRecoveryMessage, 'title'); }
      if (status) setUi(status, contextRecoveryMessage);
      for (const task of translationQueue.splice(0)) {
        if (translationInFlight.get(task.key) === task) translationInFlight.delete(task.key);
        task.reject(new Error(contextRecoveryMessage));
      }
    }
    return new Error(contextRecoveryMessage);
  }

  function message(payload) {
    return new Promise((resolve, reject) => {
      if (contextInvalid) { reject(bridgeError(contextRecoveryMessage)); return; }
      try {
        chrome.runtime.sendMessage(payload, reply => {
          try {
            const error = chrome.runtime.lastError;
            if (contextInvalid || error || !reply?.ok) reject(bridgeError(error || reply?.error));
            else resolve(reply.text);
          } catch (error) { reject(bridgeError(error)); }
        });
      } catch (error) { reject(bridgeError(error)); }
    });
  }

  function pumpTranslations() {
    while (activeTranslations < MAX_ACTIVE_TRANSLATIONS && translationQueue.length) {
      translationQueue.sort((a, b) => b.order - a.order);
      const task = translationQueue.shift();
      if (task.epoch !== epoch || !enabled || ![...task.consumers].some(valid => valid())) {
        if (translationInFlight.get(task.key) === task) translationInFlight.delete(task.key);
        task.reject(new Error('留言已離開畫面'));
        continue;
      }
      activeTranslations++;
      message({type: 'translate', text: task.source, direction: task.direction, priority: task.isTitle, ...(task.livestreamChat && {livestreamChat: true})})
        .then(result => {
          if (typeof result !== 'string' || !result.trim()) throw new Error('沒有收到譯文');
          if (task.epoch === epoch && enabled) {
            cache.delete(task.key);
            cache.set(task.key, result);
            if (cache.size > MAX_CACHED_TRANSLATIONS) cache.delete(cache.keys().next().value);
          }
          task.resolve(result);
        })
        .catch(error => {
          if (translationInFlight.get(task.key) === task) translationInFlight.delete(task.key);
          task.reject(error);
        })
        .finally(() => {
          activeTranslations--;
          if (translationInFlight.get(task.key) === task) translationInFlight.delete(task.key);
          pumpTranslations();
        });
    }
  }

  function requestTranslation(source, isTitle, order, isValid, readDirection = direction('read'), livestreamChat = false) {
    const key = `${livestreamChat}:${readDirection}:${source}`;
    if (cache.has(key)) {
      const result = cache.get(key);
      cache.delete(key); cache.set(key, result);
      return Promise.resolve(result);
    }
    let task = translationInFlight.get(key);
    if (!task || task.epoch !== epoch) {
      task = {key, source, isTitle, direction: readDirection, livestreamChat, epoch, consumers: new Set(), order: order ?? ++translationOrder};
      task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
      // Register ownership before the pump can reject an obsolete task.
      translationInFlight.set(key, task);
      translationQueue.push(task);
    }
    task.consumers.add(isValid || (() => true));
    pumpTranslations();
    return task.promise;
  }

  async function translateNode(node, isTitle = false, order) {
    if (contextInvalid || !enabled || !node?.isConnected || node.closest?.('.jtl-social-translation,.jtl-social-controls')) return;
    const auto = site === 'twitch' && streamerChatMode && !isTitle;
    if (!isTitle && !auto) node = messageTextNode(node);
    const detectionEpoch = epoch;
    const source = clean(node.innerText || node.textContent);
    const parent = node.parentElement;
    // The background translator safely splits long messages. Keep only a
    // generous guard against accidentally selecting an entire chat timeline.
    const readDirection = auto
      ? await globalThis.VocaLumeTranslationGuards.streamerChatDirection(source, languageSettings.readTarget, value => chrome.i18n.detectLanguage(value))
      : matchesReadLanguage(source) ? direction('read') : null;
    if (detectionEpoch !== epoch || !node.isConnected || clean(node.innerText || node.textContent) !== source) return;
    let line = parent?.querySelector(':scope > .jtl-social-translation');
    if (!source || source.length > 3000 || !readDirection) {
      if (translated.has(node)) {
        translated.delete(node);
        if (line) { lineOwners.delete(line); line.remove(); }
      }
      return;
    }
    if (translated.get(node) === source) return;
    translated.set(node, source);
    const currentEpoch = epoch;
    if (!line) {
      line = document.createElement('div');
      line.className = `jtl-social-translation${isTitle ? ' jtl-social-title' : ''}`;
      node.insertAdjacentElement('afterend', line);
    }
    const owner = {};
    lineOwners.set(line, owner);
    const ownsLine = () => lineOwners.get(line) === owner;
    const valid = () => ownsLine() && enabled && currentEpoch === epoch && node.isConnected && clean(node.innerText || node.textContent) === source;
    const discard = () => {
      if (currentEpoch === epoch && translated.get(node) === source) translated.delete(node);
      if (ownsLine()) line.remove();
    };
    line.textContent = '';
    setUi(line, () => `${langLabel(languageSettings.readTarget)}：${uiText('翻譯中…')}`);
    try {
      const result = await requestTranslation(source, isTitle, order, valid, readDirection, auto);
      if (!valid()) { discard(); return; }
      setUi(line, () => `${langLabel(languageSettings.readTarget)}：${result}`);
    } catch (_) {
      // Keep the failed source marked after background recovery so the status mutation
      // cannot cause the page observer to resubmit it forever.
      if (valid()) {
        if (contextInvalid) { setUi(line, contextRecoveryMessage); return; }
        setUi(line, () => `${langLabel(languageSettings.readTarget)}：${uiText('翻譯暫時失敗。')}`);
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'jtl-retry';
        setUi(retry, '再試一次');
        setUi(retry, '重新翻譯這則內容', 'aria-label');
        setUi(retry, '保留原文，重新取得翻譯', 'title');
        retry.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          if (retry.disabled || !valid()) return;
          retry.disabled = true;
          translated.delete(node);
          void translateNode(node, isTitle, 1_000_000_000 + ++translationOrder);
        });
        line.append(retry);
      }
      else discard();
    }
  }

  function editableText(box) {
    return String(('value' in box ? box.value : (box.innerText || box.textContent)) || '')
      .replace(/\r\n/g, '\n').replace(/[\u200b\ufeff]/g, '').trim();
  }

  async function replaceEditable(box, text) {
    const doc = box.ownerDocument || document;
    const view = doc.defaultView || window;
    const source = editableText(box);
    const expected = String(text).replace(/\r\n/g, '\n').replace(/[\u200b\ufeff]/g, '').trim();
    const settle = async () => {
      // Let the framework commit its editor transaction before verifying it.
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
      return box.isConnected && editableText(box) === expected;
    };
    box.focus({preventScroll: true});
    if ('value' in box) {
      // Bypass React's per-element value tracker so its input handler observes
      // a real change instead of retaining the Chinese submission value.
      const prototype = box.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement?.prototype
        : box.tagName === 'INPUT' ? view.HTMLInputElement?.prototype : null;
      const setter = Object.getOwnPropertyDescriptor(prototype || Object.getPrototypeOf(box), 'value')?.set;
      if (setter) setter.call(box, text); else box.value = text;
      box.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType: 'insertReplacementText', data: text}));
      box.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
      return settle();
    }
    const selection = view.getSelection();
    if (!selection) return false;
    const range = doc.createRange();
    range.selectNodeContents(box);
    // Slate resolves leaf text points, including multi-line editors, reliably.
    const leaves = [...(box.querySelectorAll?.('[data-slate-string], [data-slate-zero-width]') || [])];
    const first = leaves[0]?.firstChild, last = leaves.at(-1)?.lastChild;
    if (first?.nodeType === 3 && last?.nodeType === 3) {
      range.setStart(first, 0); range.setEnd(last, last.textContent.length);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent?.(new Event('selectionchange'));
    let targetRanges = [];
    if (view.StaticRange) targetRanges = [new view.StaticRange({
      startContainer: range.startContainer, startOffset: range.startOffset,
      endContainer: range.endContainer, endOffset: range.endOffset
    })];
    // Slate/Lexical own the document model. Ask them to replace the selected
    // range; changing textContent only changes the pixels, not what is sent.
    let data;
    if (typeof DataTransfer === 'function') {
      data = new DataTransfer();
      data.setData('text/plain', text);
    }
    const before = new InputEvent('beforeinput', {bubbles: true, composed: true, cancelable: true,
      inputType: 'insertReplacementText', data: text, dataTransfer: data, targetRanges});
    box.dispatchEvent(before);
    if (before.defaultPrevented) return settle();
    if (editableText(box) !== source || !box.isConnected) return false;
    if (data && typeof ClipboardEvent === 'function') {
      const paste = new ClipboardEvent('paste', {bubbles: true, composed: true, cancelable: true, clipboardData: data});
      box.dispatchEvent(paste);
      if (paste.defaultPrevented) return settle();
      if (editableText(box) !== source || !box.isConnected) return false;
    }
    const managed = site === 'discord' || site === 'twitch' || box.matches?.('[data-slate-editor], [data-lexical-editor]') || box.querySelector?.('[data-contents]');
    if (managed) return false;
    let notified = false;
    const observeNativeInput = event => { if (event.isTrusted) notified = true; };
    box.addEventListener('input', observeNativeInput, true);
    try {
      return Boolean(doc.execCommand?.('insertText', false, text) && notified) && settle();
    } finally {
      box.removeEventListener('input', observeNativeInput, true);
    }
  }

  function composerHost(box) {
    return box.closest('[data-e2e="comment-input"], [data-e2e="chat-input"], .chat-input, .reply-box, .comment-box, .comment-send') || box.parentElement;
  }

  function positionComposerControls(box, controls) {
    if (controls.dataset.placement !== 'floating' || !box?.isConnected || !controls.isConnected) return;
    if (composerPosition) {
      const size = controls.getBoundingClientRect();
      const left = Math.max(8, Math.min(composerPosition.left, window.innerWidth - size.width - 8));
      const top = Math.max(8, Math.min(composerPosition.top, window.innerHeight - size.height - 8));
      controls.style.left = `${left}px`;
      controls.style.top = `${top}px`;
      controls.style.visibility = 'visible';
      return;
    }
    const editorRect = box.getBoundingClientRect();
    const hostRect = composerHost(box)?.getBoundingClientRect?.();
    const rect = hostRect && hostRect.height < window.innerHeight * .65 && hostRect.top <= editorRect.top && hostRect.bottom >= editorRect.bottom
      ? hostRect : editorRect;
    if (!Number.isFinite(rect.top)) return;
    const size = controls.getBoundingClientRect?.() || {width: 280, height: 36};
    const margin = 8, width = window.innerWidth, height = window.innerHeight;
    const left = Math.max(margin, Math.min(rect.left, width - size.width - margin));
    const above = rect.top - size.height - margin;
    let below = rect.bottom + margin;
    if (above < margin) {
      const scope = box.closest('form') || composerHost(box);
      const sendButtons = scope?.querySelectorAll('button:not([type]), button[type="submit"], input[type="submit"], [data-e2e*="send"], [data-a-target*="send"]') || [];
      for (const send of sendButtons) {
        const bounds = send.getBoundingClientRect();
        if (bounds.height > 0 && bounds.right > left && bounds.left < left + size.width && bounds.bottom > rect.bottom) {
          below = Math.max(below, bounds.bottom + margin);
        }
      }
    }
    // Never dock over the native composer or its bottom-right Send button.
    const top = above >= margin ? above : below + size.height <= height - margin ? below : null;
    // Keep its measured dimensions while hidden, avoiding ResizeObserver loops.
    controls.style.visibility = top === null || rect.bottom < 0 || rect.top > height ? 'hidden' : 'visible';
    if (top === null) return;
    controls.style.left = `${left}px`;
    controls.style.top = `${top}px`;
  }

  function mountComposerControls(box, controls) {
    const anchor = composerPosition ? null : site === 'discord' ? box.closest('form') || box.closest('[class*="channelTextArea"]') || composerHost(box)
      : site === 'twitch' ? box.closest('.chat-input') || box.closest('form') || composerHost(box) : null;
    if (anchor?.parentElement && anchor.insertAdjacentElement) {
      controls.dataset.placement = 'inline';
      // A separate row before the native composer leaves its Send area free.
      anchor.insertAdjacentElement('beforebegin', controls);
    } else {
      controls.dataset.placement = 'floating';
      (document.body || composerHost(box))?.append(controls);
      positionComposerControls(box, controls);
    }
  }

  function isUsableComposer(box) {
    if (!box?.isConnected || !box.matches?.(editableSelector) || box.readOnly || box.matches?.(':disabled,[aria-disabled="true"]') ||
        box.closest?.('.jtl-social-controls,.jtl-social-translation')) return false;
    const purposeAttributes = ['name', 'aria-label', 'placeholder', 'data-placeholder', 'data-testid'];
    const labelledBy = (box.getAttribute?.('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const root = box.getRootNode?.();
    const purpose = clean([
      ...purposeAttributes.map(name => box.getAttribute?.(name)),
      ...labelledBy.map(id => root?.getElementById?.(id)?.textContent),
      ...Array.from(box.labels || [], label => label.textContent)
    ].join(' '));
    if (excludedPurpose.test(purpose)) return false;
    const dedicated = site !== 'generic' && config.composer.some(selector => box.matches?.(selector));
    if (!dedicated && !draftPurpose.test(purpose) && !box.closest?.(chatContainer)) return false;
    const rect = box.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function installComposer(box, force = false) {
    if (contextInvalid || !enabled || !box?.isConnected) return;
    if (activeComposer === box && activeControls?.isConnected) return;
    // Dynamic pages contain many unrelated text fields. Once a real composer
    // is selected, background scans must not rebind the single visible button
    // to a search field or an off-screen editor.
    if (!force && isUsableComposer(activeComposer) && activeControls?.isConnected) return;
    const previous = composers.get(box);
    if (previous?.isConnected) return;
    activeControls?.remove();
    composerLayoutObserver?.disconnect();
    const controls = document.createElement('div');
    controls.className = 'jtl-social-controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jtl-social-language';
    setUi(button, () => `${langLabel(languageSettings.typeSource)} → ${langLabel(languageSettings.typeTarget)}`);
    setUi(button, '翻譯留言草稿', 'aria-label');
    setUi(button, 'Tab 或點一下翻譯；長按可拖曳位置，確認後自行送出', 'title');
    let press, holdTimer, suppressClick = false, movingControls = false;
    const finishDrag = event => {
      if (!press || event.pointerId !== press.id) return;
      clearTimeout(holdTimer);
      if (press.dragging) { event.preventDefault(); event.stopPropagation(); }
      press = null;
    };
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || press) return;
      suppressClick = false;
      press = {id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false};
      button.setPointerCapture?.(event.pointerId);
      holdTimer = setTimeout(() => {
        if (!press || !controls.isConnected) return;
        const rect = controls.getBoundingClientRect();
        press.dragging = true;
        press.left = rect.left; press.top = rect.top;
        suppressClick = true;
        controls.dataset.placement = 'floating';
        const target = document.body || composerHost(box);
        // Reparenting an inline button releases pointer capture in Chromium.
        // Reacquire it after the move so dragging continues outside the pill.
        movingControls = true;
        if (controls.parentElement !== target) target?.append(controls);
        button.setPointerCapture?.(press.id);
        movingControls = false;
        composerPosition = {left: rect.left, top: rect.top};
        positionComposerControls(box, controls);
      }, 350);
    });
    button.addEventListener('pointermove', event => {
      if (!press || event.pointerId !== press.id) return;
      if (!press.dragging) {
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) clearTimeout(holdTimer);
        return;
      }
      event.preventDefault(); event.stopPropagation();
      composerPosition = {left: press.left + event.clientX - press.x, top: press.top + event.clientY - press.y};
      positionComposerControls(box, controls);
    });
    button.addEventListener('pointerup', finishDrag);
    button.addEventListener('pointercancel', finishDrag);
    button.addEventListener('lostpointercapture', event => { if (!movingControls) finishDrag(event); });
    button.addEventListener('mousedown', event => event.preventDefault());
    const status = document.createElement('span');
    status.className = 'jtl-social-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const preview = document.createElement('textarea');
    preview.className = 'jtl-social-draft';
    preview.readOnly = true;
    preview.hidden = true;
    setUi(preview, '翻譯草稿', 'aria-label');
    let draftRevision = 0, appliedDraft, appliedDirection;
    const alreadyTranslated = source => source === appliedDraft && direction('type') === appliedDirection;
    controls.noteDraftEdit = () => {
      draftRevision++;
      if (button.disabled) return;
      appliedDraft = undefined;
      preview.hidden = true;
      setUi(status, '');
    };
    controls.addEventListener('keydown', event => event.stopPropagation());
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      if (composing.has(box)) { setUi(status, '請先完成輸入法選字。'); return; }
      const source = editableText(box);
      const currentEpoch = epoch;
      const requestedRevision = draftRevision;
      if (!source) { setUi(status, '請先輸入留言。'); return; }
      if (alreadyTranslated(source)) return;
      button.disabled = true;
      preview.hidden = true;
      preview.value = '';
      setUi(status, '翻譯中…');
      try {
        const result = await message({type: 'make-draft', text: source, direction: direction('type')});
        if (!enabled || currentEpoch !== epoch || !box.isConnected || !controls.isConnected) return;
        if (draftRevision !== requestedRevision || editableText(box) !== source) {
          setUi(status, '原文已修改，請重新翻譯');
          return;
        }
        if (composing.has(box)) { setUi(status, '請先完成輸入法選字。'); return; }
        if (!result?.draft?.trim()) throw new Error('沒有收到翻譯草稿');
        preview.value = result.draft;
        preview.hidden = false;
        const inserted = await replaceEditable(box, result.draft);
        if (!enabled || currentEpoch !== epoch || !box.isConnected || !controls.isConnected) return;
        if (inserted) { appliedDraft = editableText(box); appliedDirection = direction('type'); }
        preview.hidden = inserted;
        setUi(status, inserted ? '已放入譯文，確認後自行送出' : '留言框未接受譯文；請複製下方草稿後貼入。');
      } catch (error) {
        setUi(status, contextInvalid ? contextRecoveryMessage : '翻譯失敗，請再試一次。');
      } finally {
        button.disabled = contextInvalid;
      }
    });
    controls.append(button, status, preview);
    controls.translateWithTab = event => {
      if (!enabled || !controls.isConnected || event.isComposing || composing.has(box)) return;
      const source = editableText(box), lang = languageSettings.typeSource;
      if (!source || alreadyTranslated(source) || (!matchesLanguage(source, lang) && !(lang === 'ja' && hasChinese(source)))) return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      if(!button.disabled)button.click();
    };
    composers.set(box, controls);
    activeComposer = box;
    activeControls = controls;
    mountComposerControls(box, controls);
    if (typeof ResizeObserver === 'function' && controls.dataset.placement === 'floating') {
      composerLayoutObserver = new ResizeObserver(() => positionComposerControls(box, controls));
      composerLayoutObserver.observe(box); composerLayoutObserver.observe(controls);
    }
  }

  function composerFromEvent(event) {
    return event.composedPath?.().find(node => node.matches?.(editableSelector));
  }

  function focusedComposer(event) {
    const box = composerFromEvent(event);
    if (isUsableComposer(box)) installComposer(box, true);
  }

  function installCaptionBox() {
    if (window.top !== window || captionBox?.isConnected || !document.body) return;
    captionBox = document.createElement('div');
    captionBox.id = 'jtl-social-subtitles';
    captionBox.className = 'jtl-caption-window';
    captionBox.hidden = true;
    captionBox.controller = new window.JtlCaptionWindow(captionBox, `${site}CaptionRect`);
    lastSubtitleSignature = '';
    document.body.append(captionBox);
  }

  function renderSubtitles(data) {
    clearTimeout(subtitleExpiryTimer);
    if (document.hidden) return;
    installCaptionBox();
    if (!captionBox) return;
    const item = data.running ? data.items?.at(-1) : null;
    const expiresIn = ((item?.expiresAt ?? item?.updatedAt + 3) * 1000) - Date.now();
    const fresh = item && !item.expired && expiresIn > 0;
    const rows = data.running ? (item?.recordingRows || (fresh ? [item] : [])) : [];
    const signature = JSON.stringify(rows);
    if (signature !== lastSubtitleSignature) {
      lastSubtitleSignature = signature;
      captionBox.controller.render(rows);
    }
    captionBox.hidden = !rows.length;
    if (fresh && !item.recordingRows) subtitleExpiryTimer = setTimeout(() => renderSubtitles({running: false}), expiresIn);
  }

  async function refreshSubtitles() {
    if (contextInvalid || document.hidden || window.top !== window) return;
    const revision = ++subtitleRevision;
    try {
      const data = await message({type: 'subtitles'});
      if (revision !== subtitleRevision) return;
      renderSubtitles(data);
    }
    catch (_) { /* The popup reports actionable capture/desktop errors. */ }
  }

  const semanticRegions = '[role="log"], [aria-live="polite"], [aria-live="assertive"]';
  function scan(scope) {
    if (contextInvalid || document.hidden) return;
    if (activeControls) positionComposerControls(activeComposer, activeControls);
    if (!enabled) return;
    if (window.top === window) config.title.forEach(selector => domChanges.select(scope, selector).forEach(node => translateNode(node, true, 1_000_000_000 + ++translationOrder)));
    // Both sites restore large virtualized chat histories. Keep model work
    // bounded and always let the newest visible messages enter the queue first.
    // Hashed classes change frequently on both sites. ARIA live regions are a
    // stable semantic contract, so scan their smallest Japanese leaves as a
    // fallback when product-specific selectors no longer match.
    const semanticMessages = (site === 'discord' || (site === 'twitch' && streamerChatMode)) ? [] : (scope
      ? domChanges.select(scope, `:is(${semanticRegions}) :is(span,p,div)`)
      : [...document.querySelectorAll(semanticRegions)].flatMap(region => [...region.querySelectorAll('span,p,div')]))
      .filter(element => {
        const text = clean(element.innerText || element.textContent);
        return text && matchesReadLanguage(text) && ![...element.children].some(child => matchesReadLanguage(clean(child.innerText || child.textContent)));
      });
    const messages = [...new Set([
      ...(site === 'twitch' && streamerChatMode ? config.text.slice(0, 2) : config.text).flatMap(selector => domChanges.select(scope, selector)),
      ...semanticMessages
    ])].slice(-20);
    const batch = ++translationOrder * 1000;
    for (let index = messages.length - 1; index >= 0; index--) translateNode(messages[index], false, batch + index);
    if (!isUsableComposer(activeComposer) || !activeControls?.isConnected) {
      const composerScope = activeComposer && !activeComposer.isConnected ? undefined : scope;
      let candidate;
      for (const selector of composerSelectors) {
        candidate = domChanges.select(composerScope, selector).find(isUsableComposer);
        if (candidate) break;
      }
      if (candidate) installComposer(candidate);
    }
  }

  function setEnabled(value) {
    enabled = value !== false;
    epoch++;
    translated = new WeakMap();
    if (!enabled) {
      document.querySelectorAll('.jtl-social-translation,.jtl-social-controls').forEach(node => node.remove());
      activeComposer = null;
      activeControls = null;
      composerLayoutObserver?.disconnect();
    }
    else scan();
  }

  function applyTextAccess() {
    setEnabled(globalTextEnabled && currentSiteEnabled);
  }

  chrome.runtime.onMessage.addListener(payload => {
    if (payload.type === 'subtitle-update' && window.top === window) {
      subtitleRevision++;
      renderSubtitles({running: payload.running !== false, items: [payload.item]});
    }
  });
  chrome.storage.local.get(['websiteTextOptInEnabled','languageSettings','genericSiteAccess','streamerChatMode','captionsHidden']).then(settings => {
    streamerChatMode = settings.streamerChatMode === true;
    languageSettings={...languageSettings,...(settings.languageSettings||{})};
    globalTextEnabled=settings.websiteTextOptInEnabled === true;
    currentSiteEnabled=dedicatedSite || settings.genericSiteAccess?.[host] === true;
    applyTextAccess();
    if (settings.captionsHidden === false) void refreshSubtitles();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.websiteTextOptInEnabled) {globalTextEnabled=changes.websiteTextOptInEnabled.newValue === true;applyTextAccess();}
    if (area === 'local' && changes.genericSiteAccess && !dedicatedSite) {currentSiteEnabled=changes.genericSiteAccess.newValue?.[host] === true;applyTextAccess();}
    if (area === 'local' && changes.streamerChatMode && site === 'twitch') {
      streamerChatMode = changes.streamerChatMode.newValue === true;
      document.querySelectorAll('.jtl-social-translation').forEach(node => node.remove());
      applyTextAccess();
    }
    if (area === 'local' && changes.subtitleSettings) captionBox?.controller.apply(changes.subtitleSettings.newValue);
    if (area === 'local' && (changes.languageSettings || changes.speechMode || changes.cloudTranslation || changes.nvidiaKey || changes.openrouterKey)) {
      if (changes.languageSettings) languageSettings = {...languageSettings, ...changes.languageSettings.newValue};
      epoch++;
      translated = new WeakMap();
      cache.clear();
      document.querySelectorAll('.jtl-social-translation,.jtl-social-controls').forEach(node=>node.remove());
      activeComposer = null;
      activeControls = null;
      composerLayoutObserver?.disconnect();
      pumpTranslations();
      scan();
    }
  });
  pageObserver = domChanges.observe(scan, {
    active: () => enabled && !contextInvalid && !document.hidden,
    attributeFilter: ['contenteditable', 'disabled', 'aria-disabled', 'data-testid', 'data-a-target', 'data-test-selector', 'data-e2e', 'role', 'aria-live']
  });
  document.addEventListener('focusin', focusedComposer, true);
  document.addEventListener('input', event => {
    if (activeComposer === composerFromEvent(event)) activeControls?.noteDraftEdit();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (activeComposer === composerFromEvent(event)) activeControls?.translateWithTab(event);
  }, true);
  document.addEventListener('visibilitychange', () => {
    subtitleRevision++;
    if (document.hidden || contextInvalid) return;
    void refreshSubtitles();
    scan();
  });
  document.addEventListener('compositionstart', event => {
    const box = composerFromEvent(event);
    if (box) composing.add(box);
  }, true);
  document.addEventListener('compositionend', event => {
    const box = composerFromEvent(event);
    if (box) composing.delete(box);
  }, true);
  const reposition = () => { if (activeControls) positionComposerControls(activeComposer, activeControls); };
  window.addEventListener?.('resize', reposition, {passive: true});
  document.addEventListener('scroll', reposition, {capture: true, passive: true});
})();
