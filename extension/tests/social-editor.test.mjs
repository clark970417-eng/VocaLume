import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../social-content.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  function editableText'), source.indexOf('  function installComposer'));
class Event {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}
class InputEvent extends Event { getTargetRanges() { return this.targetRanges || []; } }
class ClipboardEvent extends Event {}
class DataTransfer {
  constructor() { this.values = new Map(); }
  setData(type, value) { this.values.set(type, value); }
  getData(type) { return this.values.get(type) || ''; }
  get types() { return [...this.values.keys()]; }
}

function editor(site = 'discord', handler = 'beforeinput') {
  let model = '今天不能參加。', visible = model, directWrites = 0, nativeCalls = 0;
  const events = [], ranges = [];
  const view = {innerWidth:1200, innerHeight:800, StaticRange:class { constructor(range) { Object.assign(this, range); } },
    getSelection:() => ({removeAllRanges(){},addRange(range){ranges.push(range);}})};
  const document = {defaultView:view, dispatchEvent(){},
    createRange:() => ({selectNodeContents(box){this.startContainer = this.endContainer = box; this.startOffset = 0; this.endOffset = 1;}}),
    execCommand(){nativeCalls++; visible = 'view-only mutation'; return true;}, body:{append(node){node.isConnected = true;}}};
  const box = {ownerDocument:document, isConnected:true, focus(){}, querySelectorAll:()=>[], querySelector:()=>null,
    matches:selector => site === 'discord' && selector.includes('data-slate-editor'), closest:()=>null, getBoundingClientRect:()=>({top:300,bottom:340,left:250,width:400,height:40}),
    get innerText(){return visible;}, get textContent(){return visible;}, set textContent(value){directWrites++;visible = value;},
    dispatchEvent(event){
      events.push(event);
      if (handler === event.type) {
        if (handler === 'beforeinput') {
          assert.equal(event.inputType, 'insertReplacementText');
          assert.equal(event.getTargetRanges()[0].startContainer, box);
          model = event.data;
        } else {
          assert.deepEqual(event.clipboardData.types, ['text/plain']);
          model = event.clipboardData.getData('text/plain');
        }
        event.preventDefault();
        // The submitted value belongs to the framework, not the DOM surface.
        Promise.resolve().then(() => { visible = model; });
      }
      return !event.defaultPrevented;
    }};
  const api = vm.runInNewContext('let composerPosition;\n' + helpers + '\n({replaceEditable,editableText,mountComposerControls,positionComposerControls,isUsableComposer})',
    {site,window:view,document,InputEvent,Event,ClipboardEvent,DataTransfer,setTimeout});
  return {...api,box,view,document,events,ranges,submittedValue:()=>model,directWrites:()=>directWrites,nativeCalls:()=>nativeCalls};
}

for (const site of ['discord','twitch']) {
  test(`${site}: translated visible text and submission state change together`, async () => {
    const t = editor(site);
    const draft = '今日は参加できません。\nまた明日ね！😊';
    assert.equal(await t.replaceEditable(t.box,draft),true);
    assert.equal(t.submittedValue(),draft);
    assert.equal(t.box.innerText,draft);
    assert.equal(t.directWrites(),0);
    assert.equal(t.nativeCalls(),0);
    assert.equal(t.ranges.length,1);
    assert.ok(t.events.every(event=>!['keydown','keyup','submit','click'].includes(event.type)));
  });
  test(`${site}: a rejected editor keeps the source instead of a view-only Japanese draft`, async () => {
    const t = editor(site,'ignored');
    assert.equal(await t.replaceEditable(t.box,'明日また来ます。'),false);
    assert.equal(t.submittedValue(),'今天不能參加。');
    assert.equal(t.box.innerText,'今天不能參加。');
    assert.equal(t.nativeCalls(),0);
    assert.equal(t.directWrites(),0);
  });
}

test('paste-only editors update their owned document through plain-text paste', async () => {
  const t = editor('discord','paste');
  assert.equal(await t.replaceEditable(t.box,'今日は来られません。'),true);
  assert.equal(t.submittedValue(),'今日は来られません。');
  assert.equal(t.nativeCalls(),0);
  assert.equal(t.directWrites(),0);
});

test('a cancelled edit that does not render its result is not reported as success', async () => {
  const t = editor();
  t.box.dispatchEvent = event=>{event.preventDefault();return false;};
  assert.equal(await t.replaceEditable(t.box,'日文草稿'),false);
  assert.equal(t.submittedValue(),'今天不能參加。');
});

test('a preserved read-only draft cannot steal the native composer translation control', () => {
  const t = editor('twitch');
  assert.equal(t.isUsableComposer(t.box),true);
  t.box.readOnly = true;
  assert.equal(t.isUsableComposer(t.box),false);
  t.box.readOnly = false;
  t.box.closest = selector=>selector.includes('.jtl-social-controls') ? {} : null;
  assert.equal(t.isUsableComposer(t.box),false);
});

test('React textarea insertion bypasses the value tracker so the submission state changes', async () => {
  const t = editor('twitch');
  class Textarea {
    constructor(){this.raw = this.tracked = this.model = '今天不能參加。';this.tagName = 'TEXTAREA';this.isConnected = true;this.ownerDocument = t.document;}
    get value(){return this.raw;}
    set value(value){this.raw = value;}
    focus(){}
    dispatchEvent(event){if(event.type === 'input' && this.raw !== this.tracked) this.model = this.tracked = this.raw;}
  }
  t.view.HTMLTextAreaElement = Textarea;
  const box = new Textarea();
  Object.defineProperty(box,'value',{get(){return this.raw;},set(value){this.tracked = this.raw = value;}});
  const draft = '今日は参加できません。';
  assert.equal(await t.replaceEditable(box,draft),true);
  assert.equal(box.value,draft);
  assert.equal(box.model,draft);
});

for (const site of ['discord','twitch']) {
  test(`${site}: controls reserve a separate row before the composer and never mount over Send`, () => {
    const t = editor(site), nativeSend = {};
    const anchor = {parentElement:{},send:nativeSend,insertAdjacentElement(position,controls){this.position = position;this.controls = controls;controls.isConnected = true;}};
    t.box.closest = selector => selector === (site === 'discord' ? 'form' : '.chat-input') ? anchor : null;
    let portal = false; t.document.body.append = ()=>{portal = true;};
    const controls = {dataset:{},style:{}};
    t.mountComposerControls(t.box,controls);
    assert.equal(controls.dataset.placement,'inline');
    assert.equal(anchor.position,'beforebegin');
    assert.equal(anchor.send,nativeSend);
    assert.equal(portal,false);
  });
}

test('floating fallback stays outside the whole composer, including its Send row', () => {
  const t = editor('generic');
  t.box.closest = ()=>({getBoundingClientRect:()=>({top:10,bottom:100,left:250,width:400,height:90})});
  t.box.getBoundingClientRect = ()=>({top:10,bottom:50,left:250,width:400,height:40});
  const controls = {dataset:{placement:'floating'},style:{},isConnected:true,getBoundingClientRect:()=>({height:36,width:220})};
  t.positionComposerControls(t.box,controls);
  assert.equal(controls.style.top,'108px');
  assert.equal(controls.style.visibility,'visible');
  t.box.getBoundingClientRect = ()=>({top:300,bottom:340,left:250,width:400,height:40});
  t.box.closest = ()=>null;
  t.positionComposerControls(t.box,controls);
  assert.equal(controls.style.top,'256px');
});
