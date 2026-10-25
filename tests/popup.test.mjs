import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {captureStatus} from '../capture-status.mjs';

const html = fs.readFileSync(new URL('../popup.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Exercise the shipped controller against real markup IDs without requiring a browser in CI.
async function harness({saved = {}, url = 'https://www.youtube.com/watch?v=example', health = {running: false}} = {}) {
  const elements = [], writes = [], requests = [], timers = [];
  const state = {saved: {captionStyleV34: true, ...structuredClone(saved)}, health, focused: '', writeError: null, handler: null, url};
  class Element {
    constructor(tag, attrs = {}) {
      this.tag = tag;
      this.attrs = attrs;
      this.id = attrs.id;
      this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5), value]));
      this.value = attrs.value || '';
      this.checked = Object.hasOwn(attrs, 'checked');
      this.hidden = Object.hasOwn(attrs, 'hidden');
      this.disabled = Object.hasOwn(attrs, 'disabled');
      this.textContent = '';
      this.style = {};
      this.listeners = {};
      this.options = [];
    }
    add(option) { this.options.push(option); }
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    dispatch(event, data = {}) { for (const fn of this.listeners[event] || []) fn({target: this, preventDefault() {}, ...data}); }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() { state.focused = this.id; }
    click() { if (!this.disabled) this.dispatch('click'); }
  }
  for (const [, tag, raw] of html.matchAll(/<(\w+)(\s[^>]*|)>/g)) {
    const attrs = {};
    for (const [, key, value] of raw.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[key] = value ?? '';
    elements.push(new Element(tag, attrs));
  }
  function matches(el, selector) {
    if (selector.startsWith('#')) return el.id === selector.slice(1);
    if (selector.startsWith('.')) return (el.attrs.class || '').split(' ').includes(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return Object.hasOwn(el.attrs, attr[1]) && (attr[2] === undefined || el.attrs[attr[1]] === attr[2]);
    return el.tag === selector;
  }
  const get = selector => { const el = elements.find(el => matches(el, selector)); assert.ok(el, `Missing element: ${selector}`); return el; };
  const context = {
    document: {querySelector: get, querySelectorAll: selector => elements.filter(el => matches(el, selector)), createElement: tag => new Element(tag)},
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    chrome: {
      storage: {local: {
        get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in state.saved).map(key => [key, structuredClone(state.saved[key])])),
        set: async values => { if (state.writeError) throw state.writeError; writes.push(structuredClone(values)); Object.assign(state.saved, structuredClone(values)); },
      }},
      tabs: {query: async () => [{id: 42, url: state.url}]},
      runtime: {
        getManifest: () => ({version: 'test'}),
        sendMessage: (message, reply) => {
          requests.push(structuredClone(message));
          if (message.type === 'health') return reply({ok: true, text: state.health});
          if (state.handler) return state.handler(message, reply);
          reply({ok: true, text: message.type === 'recording-export' ? [] : ''});
        },
      },
    },
    captureStatus, URL, Blob, Date,
    setInterval: fn => timers.push(fn), setTimeout: () => {},
  };
  vm.runInNewContext(source, context);
  await settle();
  return {
    get, state, writes, requests,
    click: async selector => { get(selector).click(); await settle(); },
    change: async (id, value, event = 'change') => {
      const el = get('#' + id);
      if (typeof value === 'boolean') el.checked = value; else el.value = String(value);
      el.dispatch(event);
      await settle();
    },
    poll: async () => { for (const fn of timers) fn(); await settle(); },
  };
}

