import {API_PROVIDERS,selectedApi,apiProfile,apiEndpoint,apiSettingsUpdate,validateApiProfile} from './cloud-api.mjs';
import {captureStatus} from './capture-status.mjs';
import {translateUiText} from './ui-language.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const panels = ['text', 'speech', 'settings'];
let activePanel = 'text';
const languageOptions = [
  ['ja', '日文'], ['en', '英文'], ['zh', '繁體中文'], ['ko', '韓文'],
  ['es', '西班牙文'], ['fr', '法文'], ['de', '德文'], ['pt', '葡萄牙文'],
  ['it', '義大利文'], ['ru', '俄文'], ['th', '泰文'], ['vi', '越南文'],
  ['id', '印尼文'], ['ar', '阿拉伯文'],
];
const languageLabel = value => languageOptions.find(([code]) => code === value)?.[1] || value;
const languageDefaults = {readSource: 'ja', readTarget: 'zh', typeSource: 'zh', typeTarget: 'ja', speechSource: 'ja', speechTarget: 'zh', syncTextLanguages: true};
const languageIds = Object.keys(languageDefaults);
const defaults = {japaneseColor: '#ffffff', chineseColor: '#ffffff', fontSize: 22, showOutline: true, outlineColor: '#000000', outlineWidth: 1, captionOpacity: 100, backgroundColor: '#000000', backgroundOpacity: 60, position: 6, hideOnHover: false, holdSeconds: 3, captionMode: 'realtime', speechToneMode: 'off'};
const controls = Object.keys(defaults);
const appearanceControls = ['japaneseColor', 'chineseColor', 'fontSize', 'showOutline', 'outlineColor', 'outlineWidth', 'captionOpacity', 'backgroundColor', 'backgroundOpacity', 'position', 'hideOnHover'];
const checkControls = new Set(['showOutline', 'hideOnHover']);
const numericControls = ['fontSize', 'outlineWidth', 'position', 'holdSeconds', 'backgroundOpacity', 'captionOpacity'];
const dedicatedHosts = ['youtube.com', 'x.com', 'twitter.com', 'bilibili.com', 'tiktok.com', 'twitch.tv', 'facebook.com', 'instagram.com', 'discord.com', 'discordapp.com'];
const isDedicatedHost = host => dedicatedHosts.some(domain => host === domain || host.endsWith('.' + domain));
let currentSiteHost = '';
let supportedTab = false;
let initialized = false;
let navigated = false;
let healthReady = false;
let lastHealth = {};
let refreshing = false;
let pendingAction = '';
let actionError = '';
let connectionError = '';

function feedback(message, state = 'saved') {
  $('#languageStatus').textContent = message;
  $('footer').dataset.state = state;
}
function listen(selector, event, callback) {
  $(selector).addEventListener(event, (...args) => {
    Promise.resolve().then(() => callback(...args)).catch(error => feedback(`尚未完成：${error.message}`, 'error'));
  });
}
async function savePreferences(values, message = '已儲存設定') {
  await chrome.storage.local.set(values);
  feedback(message);
}
function send(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, reply => {
    const error = chrome.runtime.lastError?.message || (!reply?.ok && reply?.error);
    if (error || !reply?.ok) reject(new Error(error || '無法連線，請重新開啟擴充功能再試'));
    else resolve(reply.text);
  }));
}

function showPanel(name, {focus = false, remember = true} = {}) {
  const selected = panels.includes(name) ? name : 'text';
  activePanel = selected;
  for (const panel of panels) {
    const active = panel === selected;
    $(`#panel-${panel}`).hidden = !active;
    $(`#tab-${panel}`).setAttribute('aria-selected', String(active));
    $(`#tab-${panel}`).tabIndex = active ? 0 : -1;
  }
  $('#textControls').hidden = selected !== 'text';
  renderSpeech();
  $('.workspace').scrollTop = 0;
  if (focus) $(`#tab-${selected}`).focus();
  if (remember) {
    navigated = true;
    chrome.storage.local.set({popupPanel: selected}).catch(() => feedback('無法記住目前分頁，請稍後再試', 'error'));
  }
}
for (const tab of $$('[role="tab"]')) {
  tab.addEventListener('click', () => showPanel(tab.dataset.panel));
  tab.addEventListener('keydown', event => {
    const index = panels.indexOf(tab.dataset.panel);
    const next = {ArrowRight: (index + 1) % panels.length, ArrowLeft: (index + panels.length - 1) % panels.length, Home: 0, End: panels.length - 1}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showPanel(panels[next], {focus: true});
  });
}
listen('#openAppearance', 'click', () => {
  showPanel('settings', {focus: true});
});

