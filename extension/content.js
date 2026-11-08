(() => {
if(window.__jtlV3)return;window.__jtlV3=true;
let translated = new WeakMap();
const lineOwners = new WeakMap();
let streamerChatMode=false;
let websiteTextOptInEnabled=false, textEpoch=0, contextInvalid=false,pageWork;
let languageSettings={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
const pageUi = globalThis.VocaLumePageLanguage;
const domWork=globalThis.VocaLumeDomWork;
const query=(selector,roots)=>domWork?.query(document,selector,roots)??[...document.querySelectorAll(selector)];
const titleSelector='ytd-watch-metadata, #above-the-fold #title';
const chatSelector='#message.yt-live-chat-text-message-renderer, yt-live-chat-text-message-renderer #message';
const commentSelector='ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text';
const composerSelector="#input[contenteditable='true'], #input.yt-live-chat-text-input-field-renderer, #contenteditable-root[contenteditable='true']";
const uiText = value => pageUi?.text(value) ?? value;
function setUi(element, value, property = 'textContent') {
  if (pageUi) { pageUi.bind(element, value, property); return; }
  const text = typeof value === 'function' ? value() : value;
  if (property === 'textContent') { if (element.textContent !== text) element.textContent = text; }
  else element.setAttribute(property, text);
}
const langLabel=code=>{const label=({ja:'日',zh:'中',en:'英',ko:'韓',es:'西',fr:'法',de:'德',pt:'葡',it:'義',ru:'俄',th:'泰',vi:'越',id:'印尼',ar:'阿'})[code]||code.toUpperCase();return pageUi?.label(code,label)??label;};
const direction=kind=>`${languageSettings[kind+'Source']}-${languageSettings[kind+'Target']}`;
const matchesLanguage=(text,lang)=>globalThis.VocaLumeTranslationGuards.shouldTranslateWriting(text,lang);
const matchesReadLanguage=text=>globalThis.VocaLumeTranslationGuards.shouldTranslateReading(text,languageSettings.readSource,languageSettings.readTarget);
const cache = new Map();
const inFlight = new Map();
const translationQueue = [];
let activeTranslations = 0, translationOrder = 0;
let chatBatch = 0;
const MAX_ACTIVE_TRANSLATIONS = 3;
const MAX_CACHED_TRANSLATIONS = 500;

function pumpTranslations() {
  while (activeTranslations < MAX_ACTIVE_TRANSLATIONS && translationQueue.length) {
    translationQueue.sort((a, b) => b.order - a.order);
    const task = translationQueue.shift();
    if (![...task.consumers].some(isValid => isValid())) {
      if (inFlight.get(task.key) === task) inFlight.delete(task.key);
      task.reject(new Error("留言已離開畫面"));
      continue;
    }
    activeTranslations++;
    const finish = (error, result) => {
      activeTranslations--;
      if (inFlight.get(task.key) === task) inFlight.delete(task.key);
      if (error) task.reject(error);
      else if (typeof result !== "string" || !result.trim()) task.reject(new Error("沒有收到譯文"));
      else {
        if (task.epoch === textEpoch) {
          cache.set(task.key, result);
          if (cache.size > MAX_CACHED_TRANSLATIONS) cache.delete(cache.keys().next().value);
        }
        task.resolve(result);
      }
      pumpTranslations();
    };
    runtimeMessage({type: "translate", text: task.text, direction: task.direction, priority: task.priority, ...(task.livestreamChat && {livestreamChat: true})})
      .then(result => finish(null, result), error => finish(error));
  }
}

const hasJapanese = text => /[\u3040-\u30ff]/.test(text);
const hasChinese = text => /[\u3400-\u9fff]/.test(text) && !hasJapanese(text);

function smallestJapaneseLeaves(region,includeRoot=false) {
  if (!region?.querySelectorAll) return [];
  const selector='span,p,div,yt-formatted-string';
  return [...(includeRoot&&region.matches?.(selector)?[region]:[]),...region.querySelectorAll(selector)].filter(element => {
    if (element.closest?.('#author-name,[id*="author" i],[class*="author" i],a')) return false;
    const text = (element.textContent || '').trim();
    return text && matchesReadLanguage(text) && ![...(element.children || [])].some(child => matchesReadLanguage(child.textContent || ''));
  });
}

function requestTranslation(text, direction, priority = false, queueOrder, isValid, livestreamChat = false) {
  const key = `${livestreamChat}:${direction}:${text}`;
  if (cache.has(key)) {
    const result = cache.get(key);
    cache.delete(key);
    cache.set(key, result);
    return Promise.resolve(result);
  }
  let task = inFlight.get(key);
  if (!task || task.epoch !== textEpoch) {
    task = {key, text, direction, priority, livestreamChat, epoch: textEpoch, consumers: new Set(), order: queueOrder ?? (++translationOrder + (priority ? 1000000 : 0))};
    task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
    inFlight.set(key, task);
    translationQueue.push(task);
  }
  task.consumers.add(isValid);
  pumpTranslations();
  return task.promise;
}

async function translateElement(element, className, priority = false, queueOrder, liveChat = false) {
  if (!websiteTextOptInEnabled || !element) return false;
  const epoch=textEpoch;
  const text = element.textContent.trim();
  const anchor = className === "jtl-title" ? (element.closest("h1") || element) : element;
  const auto = streamerChatMode && liveChat;
  const readDirection = auto
    ? await globalThis.VocaLumeTranslationGuards.streamerChatDirection(text, languageSettings.readTarget, value => chrome.i18n.detectLanguage(value))
    : matchesReadLanguage(text) ? direction('read') : null;
  if (epoch !== textEpoch || !element.isConnected || element.textContent.trim() !== text) return false;
  let line = anchor.parentElement?.querySelector(`:scope > .${className}`);
  if (!readDirection) {
    if (translated.has(element)) {
      translated.delete(element);
      if (line) { lineOwners.delete(line); line.remove(); }
    }
    return false;
  }
  if (translated.get(element) === text && line) return true;
  translated.set(element, text);
  if (!line) {
    line = document.createElement("div");
    line.className = className;
    anchor.insertAdjacentElement("afterend", line);
  }
  const owner = {};
  lineOwners.set(line, owner);
  const ownsLine = () => lineOwners.get(line) === owner;
  const discard = () => {
    if (ownsLine()) {
      if (epoch === textEpoch && translated.get(element) === text) translated.delete(element);
      line.remove();
    }
  };
  line.textContent = '';
  setUi(line, () => `${langLabel(languageSettings.readTarget)}：${uiText('翻譯中…')}`);
  const valid=()=>ownsLine()&&websiteTextOptInEnabled&&epoch===textEpoch&&element.isConnected&&element.textContent.trim()===text;
  try {
    const result = await requestTranslation(text, readDirection, priority, queueOrder, valid, auto);
    if (!valid() || !result) {discard();return false;}
    setUi(line, () => `${langLabel(languageSettings.readTarget)}：${result}`);
    return true;
  } catch (error) {
    // Keep the failed source marked after background recovery. Otherwise our
    // own status DOM mutation starts another scan and creates an endless loop.
    if (valid()) {
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
        translated.delete(element);
        void translateElement(element, className, true, undefined, liveChat);
      });
      line.append(retry);
    }
    else discard();
    return false;
  }
}

function scan(roots) {
  if(contextInvalid||document.hidden)return;
  if (!websiteTextOptInEnabled) return;
  if (window.top === window && (!roots||roots.some(root=>root.closest?.(titleSelector)||root.querySelector?.(titleSelector)))) {
    const title = [
      "ytd-watch-metadata h1 yt-formatted-string",
      "ytd-watch-metadata #title h1",
      "#above-the-fold #title h1",
      "h1.ytd-watch-metadata"
    ].map(selector=>document.querySelector(selector)).find(element=>matchesReadLanguage(element?.textContent||""));
    const titleLines = [...document.querySelectorAll(".jtl-title")];
    if (!title) titleLines.forEach(line => line.remove());
    titleLines.slice(1).forEach(line => line.remove());
    titleLines.forEach(line => { if (!line.textContent.trim()) line.remove(); });
    translateElement(title, "jtl-title", true);
  }
  if(window.top===window)installCommentButtons(roots);
  // YouTube restores a large virtualized backlog after navigation. Translating
  // all of it at once rate-limits the service and makes fresh chat wait behind
  // stale messages. Keep the newest visible window and enqueue newest first.
  const selectedChat = query(chatSelector,roots);
  const logs=roots?new Set([...query('[role="log"]',roots),...roots.filter(root=>root.closest?.('[role="log"]'))]):query('[role="log"]');
  const semanticChat = streamerChatMode ? [] : [...logs].flatMap(root=>smallestJapaneseLeaves(root,Boolean(roots)));
  const chat = [...new Set([...selectedChat, ...semanticChat])].slice(-20);
  const batch = ++chatBatch;
  for (let i = chat.length - 1; i >= 0; i--) translateElement(chat[i], "jtl-translation", false, batch * 1000 + i, true);
  installComposerButton(roots);
}

function installCommentButtons(roots) {
  query(commentSelector,roots).forEach(element => {
    const text = element.textContent.trim();
    if (!text || !matchesReadLanguage(text) || element.parentElement?.querySelector(":scope > .jtl-comment-action")) return;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "jtl-comment-action";
    setUi(action, () => `${langLabel(languageSettings.readSource)}/${langLabel(languageSettings.readTarget)}`);
    setUi(action, '翻譯留言', 'aria-label');
    let failed = false;
    action.addEventListener("click", async () => {
      if (failed) translated.delete(element);
      action.disabled = true;
      setUi(action, '翻譯中…');
      try {
        const ok = await translateElement(element, "jtl-translation", true);
        if (!ok) throw new Error("翻譯失敗");
        setUi(action, '已翻譯');
      } catch (_error) {
        failed = true;
        action.disabled = false;
        setUi(action, '再試一次');
      }
    });
    element.insertAdjacentElement("afterend", action);
  });
}

function runtimeMessage(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, reply => {
    try {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      if (!reply?.ok) return reject(new Error(reply?.error || "本機服務未啟動"));
      resolve(reply.text);
    } catch (error) { reject(error); }
  }));
}