test('new popup keeps opt-in off, all languages, saved captions and engine settings', async () => {
  const saved = {websiteTextEnabled: true, speechMode: 'desktop', writingStyle: 'polite', subtitleSettings: {showOutline: false, outlineWidth: 0, backgroundColor: '#aabbcc', backgroundOpacity: 40}, languageSettings: {readSource: 'ko', readTarget: 'ja'}};
  const h = await harness({saved});
  assert.equal(h.get('#controls').disabled, false);
  assert.equal(h.get('#websiteText').checked, false);
  assert.equal(h.get('#readSource').options.length, 14);
  assert.equal(h.get('#readSource').value, 'ko');
  assert.equal(h.get('#typeSource').value, 'ja');
  assert.equal(h.get('#typeTarget').value, 'ko');
  assert.equal(h.get('#engineMode').value, 'desktop');
  assert.equal(h.get('#writingStyle').value, 'polite');
  assert.equal(h.get('#showOutline').checked, false);
  assert.equal(h.get('#captionPreview').style.textShadow, 'none');
  assert.match(h.get('#captionPreview').style.backgroundColor, /^#aabbcc/);
  assert.equal(h.writes.length, 0, 'opening the redesigned popup must not rewrite existing settings');
});

test('task navigation remembers the page without enabling translation or capture', async () => {
  const h = await harness();
  await h.click('#tab-speech');
  assert.equal(h.get('#panel-read').hidden, true);
  assert.equal(h.get('#panel-speech').hidden, false);
  assert.equal(h.get('#textControls').hidden, true);
  assert.equal(h.get('#tab-speech').attrs['aria-selected'], 'true');
  assert.equal(h.state.saved.popupPanel, 'speech');
  assert.equal(h.requests.some(r => r.type === 'subtitle-control'), false);
  assert.equal(h.get('#websiteText').checked, false);
  const reopened = await harness({saved: h.state.saved});
  assert.equal(reopened.get('#panel-speech').hidden, false);
  await reopened.click('#openAppearance');
  assert.equal(reopened.get('#panel-settings').hidden, false);
  assert.equal(reopened.get('#appearance').open, true);
});

test('speech tone saves independently, survives reopening and requires desktop speech mode', async () => {
  const h = await harness({saved: {speechMode: 'desktop'}});
  assert.equal(h.get('#speechToneMode').disabled, false);
  assert.equal(h.get('#speechToneMode').value, 'off');
  await h.change('speechToneMode', 'ww', 'input');
  assert.equal(h.state.saved.subtitleSettings.speechToneMode, 'ww');
  assert.equal(h.requests.some(r => r.type === 'subtitle-control'), false);
  assert.equal(h.get('#websiteText').checked, false);
  const reopened = await harness({saved: h.state.saved});
  assert.equal(reopened.get('#speechToneMode').value, 'ww');
  await reopened.change('engineMode', 'browser');
  assert.equal(reopened.get('#speechToneMode').disabled, true);
  assert.equal(reopened.get('#speechToneMode').value, 'ww');
});

test('tabs support arrows, Home and End with a single keyboard tab stop', async () => {
  const h = await harness();
  h.get('#tab-read').dispatch('keydown', {key: 'ArrowRight'});
  assert.equal(h.state.focused, 'tab-write');
  assert.equal(h.get('#tab-read').tabIndex, -1);
  h.get('#tab-write').dispatch('keydown', {key: 'End'});
  assert.equal(h.state.focused, 'tab-settings');
  h.get('#tab-settings').dispatch('keydown', {key: 'Home'});
  assert.equal(h.state.focused, 'tab-read');
});

test('swap reading languages reverses synchronized writing; unsync allows an independent pair', async () => {
  const h = await harness();
  await h.click('[data-swap="read"]');
  assert.equal(h.state.saved.languageSettings.readSource, 'zh');
  assert.equal(h.state.saved.languageSettings.typeSource, 'ja');
  assert.equal(h.get('[data-swap="type"]').disabled, true);
  await h.change('syncTextLanguages', false);
  await h.change('typeSource', 'en');
  await h.change('typeTarget', 'ko');
  assert.equal(h.state.saved.languageSettings.typeSource, 'en');
  assert.equal(h.state.saved.languageSettings.typeTarget, 'ko');
  assert.equal(h.state.saved.languageSettings.readTarget, 'ja');
  assert.equal(h.get('#writingOptions').hidden, true);
});

test('equal language directions show a visible error instead of silently persisting an invalid pair', async () => {
  const h = await harness();
  await h.change('readSource', 'zh');
  assert.equal(h.state.saved.languageSettings, undefined);
  assert.equal(h.get('#readSource').attrs['aria-invalid'], 'true');
  assert.match(h.get('#languageStatus').textContent, /尚未儲存/);
  await h.change('readTarget', 'en');
  assert.equal(h.get('#readSource').attrs['aria-invalid'], 'false');
  assert.equal(h.state.saved.languageSettings.readTarget, 'en');
});

test('dedicated sites use one explicit master switch; opting out does not stop audio', async () => {
  const h = await harness({health: {running: true}});
  assert.equal(h.get('#currentSiteControl').hidden, true);
  await h.change('websiteText', true);
  assert.equal(h.state.saved.websiteTextOptInEnabled, true);
  await h.change('websiteText', false);
  assert.equal(h.state.saved.websiteTextOptInEnabled, false);
  assert.equal(h.requests.some(r => r.type === 'subtitle-control'), false);
  assert.match(h.get('#textToggleHint').textContent, /關閉中/);
});

test('generic site access is separate and a failed save restores its visible switch', async () => {
  const h = await harness({url: 'https://example.org/page', saved: {genericSiteAccess: {'other.org': true}}});
  assert.equal(h.get('#currentSiteControl').hidden, false);
  await h.change('currentSiteTranslation', true);
  assert.deepEqual(h.state.saved.genericSiteAccess, {'other.org': true, 'example.org': true});
  h.state.writeError = new Error('storage unavailable');
  await h.change('currentSiteTranslation', false);
  assert.equal(h.get('#currentSiteTranslation').checked, true);
  await h.change('websiteText', true);
  assert.equal(h.get('#websiteText').checked, false);
  assert.match(h.get('#languageStatus').textContent, /storage unavailable/);
});

test('start failure leaves an actionable error and permits retry; a pending request cannot be started twice', async () => {
  const h = await harness({saved: {speechMode: 'desktop'}});
  h.state.handler = (_, reply) => reply({ok: false, error: 'Native host has exited.'});
  await h.click('#start');
  assert.equal(h.get('#start').disabled, false);
  assert.match(h.get('#status').textContent, /Native host/);
  await h.poll();
  assert.match(h.get('#status').textContent, /Native host/, 'polling must not erase the action failure');
  let finish;
  h.state.handler = (_, reply) => { finish = reply; };
  await h.click('#start');
  assert.equal(h.get('#start').disabled, true);
  h.state.health = {running: false, controlBusy: true, controlAction: 'start', modelStatus: '正在載入桌面模型'};
  await h.poll();
  assert.match(h.get('#status').textContent, /正在載入桌面模型/);
  await h.click('#start');
  assert.equal(h.requests.filter(r => r.type === 'subtitle-control').length, 2);
  h.state.health = {running: true};
  finish({ok: true, text: ''});
  await settle();
  assert.equal(h.get('#stop').hidden, false);
  assert.equal(h.get('#stop').disabled, false);
});

test('stop failures remain retryable; draining captions block a new capture', async () => {
  const h = await harness({health: {running: true}});
  h.state.handler = (_, reply) => reply({ok: false, error: 'temporary disconnect'});
  await h.click('#stop');
  assert.equal(h.get('#stop').disabled, false);
  assert.match(h.get('#status').textContent, /temporary disconnect/);
  h.state.handler = (_, reply) => { h.state.health = {running: false, draining: true, diagnostics: {queueDepth: 2}}; reply({ok: true}); };
  await h.click('#stop');
  assert.equal(h.get('#start').disabled, true);
  assert.match(h.get('#status').textContent, /完成剩餘字幕/);
  h.state.health = {running: false, draining: false};
  await h.poll();
  assert.equal(h.get('#start').disabled, false);
});

test('internal browser pages explain why capture is unavailable and never request capture', async () => {
  const h = await harness({url: 'opera://extensions'});
  assert.equal(h.get('#start').disabled, true);
  assert.equal(h.get('#currentSiteControl').hidden, true);
  assert.match(h.get('#status').textContent, /影片或直播分頁/);
  await h.click('#start');
  assert.equal(h.requests.some(r => r.type === 'subtitle-control'), false);
});

test('zero outline and the outline switch leave caption background unchanged', async () => {
  const h = await harness({saved: {subtitleSettings: {backgroundColor: '#cc3344', backgroundOpacity: 55}}});
  await h.change('outlineWidth', 0, 'input');
  assert.equal(h.get('#captionPreview').style.textShadow, 'none');
  assert.equal(h.state.saved.subtitleSettings.backgroundOpacity, 55);
  await h.change('showOutline', false, 'input');
  assert.equal(h.get('#outlineWidth').disabled, true);
  assert.equal(h.state.saved.subtitleSettings.backgroundColor, '#cc3344');
});

test('cloud keys stay masked and blank fields retain the existing secret', async () => {
  const h = await harness({saved: {nvidiaKey: 'test-existing-secret'}});
  assert.equal(h.get('#nvidiaKey').value, '');
  assert.match(h.get('#nvidiaKey').placeholder, /已儲存/);
  await h.click('#saveTranslation');
  assert.equal(h.state.saved.nvidiaKey, 'test-existing-secret');
  assert.equal(h.get('#nvidiaKey').value, '');
});

test('empty transcripts give next-step guidance instead of downloading an empty file', async () => {
  const h = await harness();
  await h.click('#exportRecording');
  assert.match(h.get('#recordingFeedback').textContent, /還沒有字幕記錄/);
  assert.equal(h.get('#retryRecording').disabled, true);
});

test('every form label targets an existing control and tab relations are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/\b(?:for|aria-controls|aria-labelledby)="([^"]+)"/g)) assert.ok(ids.includes(id), id);
  assert.equal([...html.matchAll(/role="tab"/g)].length, 4);
  assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 4);
});