for (const id of languageIds.filter(id => id !== 'syncTextLanguages')) {
  for (const [value, label] of languageOptions) $('#' + id).add(new Option(label, value));
}
function applySync() {
  const synced = $('#syncTextLanguages').checked;
  $('#typeSource').disabled = synced;
  $('#typeTarget').disabled = synced;
  $('[data-swap="type"]').disabled = synced;
  $('#typingLanguages').hidden = synced;
  if (synced) {
    $('#typeSource').value = $('#readTarget').value;
    $('#typeTarget').value = $('#readSource').value;
  }
  $('#syncSummary').textContent = synced
    ? `${languageLabel($('#typeSource').value)} → ${languageLabel($('#typeTarget').value)}`
    : '';
  $('#writingOptions').hidden = $('#typeSource').value !== 'zh' || $('#typeTarget').value !== 'ja';
}
async function saveLanguages() {
  applySync();
  const value = Object.fromEntries(languageIds.map(id => [id, id === 'syncTextLanguages' ? $('#' + id).checked : $('#' + id).value]));
  let invalid = false;
  for (const prefix of ['read', 'type', 'speech']) {
    const same = value[prefix + 'Source'] === value[prefix + 'Target'];
    for (const suffix of ['Source', 'Target']) $('#' + prefix + suffix).setAttribute('aria-invalid', String(same));
    invalid ||= same;
  }
  if (invalid) {
    feedback('兩種語言須不同，尚未儲存。', 'error');
    return;
  }
  await savePreferences({languageSettings: value}, '語言已儲存；語音於下次開始時套用');
}
for (const id of languageIds) listen('#' + id, 'change', saveLanguages);
for (const button of $$('[data-swap]')) {
  button.addEventListener('click', () => {
    if (button.disabled || !initialized) return;
    const prefix = button.dataset.swap;
    const source = $('#' + prefix + 'Source');
    const target = $('#' + prefix + 'Target');
    [source.value, target.value] = [target.value, source.value];
    saveLanguages().catch(error => feedback(`語言尚未儲存：${error.message}`, 'error'));
  });
}

function renderTextAccess() {
  const enabled = $('#websiteText').checked;
  const dedicated = isDedicatedHost(currentSiteHost);
  $('#currentSiteSection').hidden = supportedTab && dedicated;
  $('#currentSiteControl').hidden = !supportedTab || dedicated;
  $('#currentSiteTranslation').disabled = !supportedTab || dedicated;
  $('#currentSiteLabel').textContent = `允許 ${currentSiteHost} 翻譯`;
  $('#currentSiteHint').textContent = supportedTab ? '' : '請先打開要翻譯的網站，再點 VocaLume。';
  $('#streamerChatMode').disabled = !enabled;
}
async function loadCurrentSiteAccess() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  let url;
  try { url = new URL(tab?.url || ''); } catch { /* Internal pages have no usable URL. */ }
  supportedTab = Boolean(url && ['http:', 'https:'].includes(url.protocol));
  currentSiteHost = supportedTab ? url.hostname.toLowerCase() : '';
  const {genericSiteAccess = {}} = await chrome.storage.local.get('genericSiteAccess');
  $('#currentSiteTranslation').checked = supportedTab && (isDedicatedHost(currentSiteHost) || genericSiteAccess[currentSiteHost] === true);
  renderTextAccess();
  renderSpeech();
}
listen('#streamerChatMode', 'change', async () => {
  const chosen = $('#streamerChatMode').checked;
  try { await savePreferences({streamerChatMode: chosen}); }
  catch (error) { $('#streamerChatMode').checked = !chosen; throw error; }
});
listen('#websiteText', 'change', async () => {
  const chosen = $('#websiteText').checked;
  try { await savePreferences({websiteTextOptInEnabled: chosen}, chosen ? '網站文字翻譯已開啟' : '已關閉網站翻譯'); }
  catch (error) { $('#websiteText').checked = !chosen; throw error; }
  finally { renderTextAccess(); }
});
listen('#currentSiteTranslation', 'change', async () => {
  if (!currentSiteHost || isDedicatedHost(currentSiteHost)) return;
  const chosen = $('#currentSiteTranslation').checked;
  try {
    const {genericSiteAccess = {}} = await chrome.storage.local.get('genericSiteAccess');
    const next = {...genericSiteAccess};
    if (chosen) next[currentSiteHost] = true;
    else delete next[currentSiteHost];
    await savePreferences({genericSiteAccess: next});
  } catch (error) { $('#currentSiteTranslation').checked = !chosen; throw error; }
  finally { renderTextAccess(); }
});