function installSubtitleOverlay() {
  const player = document.fullscreenElement || document.body;
  if(!player)return;
  const existing=document.querySelector('#jtl-subtitles');
  if(existing){if(existing.parentElement!==player)player.append(existing);return;}
  const overlay = document.createElement("div");
  overlay.id = "jtl-subtitles";
  overlay.captionWindow=new window.JtlCaptionWindow(overlay,'youtubeCaptionRect');
  player.appendChild(overlay);
  applySubtitleSettings();
}

const subtitleDefaults = {japaneseColor: "#ffffff", chineseColor: "#ffffff", fontSize: 22, outlineWidth: 1, position: 6};
function applySubtitleSettings(settings) {
  const apply = raw => {
    const s = {...subtitleDefaults, ...(raw || {})};
    const overlay = document.querySelector("#jtl-subtitles");
    if (!overlay) return;
    overlay.style.bottom = `${s.position}%`;
    overlay.captionWindow?.apply(s);
  };
  if (settings) apply(settings); else chrome.storage.local.get("subtitleSettings", ({subtitleSettings}) => apply(subtitleSettings));
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.websiteTextOptInEnabled) setWebsiteText(changes.websiteTextOptInEnabled.newValue === true);
  if (area === "local" && changes.streamerChatMode) {
    streamerChatMode = changes.streamerChatMode.newValue === true;
    document.querySelectorAll('.jtl-translation').forEach(el => el.remove());
    setWebsiteText(websiteTextOptInEnabled);
  }
  if (area === "local" && changes.subtitleSettings) applySubtitleSettings(changes.subtitleSettings.newValue);
  if (area === "local" && (changes.languageSettings || changes.speechMode || changes.cloudTranslation || changes.nvidiaKey || changes.openrouterKey)) {
    if (changes.languageSettings) languageSettings = {...languageSettings, ...changes.languageSettings.newValue};
    textEpoch++;
    translated = new WeakMap();
    cache.clear();
    document.querySelectorAll('.jtl-title,.jtl-translation,.jtl-comment-action,.jtl-composer-controls').forEach(el=>el.remove());
    scan();
  }
});

