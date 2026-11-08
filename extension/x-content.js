// X uses a separate script so YouTube's player and composer stay independent.
(() => {
  if(window.__jtlX)return;window.__jtlX=true;
  let websiteTextOptInEnabled=false, textEpoch=0;
  let languageSettings={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
  const pageUi = globalThis.VocaLumePageLanguage;
  const domChanges = globalThis.VocaLumeDomChanges;
  function setUi(element, value, property = 'textContent') {
    if (!element) return;
    if (pageUi) { pageUi.bind(element, value, property); return; }
    const text = typeof value === 'function' ? value() : value;
    if (property === 'textContent') { if (element.textContent !== text) element.textContent = text; }
    else element.setAttribute(property, text);
  }
  const langLabel=code=>{const label=({ja:'日',zh:'中',en:'英',ko:'韓',es:'西',fr:'法',de:'德',pt:'葡',it:'義',ru:'俄',th:'泰',vi:'越',id:'印尼',ar:'阿'})[code]||code.toUpperCase();return pageUi?.label(code,label)??label;};
  const direction=kind=>`${languageSettings[kind+'Source']}-${languageSettings[kind+'Target']}`;
  const matchesLanguage=(text,lang)=>globalThis.VocaLumeTranslationGuards.shouldTranslateWriting(text,lang);
  const matchesReadLanguage=text=>globalThis.VocaLumeTranslationGuards.shouldTranslateReading(text,languageSettings.readSource,languageSettings.readTarget);
  const composers = new WeakMap();
  function dispatchComposerKey(event) {
    const path = event.composedPath?.() || [event.target];
    for (const node of path) {
      const controls = composers.get(node);
      if (controls?.isConnected) { controls.translateKey?.(event); return; }
    }
  }
  // Run before document/editor capture handlers from other page integrations.
  // Only consume the explicit translation shortcut in our mounted composers.
  window.addEventListener('keydown', dispatchComposerKey, true);
  const posts = new WeakMap();
  const postControls = new Set();
  let panel,captionBox;
  let spaceHost, spaceControl, spacePath;
  let listening = false;
  let subtitleRevision = 0, subtitleExpiryTimer;
  let subtitleSignature;

  function message(payload) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(payload, reply => {
      if (chrome.runtime.lastError || !reply?.ok) {
        reject(new Error(reply?.error || chrome.runtime.lastError?.message || '請先開啟 VocaLume App'));
      } else resolve(reply.text);
    }));
  }

  function button(label, action) {
    const el = document.createElement('button');
    el.type = 'button';
    setUi(el, label);
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return el;
  }

  function read(box) { return (box.innerText || box.textContent || '').trim(); }

  function composerToolbar(box) {
    // The rich-text area has a clipped height. Mount next to the toolbar instead.
    for (let host = box.parentElement; host && host !== document.body; host = host.parentElement) {
      const editors = host.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]');
      if (editors.length > 1) break;
      const toolbar = host.querySelector('[data-testid="toolBar"]');
      if (toolbar) return toolbar;
    }
    return null;
  }
  function addComposer(box) {
    const toolbar = composerToolbar(box);
    const previous = composers.get(box);
    if (previous?.isConnected) {
      if (toolbar && previous.nextElementSibling !== toolbar) toolbar.insertAdjacentElement('beforebegin', previous);
      return;
    }
    const controls = document.createElement('div');
    controls.className = 'jtl-x-controls jtl-x-composer';
    controls.jtlSource = box;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const preview = document.createElement('textarea');
    setUi(preview, '翻譯草稿', 'aria-label');
    preview.hidden = true;
    let source = '', appliedDraft, applying = false;
    let composing = false;
    box.addEventListener('compositionstart',()=>{composing=true;});
    box.addEventListener('compositionend',()=>{composing=false;});
    const apply = button('放入留言框', async () => {
      if (applying || apply.hidden || !controls.isConnected) return;
      if(composing){setUi(status, '請先完成輸入法選字。');return;}
      if (!box.isConnected || read(box) !== source) {
        setUi(status, '原文已修改，請重新翻譯');
        return;
      }
      const draft = preview.value.trim();
      if (!draft) { setUi(status, '請先輸入留言。'); return; }
      if (draft === source) {
        appliedDraft = draft;
        setUi(status, '已放入譯文，確認後自行送出');
        return;
      }
      applying = true;
      apply.disabled = true;
      let nativeInput = false;
      const observeInput = event => { nativeInput ||= event.isTrusted; };
      box.addEventListener('input', observeInput, true);
      try {
        box.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(box);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand?.('insertText', false, draft);
      } catch (_) {
        // Keep the editable preview available when the page refuses insertion.
      } finally {
        box.removeEventListener('input', observeInput, true);
      }
      // Let the site's controlled editor render its committed draft first.
      // A synthetic input event could report success while leaving its model stale.
      await new Promise(resolve => setTimeout(resolve, 0));
      applying = false;
      apply.disabled = false;
      if (!box.isConnected || !controls.isConnected) return;
      const inserted = nativeInput && read(box) === draft;
      if (inserted) appliedDraft = draft;
      setUi(status, inserted
        ? '已放入譯文，確認後自行送出'
        : '網站未接受這次修改。請複製上方譯文，手動貼上再送出。');
    });
    apply.hidden = true;
    async function translateDraft(applyWhenReady) {
      if (translate.disabled || applying) return;
      if(composing){setUi(status, '請先完成輸入法選字。');return;}
      source = read(box);
      const epoch = textEpoch;
      if (!source) { setUi(status, '請先輸入留言。'); return; }
      if (source === appliedDraft) return;
      translate.disabled = true;
      apply.hidden = true;
      preview.hidden = true;
      setUi(status, '翻譯中…');
      try {
        const result = await message({type: 'make-draft', text: source, direction: direction('type')});
        if (!websiteTextOptInEnabled || epoch !== textEpoch || !box.isConnected || !controls.isConnected) return;
        if(read(box)!==source){setUi(status, '原文已修改，請重新翻譯');return;}
        if (!result?.draft?.trim()) throw new Error('沒有收到翻譯草稿');
        preview.value = result.draft;
        preview.hidden = false;
        apply.hidden = false;
        setUi(status, '可以修改草稿，再放入留言框。');
        if (applyWhenReady && (document.activeElement === box || box.contains(document.activeElement))) apply.click();
      } catch (error) {
        if (epoch === textEpoch && controls.isConnected) setUi(status, '翻譯失敗，請再試一次。');
      } finally { translate.disabled = false; }
    }
    const translate = button(() => `${langLabel(languageSettings.typeSource)}/${langLabel(languageSettings.typeTarget)}`, () => translateDraft(false));
    // Tab translates the focused draft and replaces it only if it is unchanged.
    // Enter/posting always remains a separate action. IME and Shift+Tab pass through.
    controls.translateKey = event=>{
      if(!websiteTextOptInEnabled||!controls.isConnected||event.key!=='Tab'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||event.isComposing||composing||translate.disabled||applying)return;
      const value = read(box);
      const lang = languageSettings.typeSource;
      if (!value || value === appliedDraft || (!matchesLanguage(value, lang) && !(lang === 'ja' && languagePattern.zh.test(value)))) return;
      event.preventDefault();event.stopImmediatePropagation?.();event.stopPropagation();
      void translateDraft(true);
    };
    box.addEventListener('keydown',controls.translateKey);
    setUi(translate, 'Tab：翻譯並放入留言框；確認後自行送出', 'title');
    setUi(translate, '翻譯留言草稿', 'aria-label');
    translate.classList.add('jtl-x-language');
    controls.append(translate, status, preview, apply);
    const anchor = box.closest('[data-testid$="RichTextInputContainer"]') || box.parentElement;
    if (toolbar) toolbar.insertAdjacentElement('beforebegin', controls);
    else anchor?.parentElement?.insertAdjacentElement('afterend', controls);
    composers.set(box, controls);
  }

  function addPost(text) {
    const existing=posts.get(text);
    if (!matchesReadLanguage(read(text))) {existing?.remove();postControls.delete(existing);posts.delete(text);return;}
    if(existing?.isConnected){if(text.nextElementSibling!==existing)text.insertAdjacentElement('afterend',existing);return;}
    const controls = document.createElement('div');
    controls.className = 'jtl-x-controls';controls.jtlSource=text;postControls.add(controls);
    const result = document.createElement('div');
    result.setAttribute('role', 'status');
    const translate = button(() => `${langLabel(languageSettings.readSource)}/${langLabel(languageSettings.readTarget)}`, async () => {
      const source = read(text);
      translate.disabled = true;
      setUi(result, '翻譯中…');
      try {
        const value = await message({type: 'translate', text: source, direction: direction('read'), priority: true});
        if (read(text) === source) setUi(result, () => value);
        else setUi(result, '貼文已更新，請再按一次翻譯。');
      } catch (error) { setUi(result, '翻譯失敗，請再試一次。'); }
      finally { translate.disabled = false; }
    });
    setUi(translate, '翻譯貼文', 'aria-label');
    translate.classList.add('jtl-x-language');
    controls.append(translate, result);
    text.insertAdjacentElement('afterend', controls);
    posts.set(text, controls);
    postControls.add(controls);
  }

  function installPanel() {
    if (panel?.isConnected) return;
    subtitleSignature = undefined;
    panel = document.createElement('section');
    panel.className = 'jtl-x-live';
    setUi(panel, '直播語音字幕', 'aria-label');
    const status = document.createElement('div');
    status.className = 'jtl-x-live-status';
    setUi(status, '直播語音字幕');
    const toggle = button('開始語音字幕', async () => {
      toggle.disabled = true;
      try {
        if (listening) {
          await message({type:'subtitle-control',action:'stop'});
          listening = false;
          if(captionBox){captionBox.controller.render([]);captionBox.hidden=true;}
          setUi(status, '字幕已停止。');
        } else {
          await message({type: 'subtitle-control', action: 'start'});
          listening = true;
          setUi(status, '等待此分頁的聲音。');
        }
        setUi(toggle, listening ? '停止語音字幕' : '開始語音字幕');
      } catch (error) { setUi(status, '直播字幕暫時無法使用。'); }
      finally { toggle.disabled = false; }
    });
    panel.append(toggle, status);
    captionBox=document.createElement('div');captionBox.className='jtl-caption-window';captionBox.hidden=true;captionBox.controller=new window.JtlCaptionWindow(captionBox,'xCaptionRect');document.body.append(captionBox);
    // Keep extension UI outside React-owned dialog layout. Changing a fixed
    // host to relative made host detection alternate on every mutation.
    document.body.append(panel);
    void refreshSubtitles();
  }

  function isSpaceControl(button) {
    return button?.isConnected && !button.closest('.jtl-x-live') &&
      /^(離開|离开|Leave|開始收聽|开始收听|開始匿名收聽|开始匿名收听|Start listening|Start anonymous listening|退出|リスニングを開始|匿名でリスニングを開始|나가기|듣기 시작|익명으로 듣기 시작)$/i.test(read(button));
  }

  function findSpaceHost(scope) {
    const controls = domChanges.select(scope, 'button').find(isSpaceControl);
    if (controls) {
      const dialog = controls.closest('[role="dialog"], [aria-modal="true"]');
      if (dialog) return {host: dialog, controls};
      let ancestor = controls.parentElement;
      while (ancestor && ancestor !== document.body) {
        const box = ancestor.getBoundingClientRect();
        const style = getComputedStyle(ancestor);
        if ((style.position === 'fixed' || style.position === 'absolute') && box.width >= 360 && box.height >= 260) return {host: ancestor, controls};
        ancestor = ancestor.parentElement;
      }
    }
    if (/\/i\/spaces\//i.test(location.pathname)) {
      return {host: document.querySelector('[role="dialog"], main') || document.body};
    }
    return null;
  }

  function syncSpacePanel(scope) {
    const path = location.pathname, routeChanged = path !== spacePath;
    spacePath = path;
    if (scope && !routeChanged && spaceHost?.isConnected && (!spaceControl || isSpaceControl(spaceControl))) {
      if (!panel?.isConnected) installPanel();
      return;
    }
    const space = findSpaceHost(routeChanged || spaceHost ? undefined : scope);
    spaceHost = space?.host; spaceControl = space?.controls;
    if (spaceHost) {
      if (!panel?.isConnected) installPanel();
    } else if (panel?.isConnected) {
      subtitleRevision++; clearTimeout(subtitleExpiryTimer);
      panel.remove();captionBox?.controller.dispose();captionBox?.remove();captionBox=null;
      panel = null;subtitleSignature=undefined;
      if (listening) {
        listening = false;
        message({type: 'subtitle-control', action: 'stop'}).catch(() => {});
      }
    }
  }

  function renderSubtitles(data) {
    clearTimeout(subtitleExpiryTimer);
    if (!panel?.isConnected || document.hidden) return;
    listening = Boolean(data.running);
    setUi(panel.querySelector('button'), listening ? '停止語音字幕' : '開始語音字幕');
    const item = data.items?.at(-1);
    const expiresIn = ((item?.expiresAt ?? item?.updatedAt + 3) * 1000) - Date.now();
    const fresh = listening && item && !item.expired && expiresIn > 0;
    const rows = listening ? (item?.recordingRows || (fresh ? [item] : [])) : [];
    const signature = JSON.stringify(rows);
    if (captionBox) {
      if (subtitleSignature !== signature) { captionBox.controller.render(rows); subtitleSignature = signature; }
      captionBox.hidden = !rows.length;
    }
    setUi(panel.querySelector('.jtl-x-live-status'), listening ? '正在接收分頁聲音' : '字幕已停止，可重新開始。');
    if (fresh && !item.recordingRows) subtitleExpiryTimer = setTimeout(() => renderSubtitles({running: true}), expiresIn + 5);
  }

  async function refreshSubtitles() {
    if (!panel?.isConnected || document.hidden) return;
    const currentPanel = panel;
    const revision = ++subtitleRevision;
    try {
      const data = await message({type: 'subtitles'});
      // A response for a closed Space must not change a newly opened panel.
      if (revision === subtitleRevision && panel === currentPanel) renderSubtitles(data);
    } catch (error) {
      if (revision === subtitleRevision && panel === currentPanel && currentPanel.isConnected) setUi(currentPanel.querySelector('.jtl-x-live-status'), '直播字幕暫時無法使用。');
    }
  }

  const composerSelector = '[contenteditable="true"][data-testid^="tweetTextarea_"], [data-testid^="tweetTextarea_"] [contenteditable="true"]';
  function scan(scope) {
    if (!scope || scope.removed) for (const control of postControls) {
      if (!control.isConnected || !control.jtlSource.isConnected) {
        control.remove(); postControls.delete(control);
      }
    }
    if(websiteTextOptInEnabled){
      domChanges.select(scope, composerSelector).forEach(addComposer);
      domChanges.select(scope, '[data-testid="tweetText"]').forEach(addPost);
    }
    syncSpacePanel(scope);
  }
  function setWebsiteText(enabled){
    websiteTextOptInEnabled=enabled;textEpoch++;
    if(!enabled)document.querySelectorAll('.jtl-x-controls').forEach(el=>el.remove());
    scan();
  }
  chrome.storage.local.get(['websiteTextOptInEnabled','languageSettings']).then(s=>{languageSettings={...languageSettings,...(s.languageSettings||{})};setWebsiteText(s.websiteTextOptInEnabled === true);});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.websiteTextOptInEnabled)setWebsiteText(changes.websiteTextOptInEnabled.newValue === true);
    if(area==='local'&&changes.languageSettings){languageSettings={...languageSettings,...changes.languageSettings.newValue};document.querySelectorAll('.jtl-x-controls').forEach(el=>el.remove());setWebsiteText(websiteTextOptInEnabled);}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.subtitleSettings)captionBox?.controller.apply(changes.subtitleSettings.newValue);});
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'subtitle-update' || !panel?.isConnected) return;
    subtitleRevision++;
    renderSubtitles({running: message.running ?? Boolean(message.item), items: [message.item]});
  });
  domChanges.observe(scan, {delay: 400, attributeFilter: ['contenteditable', 'data-testid', 'role', 'aria-modal']});
  document.addEventListener("focusin", event => {
    if (!websiteTextOptInEnabled) return;
    const box = event.target?.closest?.(composerSelector);
    if (box) addComposer(box);
  });
  document.addEventListener('visibilitychange',()=>{subtitleRevision++;if(!document.hidden){scan();void refreshSubtitles();}});
  window.addEventListener('popstate', () => syncSpacePanel());
  scan();
})();