function subtitleValues() {
  return Object.fromEntries(controls.map(id => [id, checkControls.has(id) ? $('#' + id).checked : numericControls.includes(id) ? Number($('#' + id).value) : $('#' + id).value]));
}
function paintLabels() {
  const value = subtitleValues();
  const preview = $('#captionPreview');
  const outline = value.showOutline && value.outlineWidth > 0;
  preview.style.backgroundColor = value.backgroundColor + Math.round(value.backgroundOpacity * 2.55).toString(16).padStart(2, '0');
  $('#outlineColor').disabled = !value.showOutline;
  $('#outlineWidth').disabled = !value.showOutline;
  $('#holdSeconds').disabled = value.captionMode !== 'realtime';
  preview.style.webkitTextStroke = outline ? `0.4px ${value.outlineColor}` : '0 transparent';
  preview.style.textShadow = outline ? `0 0 2px ${value.outlineColor}` : 'none';
  preview.style.opacity = value.captionOpacity / 100;
  preview.style.bottom = value.position + '%';
  preview.style.fontSize = Math.min(26, value.fontSize) + 'px';
  $('#previewJa').style.color = value.japaneseColor;
  $('#previewZh').style.color = value.chineseColor;
  for (const [id, suffix] of [['captionOpacity', '%'], ['backgroundOpacity', '%'], ['holdSeconds', ' 秒'], ['fontSize', ' px'], ['outlineWidth', ' px']]) $('#' + id + 'Value').textContent = value[id] + suffix;
}
async function saveSettings() {
  paintLabels();
  await savePreferences({subtitleSettings: subtitleValues()});
}
for (const id of controls) listen('#' + id, 'input', saveSettings);
listen('#reset', 'click', async () => {
  for (const id of appearanceControls) {
    if (checkControls.has(id)) $('#' + id).checked = defaults[id];
    else $('#' + id).value = defaults[id];
  }
  await saveSettings();
});

function renderEngine() {
  const desktop = $('#engineMode').value === 'desktop';
  $('#engineSummary').textContent = desktop ? '翻譯方式 · 本機 App' : '翻譯方式 · 瀏覽器';
  $('#desktopSettings').hidden = !desktop;
  $('#speechToneMode').disabled = !desktop;
}
listen('#engineMode', 'change', async () => {
  renderEngine();
  await savePreferences({speechMode: $('#engineMode').value}, '翻譯方式已儲存；下次開始時套用');
});
for (const id of ['writingStyle', 'writingQuality']) listen('#' + id, 'change', () => savePreferences({[id]: $('#' + id).value}));

