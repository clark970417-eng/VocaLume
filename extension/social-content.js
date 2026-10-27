// Shared social and general website adapter: page/chat/comment translation,
// reviewable writing drafts, and the tab-audio caption surface.
(() => {
  if (window.__jtlSocial) return;
  window.__jtlSocial = true;

  const host = location.hostname.toLowerCase();
  const site = host.endsWith('bilibili.com') ? 'bilibili'
    : host.endsWith('tiktok.com') ? 'tiktok'
    : host.endsWith('twitch.tv') ? 'twitch'
    : host.endsWith('facebook.com') ? 'facebook'
    : host.endsWith('instagram.com') ? 'instagram'
    : (host === 'discord.com' || host.endsWith('.discord.com') || host === 'discordapp.com' || host.endsWith('.discordapp.com')) ? 'discord'
    : 'generic';
  const dedicatedSite = site !== 'generic';

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
        '.chat-input textarea', '.chat-input input', '.chat-input[contenteditable="true"]', '.chat-input [contenteditable="true"]',
        'textarea[placeholder*="弹幕"]', 'input[placeholder*="弹幕"]', '[contenteditable="true"][data-placeholder*="弹幕"]',
        '[contenteditable="true"][aria-label*="弹幕"]',
        '.reply-box textarea', '.reply-box [contenteditable="true"]',
        '.comment-box textarea', '.comment-box [contenteditable="true"]',
        '.comment-send textarea', '.bili-comment [contenteditable="true"]',
        'textarea:not([disabled])', '[role="textbox"]',
        '[contenteditable]:not([contenteditable="false"])'
      ]
    },

    twitch: {
      title: ['h1[data-a-target="stream-title"]', '[data-a-target="stream-title"]', 'h1'],
      text: ['[data-a-target="chat-line-message-body"]', '[data-test-selector="chat-line-message-body"]', '.chat-line__message'],
      composer: [
        '[data-a-target="chat-input"] textarea',
        '[data-a-target="chat-input"] [contenteditable="true"]',
        '.chat-input [data-slate-editor="true"]',
        'textarea[data-a-target="chat-input"]',
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
        'textarea:not([disabled])', '[role="textbox"]',
        '[contenteditable]:not([contenteditable="false"])'
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
        '[contenteditable="true"][role="textbox"]',
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
  let translated = new WeakMap();
  const lineOwners = new WeakMap();
  const composers = new WeakMap();
  const composing = new WeakSet();
  let activeComposer;
  let activeControls;
  let composerLayoutObserver;
  let composerPosition;
  let contextInvalid = false;
  let pollTimer;
  let pageObserver;
  const contextRecoveryMessage = '擴充功能已重新載入。請先保留未送出的留言，再重新整理此頁恢復翻譯。';
  const cache = new Map();
  const translationInFlight = new Map();
  const translationQueue = [];
  let activeTranslations = 0;
  let translationOrder = 0;
  const MAX_ACTIVE_TRANSLATIONS = 3;
  let enabled = false;
  let globalTextEnabled = true;
  let currentSiteEnabled = dedicatedSite;
  let epoch = 0;
  let polling = false;
  let lastSubtitleSignature = '';
  let captionBox;
  let languageSettings={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
  const langLabel=code=>({ja:'日',zh:'中',en:'英',ko:'韓',es:'西',fr:'法',de:'德',pt:'葡',it:'義',ru:'俄',th:'泰',vi:'越',id:'印尼',ar:'阿'})[code]||code.toUpperCase();
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
      if (pollTimer != null) clearInterval(pollTimer);
      pageObserver?.disconnect?.();
      composerLayoutObserver?.disconnect();
      if (captionBox) captionBox.hidden = true;
      const button = activeControls?.children[0], status = activeControls?.children[1];
      if (button) { button.disabled = true; button.title = contextRecoveryMessage; }
      if (status) status.textContent = contextRecoveryMessage;
      for (const task of translationQueue.splice(0)) {
        translationInFlight.delete(task.key);
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
      if (task.isValid && !task.isValid()) {
        translationInFlight.delete(task.key);
        task.reject(new Error('留言已離開畫面'));
        continue;
      }
      activeTranslations++;
      message({type: 'translate', text: task.source, direction: direction('read'), priority: task.isTitle})
        .then(result => {
          cache.set(task.key, result);
          task.resolve(result);
        }, error => {
          translationInFlight.delete(task.key);
          task.reject(error);
        })
        .finally(() => {
          activeTranslations--;
          translationInFlight.delete(task.key);
          pumpTranslations();
        });
    }
  }

  function requestTranslation(source, isTitle, order, isValid) {
    const key = `${direction('read')}:${source}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (translationInFlight.has(key)) return translationInFlight.get(key);
    const pending = new Promise((resolve, reject) => {
      translationQueue.push({key, source, isTitle, isValid, order: order ?? ++translationOrder, resolve, reject});
      pumpTranslations();
    });
    translationInFlight.set(key, pending);
    return pending;
  }

  async function translateNode(node, isTitle = false, order) {
    if (contextInvalid || !enabled || !node?.isConnected || node.closest?.('.jtl-social-translation,.jtl-social-controls')) return;
    if (!isTitle) node = messageTextNode(node);
    const source = clean(node.innerText || node.textContent);
    const parent = node.parentElement;
    let line = parent?.querySelector(':scope > .jtl-social-translation');
    // The background translator safely splits long messages. Keep only a
    // generous guard against accidentally selecting an entire chat timeline.
    if (!source || source.length > 3000 || !matchesReadLanguage(source)) {
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
      if (translated.get(node) === source) translated.delete(node);
      if (ownsLine()) line.remove();
    };
    line.textContent = `${langLabel(languageSettings.readTarget)}：翻譯中…`;
    try {
      let result;
      try { result = await requestTranslation(source, isTitle, order, valid); }
      catch (firstError) {
        if (contextInvalid) throw firstError;
        if (!valid()) throw firstError;
        line.textContent = `${langLabel(languageSettings.readTarget)}：第一次失敗，正在重試…`;
        result = await requestTranslation(source, true, (order ?? 0) + 1000000, valid);
      }
      if (!valid()) { discard(); return; }
      line.textContent = `${langLabel(languageSettings.readTarget)}：${result}`;
    } catch (_) {
      // Keep the failed source marked after one retry so the status mutation
      // cannot cause the page observer to resubmit it forever.
      if (valid()) {
        if (contextInvalid) { line.textContent = contextRecoveryMessage; return; }
        line.textContent = `${langLabel(languageSettings.readTarget)}：翻譯暫時失敗。`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'jtl-retry';
        retry.textContent = '再試一次';
        retry.setAttribute('aria-label', '重新翻譯這則內容');
        retry.title = '保留原文，重新取得翻譯';
        retry.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          if (!valid()) return;
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
    const before = new InputEvent('beforeinput', {bubbles: true, composed: true, cancelable: true,
      inputType: 'insertReplacementText', data: text, targetRanges});
    box.dispatchEvent(before);
    if (before.defaultPrevented) return settle();
    if (editableText(box) !== source || !box.isConnected) return false;
    if (typeof DataTransfer === 'function' && typeof ClipboardEvent === 'function') {
      const data = new DataTransfer(); data.setData('text/plain', text);
      const paste = new ClipboardEvent('paste', {bubbles: true, composed: true, cancelable: true, clipboardData: data});
      box.dispatchEvent(paste);
      if (paste.defaultPrevented) return settle();
      if (editableText(box) !== source || !box.isConnected) return false;
    }
    const managed = site === 'discord' || site === 'twitch' || box.matches?.('[data-slate-editor], [data-lexical-editor]') || box.querySelector?.('[data-contents]');
    if (managed) return false;
    const inserted = doc.execCommand?.('insertText', false, text);
    if (!inserted) return false;
    box.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true, inputType: 'insertText', data: text}));
    return settle();
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
    const above = rect.top - size.height - margin;
    const below = rect.bottom + margin;
    // Never dock over the native composer or its bottom-right Send button.
    const top = above >= margin ? above : below + size.height <= height - margin ? below : null;
    // Keep its measured dimensions while hidden, avoiding ResizeObserver loops.
    controls.style.visibility = top === null || rect.bottom < 0 || rect.top > height ? 'hidden' : 'visible';
    if (top === null) return;
    controls.style.left = `${Math.max(margin, Math.min(rect.left, width - size.width - margin))}px`;
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
    if (!box?.isConnected || box.readOnly || box.matches?.('[disabled],[aria-disabled="true"]') ||
        box.closest?.('.jtl-social-controls,.jtl-social-translation')) return false;
    if (site === 'generic') {
      const purpose = clean([
        box.getAttribute?.('type'), box.getAttribute?.('name'), box.getAttribute?.('role'),
        box.getAttribute?.('aria-label'), box.getAttribute?.('placeholder')
      ].join(' ')).toLowerCase();
      if (/search|搜尋|搜索|email|e-mail|password|密碼|電話|phone|url|網址|login|登入/.test(purpose)) return false;
      if (!/comment|message|chat|reply|post|留言|評論|訊息|聊天|回覆|發佈|textbox/.test(purpose)) return false;
    }
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
    button.textContent = `${langLabel(languageSettings.typeSource)} → ${langLabel(languageSettings.typeTarget)}`;
    button.setAttribute('aria-label', `將留言從${langLabel(languageSettings.typeSource)}文翻成${langLabel(languageSettings.typeTarget)}文草稿`);
    button.title = '點一下翻譯；長按可拖曳位置，確認後自行送出';
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
    preview.setAttribute('aria-label', '翻譯草稿；可選取並複製後貼入留言框');
    controls.addEventListener('keydown', event => event.stopPropagation());
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      if (composing.has(box)) { status.textContent = '請先完成輸入法選字，再翻譯。'; return; }
      const source = editableText(box);
      const currentEpoch = epoch;
      if (!source || !matchesLanguage(source,languageSettings.typeSource)) { status.textContent = `請先輸入${langLabel(languageSettings.typeSource)}文`; return; }
      button.disabled = true;
      status.textContent = '翻譯中…';
      try {
        const result = await message({type: 'make-draft', text: source, direction: direction('type')});
        if (!enabled || currentEpoch !== epoch || !box.isConnected || !controls.isConnected) return;
        if (editableText(box) !== source) { status.textContent = '原文已修改，請重新翻譯'; return; }
        if (composing.has(box)) { status.textContent = '請先完成輸入法選字，再重新翻譯。'; return; }
        if (!result?.draft?.trim()) throw new Error('沒有收到翻譯草稿');
        preview.value = result.draft;
        preview.hidden = false;
        const inserted = await replaceEditable(box, result.draft);
        if (!enabled || currentEpoch !== epoch || !box.isConnected || !controls.isConnected) return;
        preview.hidden = inserted;
        status.textContent = inserted ? '已放入譯文，確認後自行送出'
          : '留言框未接受譯文；請複製下方草稿後貼入。';
      } catch (error) {
        status.textContent = contextInvalid ? contextRecoveryMessage : `翻譯失敗：${error.message}`;
      } finally {
        button.disabled = contextInvalid;
      }
    });
    controls.append(button, status, preview);
    composers.set(box, controls);
    activeComposer = box;
    activeControls = controls;
    mountComposerControls(box, controls);
    if (typeof ResizeObserver === 'function' && controls.dataset.placement === 'floating') {
      composerLayoutObserver = new ResizeObserver(() => positionComposerControls(box, controls));
      composerLayoutObserver.observe(box); composerLayoutObserver.observe(controls);
    }
  }

  function focusedComposer(event) {
    const box = event.composedPath?.().find(node => node instanceof HTMLElement && (
      node.matches?.('textarea, input[type="text"], input:not([type])') ||
      node.isContentEditable || node.getAttribute?.('role') === 'textbox'
    ));
    const supported = box && config.composer.some(selector => box.matches?.(selector));
    if (supported && isUsableComposer(box)) installComposer(box, true);
    scan();
  }

  function installCaptionBox() {
    if (window.top !== window || captionBox?.isConnected || !document.body) return;
    captionBox = document.createElement('div');
    captionBox.id = 'jtl-social-subtitles';
    captionBox.className = 'jtl-caption-window';
    captionBox.hidden = true;
    captionBox.controller = new window.JtlCaptionWindow(captionBox, `${site}CaptionRect`);
    document.body.append(captionBox);
  }

  function renderSubtitles(data) {
    installCaptionBox();
    if (!captionBox) return;
    const item = data.running ? data.items?.at(-1) : null;
    const fresh = item && !item.expired && Date.now() / 1000 < (item.expiresAt ?? item.updatedAt + 3);
    const rows = data.running ? (item?.recordingRows || (fresh ? [item] : [])) : [];
    const signature = JSON.stringify(rows);
    if (signature !== lastSubtitleSignature) {
      lastSubtitleSignature = signature;
      captionBox.controller.render(rows);
    }
    captionBox.hidden = !rows.length;
  }

  async function pollSubtitles() {
    if (contextInvalid || window.top !== window || polling) return;
    polling = true;
    try { renderSubtitles(await message({type: 'subtitles'})); }
    catch (_) { /* The popup reports actionable capture/desktop errors. */ }
    finally { polling = false; }
  }

  function scan() {
    if (contextInvalid) return;
    if (activeControls) positionComposerControls(activeComposer, activeControls);
    if (window.top === window) installCaptionBox();
    if (!enabled) return;
    if (window.top === window) config.title.forEach(selector => document.querySelectorAll(selector).forEach(node => translateNode(node, true, 1_000_000_000 + ++translationOrder)));
    // Both sites restore large virtualized chat histories. Keep model work
    // bounded and always let the newest visible messages enter the queue first.
    // Hashed classes change frequently on both sites. ARIA live regions are a
    // stable semantic contract, so scan their smallest Japanese leaves as a
    // fallback when product-specific selectors no longer match.
    const semanticMessages = site === 'discord' ? [] : [...document.querySelectorAll('[role="log"], [aria-live="polite"], [aria-live="assertive"]')]
      .flatMap(region => [...region.querySelectorAll('span,p,div')])
      .filter(element => {
        const text = clean(element.innerText || element.textContent);
        return text && matchesReadLanguage(text) && ![...element.children].some(child => matchesReadLanguage(clean(child.innerText || child.textContent)));
      });
    const messages = [...new Set([
      ...config.text.flatMap(selector => [...document.querySelectorAll(selector)]),
      ...semanticMessages
    ])].slice(-20);
    const batch = ++translationOrder * 1000;
    for (let index = messages.length - 1; index >= 0; index--) translateNode(messages[index], false, batch + index);
    if (!isUsableComposer(activeComposer) || !activeControls?.isConnected) {
      let candidate;
      for (const selector of config.composer) {
        candidate = [...document.querySelectorAll(selector)].find(isUsableComposer);
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
    if (payload.type === 'subtitle-update' && window.top === window) renderSubtitles({running: true, items: [payload.item]});
  });
  chrome.storage.local.get(['websiteTextOptInEnabled','languageSettings','genericSiteAccess']).then(settings => {
    languageSettings={...languageSettings,...(settings.languageSettings||{})};
    globalTextEnabled=settings.websiteTextOptInEnabled === true;
    currentSiteEnabled=dedicatedSite || settings.genericSiteAccess?.[host] === true;
    applyTextAccess();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.websiteTextOptInEnabled) {globalTextEnabled=changes.websiteTextOptInEnabled.newValue === true;applyTextAccess();}
    if (area === 'local' && changes.genericSiteAccess && !dedicatedSite) {currentSiteEnabled=changes.genericSiteAccess.newValue?.[host] === true;applyTextAccess();}
    if (area === 'local' && changes.subtitleSettings) captionBox?.controller.apply(changes.subtitleSettings.newValue);
    if (area === 'local' && changes.languageSettings) {languageSettings={...languageSettings,...changes.languageSettings.newValue};translated=new WeakMap();cache.clear();document.querySelectorAll('.jtl-social-translation,.jtl-social-controls').forEach(node=>node.remove());activeComposer=null;activeControls=null;scan();}
  });
  let scheduled = false;
  pageObserver = new MutationObserver(() => {
    if (contextInvalid) return;
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 250);
  });
  pageObserver.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['contenteditable']});
  document.addEventListener('focusin', focusedComposer, true);
  document.addEventListener('compositionstart', event => {
    const box = event.target?.closest?.('textarea,input,[contenteditable="true"]');
    if (box) composing.add(box);
  }, true);
  document.addEventListener('compositionend', event => {
    const box = event.target?.closest?.('textarea,input,[contenteditable="true"]');
    if (box) composing.delete(box);
  }, true);
  const reposition = () => { if (activeControls) positionComposerControls(activeComposer, activeControls); };
  window.addEventListener?.('resize', reposition, {passive: true});
  document.addEventListener('scroll', reposition, {capture: true, passive: true});
  scan();
  if (window.top === window) pollTimer = setInterval(pollSubtitles, 700);
})();
