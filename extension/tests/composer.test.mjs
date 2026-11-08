import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=['translation-guards.js','dom-changes.js','content.js'].map(file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')).join('\n');
function setup(){
 const boxes=[], controls=[], replies=[];let change,scan;
 const makeBox=()=>{
  const listeners=new Map();
  const host={append(c){c.isConnected=true;controls.push(c);}};
  const box={textContent:'都好好聽啊',isConnected:true,closest:()=>host,parentElement:host,focus(){document.activeElement=box;},
   addEventListener(type,fn){listeners.set(type,fn);},
   removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
   emit(type,event){listeners.get(type)?.(event);}};
  boxes.push(box);return box;
 };
 const document={documentElement:{},querySelector:()=>null,querySelectorAll:s=>s.includes('#contenteditable-root')?boxes:s.includes('.jtl-composer-controls')?controls:[],createElement:()=>({children:[],setAttribute(){},append(...c){this.children.push(...c);},addEventListener(_,fn){this.click=fn;},remove(){this.isConnected=false;}}),addEventListener(){},createRange:()=>({selectNodeContents(){}}),execCommand(cmd,_,text){if(cmd==='insertText'){this.activeElement.textContent=text;this.activeElement.emit('input',{isTrusted:true});}return true;}};
 const chrome={storage:{local:{get:async()=>({websiteTextOptInEnabled:true})},onChanged:{addListener:f=>change=f}},runtime:{onMessage:{addListener(){}},sendMessage:(message,reply)=>replies.push({message,reply})}};
 const root={nodeType:1,isConnected:true,closest:()=>null,matches:()=>false,querySelectorAll:document.querySelectorAll};
 vm.runInNewContext(source,{document,window:{top:{},getSelection:()=>({removeAllRanges(){},addRange(){}})},chrome,MutationObserver:class{constructor(fn){scan=fn;}observe(){}disconnect(){}},setTimeout(fn){fn();return 0;},clearTimeout(){},setInterval(){},InputEvent:class{},Event:class{}});
 return {boxes,controls,replies,document,makeBox,scan:()=>scan([{type:'childList',target:root,addedNodes:[root],removedNodes:[]}]),toggle:v=>change({websiteTextOptInEnabled:{newValue:v}},'local')};
}
test('separate comment and reply editors get independent controls; dynamic replacements are discovered',async()=>{
 const t=setup();await Promise.resolve();const a=t.makeBox(),b=t.makeBox();a.dispatchEvent=b.dispatchEvent=()=>{};t.scan();t.scan();assert.equal(t.controls.length,2);
 const pending=t.controls[1].children[0].click();assert.equal(t.replies[0].message.type,'make-draft');t.replies[0].reply({ok:true,text:{draft:'どれも素敵です！',mode:'本機草稿'}});await pending;
 assert.equal(a.textContent,'都好好聽啊');assert.equal(b.textContent,'どれも素敵です！');
 t.controls[0].remove();t.scan();assert.equal(t.controls.length,3);
});
test('late drafts cannot overwrite edits, removed editors, or disabled website translation',async()=>{
 const t=setup();await Promise.resolve();const box=t.makeBox();box.dispatchEvent=()=>{};t.scan();const button=t.controls[0].children[0];
 let p=button.click();box.textContent='我修改了原文';t.replies.at(-1).reply({ok:true,text:{draft:'wrong'}});await p;assert.equal(box.textContent,'我修改了原文');
 p=button.click();t.toggle(false);t.replies.at(-1).reply({ok:true,text:{draft:'wrong'}});await p;assert.equal(box.textContent,'我修改了原文');assert.equal(button.disabled,false);
});

test('a finished draft uses the native input without synthetic input or submission',async()=>{
 const t=setup();await Promise.resolve();const box=t.makeBox();
 const events=[];box.dispatchEvent=event=>{events.push(event.constructor.name);};
 t.scan();
 const pending=t.controls[0].children[0].click();
 t.replies.at(-1).reply({ok:true,text:{draft:'また明日ね！',mode:'本機草稿'}});
 await pending;
 assert.equal(box.textContent,'また明日ね！');
 assert.deepEqual(events,[]);
 // No keyboard event and no click on a send control may reach the page.
 const source=(fs.readFileSync(new URL('../translation-guards.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../content.js',import.meta.url),'utf8'));
 assert.equal(/KeyboardEvent|key:\s*['"]Enter/.test(source),false);
 const xSource=fs.readFileSync(new URL('../x-content.js',import.meta.url),'utf8');
 assert.equal(/KeyboardEvent|key:\s*['"]Enter/.test(xSource),false);
});

test('a rejected YouTube editor preserves its source and offers a copyable draft',async()=>{
 const t=setup();await Promise.resolve();const box=t.makeBox();box.dispatchEvent=()=>{};t.scan();
 t.document.execCommand=()=>false;
 const pending=t.controls[0].children[0].click();
 t.replies.at(-1).reply({ok:true,text:{draft:'今日は参加できません。',mode:'本機草稿'}});
 await pending;
 assert.equal(box.textContent,'都好好聽啊');
 assert.match(t.controls[0].children[1].textContent,/未接受/);
 assert.equal(t.controls[0].children[2].hidden,false);
 assert.equal(t.controls[0].children[2].value,'今日は参加できません。');
});

test('YouTube does not report an edit that lacks a native input transaction as applied',async()=>{
 const t=setup();await Promise.resolve();const box=t.makeBox();t.scan();
 t.document.execCommand=(_cmd,_show,text)=>{box.textContent=text;box.emit('input',{isTrusted:false});return true;};
 const pending=t.controls[0].children[0].click();
 t.replies.at(-1).reply({ok:true,text:{draft:'また明日ね！'}});
 await pending;
 assert.equal(t.controls[0].children[2].hidden,false);
 assert.match(t.controls[0].children[1].textContent,/未接受/);
});