function renderSpeech() {
  const d = lastHealth;
  const busy = Boolean(pendingAction || d.controlBusy || d.draining);
  $('#speechDock').hidden = activePanel !== 'speech' && !d.running && !busy && !actionError;
  const error = actionError || connectionError || d.lastError;
  const starting = pendingAction === 'start' && d.controlBusy && d.controlAction === 'start'
    ? captureStatus(d).replace(/^●\s*/, '') : '正在啟動字幕…';
  const message = pendingAction ? (pendingAction === 'start' ? starting : '正在停止收音…')
    : error ? `提示：${error}`
    : !supportedTab && !d.running && !d.draining ? '請回到影片或直播分頁，再開啟 VocaLume。'
    : !healthReady ? '正在確認字幕狀態…'
    : captureStatus(d).replace(/^●\s*/, '');
  $('#status').textContent = message;
  $('#captureDot').dataset.state = error ? 'error' : d.running || busy ? 'active' : 'idle';
  $('#start').disabled = !initialized || !healthReady || !supportedTab || Boolean(d.running) || busy;
  $('#start').textContent = pendingAction === 'start' || (d.controlBusy && d.controlAction === 'start') ? '正在啟動…' : d.running ? '語音字幕運行中' : d.draining ? '正在完成剩餘字幕…' : '開始語音字幕';
  $('#stop').hidden = !d.running && !busy;
  $('#start').hidden = Boolean(d.running) && !busy;
  $('#stop').disabled = !d.running || busy;
  $('#retryRecording').disabled = !(d.recordingFailed > 0) || Boolean(d.controlBusy);
  $('#recordingStatus').textContent = `等待翻譯 ${d.recordingPending || 0} 句 · 失敗 ${d.recordingFailed || 0} 句`;
}
function renderDiagnostics(d) {
  const x = d.diagnostics || {};
  const metric = name => { const m = x.metrics?.[name]; return m ? `${m.p50} / ${m.p95} ms` : '尚無資料'; };
  const delivery = name => { const m = x.deliveryMetrics?.[name]; return m ? `${m.p50} / ${m.p95} / ${m.p99} ms（${m.count} 句）` : '尚無資料'; };
  const time = value => Number.isFinite(value) && value >= 0 ? `${Math.round(value)} ms` : '尚無資料';
  $('#diagnostics').textContent = `音訊：${x.frames || 0} 區塊\n音量 RMS：${(x.level || 0).toFixed(5)}\nVAD 樣本（最多 120）：${x.metrics?.vadMs?.count || 0}\n辨識模型：${x.model || '—'} ${x.dtype || ''}\n人聲機率：${Math.round((x.probability || 0) * 100)}%\n模型：${x.ready ? '就緒' : '尚未就緒'}\n單段處理（依模式可能不含譯文）：${time(x.decodeMs)}\n最近翻譯：${time(x.translationMs)}\n片段結束到最近譯文：${time(x.chineseLagMs)}\n首段暫定文字 P50/P95：${metric('firstTokenMs')}\n首段處理完成 P50/P95：${metric('firstJapaneseMs')}\n單段處理 P50/P95：${metric('decodeMs')}\n片段結束至開始處理 P50/P95：${metric('queueMs')}\n桌面模式最近 120 句，P50/P95/P99：\n片段結束至最終原文：${delivery('endToSourceMs')}\n最終原文至譯文（含排隊）：${delivery('sourceToTranslationMs')}\n片段結束至最終譯文：${delivery('endToTranslationMs')}\n節能調整：${x.performance?.coolingDown ? '冷卻恢復中' : x.performance?.thermalState || 'unknown'}\n${x.performance?.previewsPaused ? '暫停草稿，優先完成句子' : `草稿間隔 ${x.cadenceMs || 500} ms`}\n記憶體狀態：${({ nominal: '正常', warning: '偏高', critical: '很高', unknown: '未取得' })[x.performance?.memoryPressure] || '未取得'}\n節能略過草稿：${x.previewsSkipped || 0}\n待處理：${x.queueDepth || 0}\n略過過期音訊：${x.dropped || 0}\n不可靠結果：${x.rejected || 0}\n音訊重同步：${x.overruns || 0}${d.lastError ? '\n最近錯誤：' + d.lastError : ''}`;
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    lastHealth = await send({type: 'health'});
    healthReady = true;
    connectionError = '';
    renderDiagnostics(lastHealth);
  } catch (error) { connectionError = error.message; }
  finally { refreshing = false; renderSpeech(); }
}
async function controlSpeech(action) {
  if (pendingAction) return;
  pendingAction = action;
  actionError = '';
  renderSpeech();
  try {
    if (action === 'start') {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('請先回到影片或直播分頁');
      await send({type: 'subtitle-control', action, tabId: tab.id});
    } else await send({type: 'subtitle-control', action});
  } catch (error) { actionError = error.message; }
  finally { pendingAction = ''; await refresh(); renderSpeech(); }
}
listen('#start', 'click', () => controlSpeech('start'));
listen('#stop', 'click', () => controlSpeech('stop'));
listen('#desktopSettings', 'click', async () => {
  actionError = '';
  try { await send({type: 'desktop-settings'}); feedback('已開啟桌面設定'); }
  catch (error) { actionError = error.message; }
  renderSpeech();
});