let lastSubtitleKey = "", subtitleExpiryTimer;
let pollEpoch=0;
let nativeTimer=null,nativeAllowed=false;
let captionRunning=false;
let selectedNativeCue = null;
document.addEventListener('vocalume-source-cue', event => {
 if(typeof event.detail !== 'string' || event.detail.length > 2500)return;
 try { selectedNativeCue = JSON.parse(event.detail); } catch { selectedNativeCue = null; }
});
function readNativeCaption(){
 if(!captionRunning||!nativeAllowed||document.hidden)return;
 const previousKey=selectedNativeCue?.key;
 selectedNativeCue = null;
 document.dispatchEvent?.(new Event('vocalume-read-source-cue'));
 if(!selectedNativeCue&&!previousKey)return;
 runtimeMessage({type:'native-caption',cue:selectedNativeCue}).catch(()=>{});
 if(!selectedNativeCue||previousKey!==selectedNativeCue.key)document.querySelector('#movie_player')?.classList.remove('jtl-native-active');
}
function setCaptionState(running,allowNative=true){
 captionRunning=Boolean(running);nativeAllowed=allowNative;
 const readNative=captionRunning&&nativeAllowed&&!document.hidden;
 if(readNative&&nativeTimer===null){
  nativeTimer=setInterval(readNativeCaption,350);
  readNativeCaption();
 }else if(!readNative&&nativeTimer!==null){
  clearInterval(nativeTimer);nativeTimer=null;selectedNativeCue=null;
  document.querySelector('#movie_player')?.classList.remove('jtl-native-active');
 }
}
function renderSubtitle(item) {
  if(item?.recordingRows){clearTimeout(subtitleExpiryTimer);installSubtitleOverlay();const overlay=document.querySelector('#jtl-subtitles');if(overlay){overlay.captionWindow.render(item.recordingRows);overlay.classList.toggle('jtl-visible',item.recordingRows.length>0);}return;}
  clearTimeout(subtitleExpiryTimer);
  const expiresAt=item?.expiresAt??(item?.updatedAt+3);
  if (!item || item.expired || Date.now()/1000 >= expiresAt) {
    document.querySelector('#movie_player')?.classList.remove('jtl-native-active');
    document.querySelector("#jtl-subtitles")?.classList.remove("jtl-visible");
    document.querySelector('#jtl-subtitles')?.captionWindow?.render([]);
    lastSubtitleKey = "";
    return;
  }
  document.querySelector('#movie_player')?.classList.toggle('jtl-native-active',
    Boolean(item.source==='native'&&item.translated&&selectedNativeCue?.key===item.speechId));
  installSubtitleOverlay();
  const overlay = document.querySelector("#jtl-subtitles");
  if (!overlay) return;
  overlay.dataset.expiresAt=expiresAt;
  subtitleExpiryTimer=setTimeout(()=>renderSubtitle(null),Math.max(0,expiresAt*1000-Date.now()));
  const key = `${item.id}:${item.original}:${item.translated}:${item.provisional}:${item.pending}:${item.error}`;
  if (key === lastSubtitleKey) return;
  lastSubtitleKey = key;
  overlay.captionWindow.render([item]);
  overlay.dataset.state=item.provisional?'provisional':'final';
  setUi(overlay, item.provisional ? '暫定字幕，句尾會校正' : '已確認字幕', 'title');
  overlay.classList.toggle("jtl-visible", Boolean(item.original));
}
async function pollSubtitles() {
  if (window.top !== window || document.hidden || contextInvalid) return;
  const epoch=++pollEpoch;
  try {
    const data = await runtimeMessage({type: "subtitles"});
    if (epoch !== pollEpoch) return;
    setCaptionState(data.running,data.nativeCaptions!==false);
    if(!captionRunning)document.querySelector('#movie_player')?.classList.remove('jtl-native-active');
    renderSubtitle(data.running ? data.items?.at(-1) : null);
  } catch (error) {if(!chrome.runtime?.id){contextInvalid=true;pageWork?.disconnect();setCaptionState(false);document.querySelector('#jtl-subtitles')?.remove();}}
}
chrome.runtime.onMessage.addListener(message => {
  if (message.type === "subtitle-update" && window.top === window) {
    pollEpoch++;
    setCaptionState(message.running??Boolean(message.item),message.nativeCaptions!==false);
    renderSubtitle(message.item);
  }
});

