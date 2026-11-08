import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('drag and edge resize stay within viewport and save proportional position',async()=>{
 const handlers={};let saved,storageChanged;const styles={};
 const node=()=>({classList:{add(){}},style:{setProperty(k,v){styles[k]=v;}},dataset:{},append(){},replaceChildren(){}});
 const root={...node(),parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600})},getBoundingClientRect:()=>({left:100,top:100,width:500,height:300}),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name],setPointerCapture(){}};
 const window={innerWidth:1000,innerHeight:600};const chrome={storage:{onChanged:{addListener(fn){storageChanged=fn;}},local:{get:async()=>({}),set:async v=>saved=v}}};
 vm.runInNewContext(fs.readFileSync(new URL('../caption-window.js',import.meta.url),'utf8'),{window,chrome,document:{createElement:node}});
 const panel=new window.JtlCaptionWindow(root,'rect');await Promise.resolve();
 panel.render([]);assert.equal(styles.visibility,'hidden');
  panel.apply({captionOpacity:45});assert.equal(styles.opacity,'0.45');
 const pointer=(side='')=>({button:0,pointerId:1,clientX:100,clientY:100,target:{dataset:{side}},preventDefault(){},stopPropagation(){}});
 panel.begin(pointer());handlers.pointermove({clientX:2000,clientY:2000});handlers.pointerup();
 assert.equal(saved.rect.x,.5);assert.equal(saved.rect.y,.5);assert.equal(root.style.left,'50%');
 panel.begin(pointer('se'));handlers.pointermove({clientX:500,clientY:250});handlers.pointerup();assert.equal(saved.rect.w,.9);assert.equal(saved.rect.h,.75);
 panel.place(saved.rect);assert.equal(root.style.width,'90%');assert.equal(root.style.height,'75%');
});

test('hover hiding tracks the full caption rectangle and releases it on exit', async () => {
 const listeners = new Map();
 const classes = new Set();
 const window = {
  addEventListener: (name, listener) => listeners.set(name, listener),
  removeEventListener: name => listeners.delete(name),
  requestAnimationFrame: queueMicrotask
 };
 const node = () => ({style: {setProperty() {}}, dataset: {}, append() {}, replaceChildren() {}});
 const root = {
  ...node(),
  addEventListener() {},
  getBoundingClientRect: () => ({left: 100, top: 50, right: 400, bottom: 250}),
  classList: {
   add: name => classes.add(name),
   remove: name => classes.delete(name),
   toggle: (name, active) => active ? classes.add(name) : classes.delete(name)
  }
 };
 const chrome = {storage: {local: {get: async () => ({captionStyleV34: true}), set: async () => {}}}};
 vm.runInNewContext(fs.readFileSync(new URL('../caption-window.js',import.meta.url),'utf8'), {window, chrome, document: {createElement: node}});
 const panel = new window.JtlCaptionWindow(root, 'rect');
 await Promise.resolve();
 panel.render([{original: '字幕', translated: '測試'}]);
 assert.equal(listeners.has('pointermove'), false);
 panel.apply({hideOnHover: true});
 assert.equal(classes.has('jtl-hover-through'), true);
 const move = (clientX, clientY) => listeners.get('pointermove')({clientX, clientY, pointerType: 'mouse'});
 move(390, 240); // Empty corner of the box, away from the caption text.
 assert.equal(classes.has('jtl-hover-hidden'), true);
 panel.render([{original: '次の文', translated: '下一句'}]);
 assert.equal(classes.has('jtl-hover-hidden'), true, 'new captions stay hidden under a stationary pointer');
 move(401, 240);
 assert.equal(classes.has('jtl-hover-hidden'), false);
 move(100, 50);
 assert.equal(classes.has('jtl-hover-hidden'), true);
 listeners.get('pointerout')({relatedTarget: null, pointerType: 'mouse'});
 assert.equal(classes.has('jtl-hover-hidden'), false);
 move(390, 240);
 panel.render([]);
 assert.equal(classes.has('jtl-hover-hidden'), false);
 panel.dispose();
 assert.equal(classes.has('jtl-hover-through'), false);
 assert.equal(listeners.size, 0);
});