let apiSaved = {}, apiSelected = 'auto', apiDirty = false;
const apiDrafts = new Map();
for (const provider of API_PROVIDERS) $('#apiProvider').add(new Option(provider.label, provider.id));
function apiForm() {
  return {provider: apiSelected, model: $('#apiModel').value, baseUrl: $('#apiBaseUrl').value, apiKey: $('#apiKey').value, clearKey: $('#apiClearKey').checked};
}
function canTestApi() {
  if (apiDirty || apiSelected === 'auto') return false;
  try { validateApiProfile(apiProfile(apiSaved, apiSelected)); return true; } catch { return false; }
}
function renderApiProvider() {
  const profile = apiProfile(apiSaved, apiSelected), draft = apiDrafts.get(apiSelected) || profile;
  $('#apiFields').hidden = apiSelected === 'auto';
  $('#apiUrlField').hidden = apiSelected !== 'custom';
  $('#apiModel').value = draft.model || '';
  $('#apiBaseUrl').value = draft.baseUrl || '';
  // Only an unsaved key typed into this provider's own form may be shown as a masked value.
  $('#apiKey').value = apiDrafts.has(apiSelected) ? draft.apiKey || '' : '';
  $('#apiKey').placeholder = profile.apiKey ? '已儲存（留空保留）' : '尚未設定';
  $('#apiClearKey').checked = Boolean(draft.clearKey);
  $('#apiClearLabel').hidden = !profile.apiKey;
  $('#testTranslation').disabled = !canTestApi();
}
async function loadTranslationStatus() {
  apiSaved = await chrome.storage.local.get(['cloudTranslation', 'nvidiaKey', 'openrouterKey']);
  apiSelected = selectedApi(apiSaved);
  $('#apiProvider').value = apiSelected;
  apiDirty = false;
  apiDrafts.clear();
  renderApiProvider();
}
listen('#apiProvider', 'change', () => {
  apiDrafts.set(apiSelected, apiForm());
  apiSelected = $('#apiProvider').value;
  apiDirty = true;
  $('#translationStatus').textContent = '尚未套用，請儲存服務。';
  renderApiProvider();
});
for (const id of ['apiModel', 'apiBaseUrl', 'apiKey', 'apiClearKey']) listen('#' + id, 'input', () => {
  apiDirty = true;
  $('#testTranslation').disabled = true;
  $('#translationStatus').textContent = '尚未套用，請儲存服務。';
});
listen('#saveTranslation', 'click', async () => {
  $('#translationStatus').textContent = '';
  try {
    const form = apiForm(), updated = apiSettingsUpdate(apiSaved, form);
    if (form.provider !== 'auto' && !form.clearKey) {
      const origin = apiEndpoint(apiProfile({cloudTranslation: updated}).baseUrl).origin;
      if (!await chrome.permissions.request({origins: [origin]})) throw new Error('尚未允許連線，設定未變更。可再次儲存並允許此服務。');
    }
    const values = {cloudTranslation: updated};
    const legacyKey = API_PROVIDERS.find(p => p.id === form.provider)?.legacyKey;
    if (form.clearKey && legacyKey) values[legacyKey] = '';
    await savePreferences(values);
    await loadTranslationStatus();
    $('#translationStatus').textContent = form.clearKey ? '已移除金鑰。要使用此服務，請重新填入金鑰。' : '已儲存，下次翻譯套用；桌面語音引擎保持原設定。';
  } catch (error) { $('#translationStatus').textContent = error.message; }
});
listen('#testTranslation', 'click', async () => {
  const provider = apiSelected, revision = apiSaved.cloudTranslation?.revision;
  const stillCurrent = () => !apiDirty && apiSelected === provider && apiSaved.cloudTranslation?.revision === revision;
  $('#testTranslation').disabled = true;
  $('#translationStatus').textContent = '正在測試已儲存的 API…';
  try {
    const result = await send({type: 'translation-provider-test'});
    if (stillCurrent()) $('#translationStatus').textContent = `${result.provider} 連線成功：${result.translated}`;
  } catch (error) { if (stillCurrent()) $('#translationStatus').textContent = error.message; }
  finally { $('#testTranslation').disabled = !canTestApi(); }
});
listen('#exportRecording', 'click', async () => {
  const entries = await send({type: 'recording-export'});
  if (!entries.length) { $('#recordingFeedback').textContent = '還沒有字幕記錄，開始語音字幕後即可累積。'; return; }
  const locale = document.documentElement.lang;
  const missingTranslation = translateUiText('[尚未翻譯]', locale);
  const text = entries.map(entry => new Date(entry.createdAt).toLocaleString(locale) + '\n' + entry.original + '\n' + (entry.translated || missingTranslation)).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = translateUiText('VocaLume 字幕記錄.txt', locale);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#recordingFeedback').textContent = `已匯出 ${entries.length} 句字幕。`;
});
listen('#retryRecording', 'click', async () => {
  await send({type: 'recording-retry'});
  $('#recordingFeedback').textContent = '已重新加入翻譯佇列。';
  await refresh();
});