function editableText(box) {
  return (box.innerText || box.textContent || "").trim();
}

async function replaceEditable(box, text) {
  const doc = box.ownerDocument || document;
  const view = doc.defaultView || window;
  box.focus();
  const selection = view.getSelection();
  if (!selection) return false;
  const range = doc.createRange();
  range.selectNodeContents(box);
  selection.removeAllRanges();
  selection.addRange(range);
  const inserted=doc.execCommand("insertText", false, text);
  if (!inserted || editableText(box)!==text.trim()) return false;
  box.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
  box.dispatchEvent(new Event("change", {bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  return box.isConnected && editableText(box)===text.trim();
}

const composerControls = new WeakMap();
const composingComposers = new WeakSet();
function installComposerButton(roots) {
  // Comment editors are created lazily for watch pages, Shorts and replies.
  const boxes = query(composerSelector,roots);
  for (const box of boxes) {
    const previous = composerControls.get(box);
    if (previous?.isConnected) continue;
    const controls = document.createElement("div");
    controls.className = "jtl-composer-controls";
    const button = document.createElement("button");
    button.className = "jtl-compose";
    button.type = "button";
    setUi(button, () => `${langLabel(languageSettings.typeSource)}/${langLabel(languageSettings.typeTarget)}`);
    setUi(button, '翻譯留言草稿', 'aria-label');
    const status = document.createElement("span");
    status.className = "jtl-status";
    status.setAttribute("role", "status");
    const preview = document.createElement("textarea");
    preview.className = "jtl-compose-draft";
    preview.readOnly = true;
    preview.hidden = true;
    setUi(preview, '翻譯草稿', 'aria-label');
    box.addEventListener("compositionstart",()=>composingComposers.add(box));
    box.addEventListener("compositionend",()=>composingComposers.delete(box));
    button.addEventListener("click", async () => {
      if (composingComposers.has(box)) {setUi(status, '請先完成輸入法選字。');return;}
      const text = editableText(box), epoch = textEpoch;
      if (!text) { setUi(status, '請先輸入留言。'); return; }
      if (!matchesLanguage(text,languageSettings.typeSource)) { setUi(status, '請先輸入留言。'); return; }
      button.disabled = true;
      setUi(status, '翻譯中…');
      try {
        const result = await runtimeMessage({type:'make-draft',text,direction:direction('type')});
        if (!websiteTextOptInEnabled || epoch !== textEpoch || !box.isConnected || !controls.isConnected) return;
        if(editableText(box)!==text){setUi(status, '原文已修改，請重新翻譯');return;}
        if(composingComposers.has(box)){setUi(status, '請先完成輸入法選字。');return;}
        if (!result.draft?.trim()) throw new Error("沒有收到日文草稿");
        preview.value = result.draft;
        const inserted = await replaceEditable(box, result.draft);
        if (!websiteTextOptInEnabled || epoch !== textEpoch || !box.isConnected || !controls.isConnected) return;
        preview.hidden = inserted;
        setUi(status, inserted ? '已放入譯文，確認後自行送出' : '留言框未接受譯文；請複製下方草稿後貼入。');
      } catch (error) {
        setUi(status, '翻譯失敗，請再試一次。');
      } finally { button.disabled = false; }
    });
    box.addEventListener("keydown",event=>{
      if(!websiteTextOptInEnabled||!controls.isConnected||event.key!=="Tab"||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey||event.isComposing||composingComposers.has(box)||!matchesLanguage(editableText(box),languageSettings.typeSource))return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      if(!button.disabled)button.click();
    },true);
    setUi(button, 'Tab：翻譯並放入留言框；確認後自行送出', 'title');
    controls.append(button, status, preview);
    const live = box.closest("yt-live-chat-text-input-field-renderer");
    const host = live?.parentElement || box.closest("ytd-commentbox, ytd-comment-simplebox-renderer") || box.parentElement;
    host?.append(controls);
    composerControls.set(box, controls);
  }
}

function setWebsiteText(enabled){
 websiteTextOptInEnabled=enabled;textEpoch++;translated=new WeakMap();
 pageWork?.sync();
 if(!enabled)document.querySelectorAll('.jtl-title,.jtl-translation,.jtl-comment-action,.jtl-composer-controls').forEach(el=>el.remove());
 else scan();
}
chrome.storage.local.get(['websiteTextOptInEnabled','languageSettings','streamerChatMode']).then(s=>{streamerChatMode=s.streamerChatMode === true;languageSettings={...languageSettings,...(s.languageSettings||{})};setWebsiteText(s.websiteTextOptInEnabled === true);});
if(domWork)pageWork=domWork.observe(document,[titleSelector,chatSelector,commentSelector,composerSelector,'[role="log"]'].join(','),scan,
 {enabled:()=>websiteTextOptInEnabled&&!contextInvalid});
else{
 let timer;
 new MutationObserver(() => {if(!timer)timer=setTimeout(()=>{timer=null;scan();},250);})
  .observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['contenteditable']});
}
document.addEventListener("focusin", () => { if (websiteTextOptInEnabled && !contextInvalid) installComposerButton(); });
scan();
if (window.top === window) {
 void pollSubtitles();
 document.addEventListener('visibilitychange',()=>{
  pollEpoch++;setCaptionState(captionRunning,nativeAllowed);
  if(!document.hidden){void pollSubtitles();scan();}
 });
 const reset=()=>{textEpoch++;translated=new WeakMap();document.querySelectorAll('.jtl-title').forEach(line=>line.remove());pollEpoch++;selectedNativeCue=null;document.dispatchEvent?.(new Event('vocalume-reset-source-cue'));lastSubtitleKey='';renderSubtitle(null);if(captionRunning)runtimeMessage({type:'subtitle-reset'}).catch(()=>{});};
 document.addEventListener('yt-navigate-start',reset);
 document.addEventListener('seeking',event=>{if(event.target.tagName==='VIDEO')reset();},true);
}

})();