async function initialize() {
  $('#extensionVersion').textContent = 'v' + chrome.runtime.getManifest().version;
  const saved = await chrome.storage.local.get(['languageSettings', 'subtitleSettings', 'captionStyleV34', 'speechMode', 'writingStyle', 'writingQuality', 'websiteTextOptInEnabled', 'streamerChatMode', 'popupPanel']);
  const languages = {...languageDefaults, ...saved.languageSettings};
  for (const id of languageIds) {
    if (id === 'syncTextLanguages') $('#' + id).checked = Boolean(languages[id]);
    else $('#' + id).value = languageOptions.some(([code]) => code === languages[id]) ? languages[id] : languageDefaults[id];
  }
  applySync();
  let subtitleSettings = saved.subtitleSettings || {};
  if (!saved.captionStyleV34) {
    subtitleSettings = {...subtitleSettings, fontSize: 22, japaneseColor: '#ffffff', chineseColor: '#ffffff', outlineWidth: 1, backgroundColor: '#000000', backgroundOpacity: 60};
    await chrome.storage.local.set({subtitleSettings, captionStyleV34: true});
  }
  const subtitles = {...defaults, ...subtitleSettings};
  for (const id of controls) {
    if (checkControls.has(id)) $('#' + id).checked = subtitles[id] === true;
    else $('#' + id).value = subtitles[id];
  }
  paintLabels();
  $('#streamerChatMode').checked = saved.streamerChatMode === true;
  $('#websiteText').checked = saved.websiteTextOptInEnabled === true;
  $('#engineMode').value = saved.speechMode === 'desktop' ? 'desktop' : 'browser';
  $('#writingStyle').value = ['general', 'viewer', 'polite'].includes(saved.writingStyle) ? saved.writingStyle : 'general';
  $('#writingQuality').value = saved.writingQuality === 'quality' ? 'quality' : 'fast';
  renderEngine();
  if (!navigated) showPanel(saved.popupPanel, {remember: false});
  await Promise.all([loadCurrentSiteAccess(), loadTranslationStatus(), refresh()]);
  initialized = true;
  $('#controls').disabled = false;
  $('main').setAttribute('aria-busy', 'false');
  renderSpeech();
  feedback('', 'idle');
}
initialize().catch(error => {
  feedback(`無法讀取設定，請重新開啟：${error.message}`, 'error');
  $('main').setAttribute('aria-busy', 'false');
});
setInterval(refresh, 1500);
