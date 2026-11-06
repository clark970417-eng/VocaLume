import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {shouldTranslateReading} from '../translation-guards.mjs';
const source=fs.readFileSync(new URL('../x-content.js',import.meta.url),'utf8');
const localize=source.slice(source.indexOf('  const pageUi'),source.indexOf('  const langLabel'));
const body={};const locate=vm.runInNewContext(source.slice(source.indexOf('  function composerToolbar'),source.indexOf('  function addComposer'))+'\ncomposerToolbar',{document:{body}});
test('X offers reading translation for a Japanese sentence but not Chinese containing a kana name',()=>{
 const controls=[];
 const node=text=>({textContent:text,insertAdjacentElement(_,control){control.isConnected=true;controls.push(control);}});
 const document={createElement:()=>({children:[],classList:{add(){}},setAttribute(){},append(...children){this.children.push(...children);},remove(){this.isConnected=false;}})};
 const add=vm.runInNewContext(localize+source.slice(source.indexOf('  function addPost'),source.indexOf('  function installPanel'))+'\naddPost',{
  document,posts:new WeakMap(),read:node=>node.textContent,matchesReadLanguage:text=>shouldTranslateReading(text,'ja','zh'),
  languageSettings:{readSource:'ja',readTarget:'zh'},langLabel:x=>x,button:()=>({classList:{add(){}},setAttribute(){}})
 });
 for(const text of ['這已經是中文','我喜歡まほろちゃん','まほろ'])add(node(text));
 assert.equal(controls.length,0);
 const japanese=node('まほろの歌が好きです。');add(japanese);assert.equal(controls.length,1);
 japanese.textContent='我很喜歡まほろ的歌';add(japanese);assert.equal(controls[0].isConnected,false);
});
test('X reply control mounts outside clipped editor next to its own toolbar',()=>{
 const toolbar={};const outer={parentElement:body,querySelectorAll:()=>[{}],querySelector:()=>toolbar};
 const clipped={parentElement:outer,querySelectorAll:()=>[{}],querySelector:()=>null};
 assert.equal(locate({parentElement:clipped}),toolbar);
});
test('X composer does not steal a toolbar from another open reply editor',()=>{
 const unrelated={parentElement:body,querySelectorAll:()=>[{},{}],querySelector:()=>({})};
 assert.equal(locate({parentElement:unrelated}),null);
});

test('Tab translates the focused X composer, preserves edits and never posts',async()=>{
 let keydown,finish;const requests=[];
 const box={isConnected:true,textContent:'今天不能待到結束。',addEventListener:(name,fn)=>{if(name==='keydown')keydown=fn;},focus(){},dispatchEvent(){},closest(){return null;}};
 const host={parentElement:null,querySelectorAll:()=>[box],querySelector:()=>null,insertAdjacentElement(_,controls){controls.isConnected=true;}};box.parentElement={parentElement:host,querySelectorAll:()=>[box],querySelector:()=>null};
 const document={body:{},createRange:()=>({selectNodeContents(){}}),execCommand:(_,__,value)=>{box.textContent=value;return true;},createElement:tag=>({tagName:tag,hidden:false,children:[],classList:{add(){}},setAttribute(){},append(...children){this.children.push(...children);}})};
 const window={getSelection:()=>({removeAllRanges(){},addRange(){}})};
 const button=(label,action)=>({textContent:label,disabled:false,hidden:false,setAttribute(){},classList:{add(){}},click:action});
 const context={document,window,button,composers:new WeakMap(),read:box=>box.textContent,websiteTextOptInEnabled:true,textEpoch:0,langLabel:x=>x,languageSettings:{typeSource:'zh',typeTarget:'ja'},direction:()=> 'zh-ja',matchesLanguage:t=>/[\u3400-\u9fff]/.test(t),InputEvent:class{},Event:class{},message:m=>{requests.push(m);return new Promise(resolve=>finish=resolve);}};
 const add=vm.runInNewContext(localize+source.slice(source.indexOf('  function composerToolbar'),source.indexOf('  function addPost'))+'\naddComposer',context);add(box);
 let prevented=0;
 keydown({key:'Tab',preventDefault(){prevented++;},stopPropagation(){}});
 assert.equal(prevented,1);assert.equal(requests[0].type,'make-draft');
 finish({draft:'今日は最後までいられません。',mode:'本機草稿'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(box.textContent,'今日は最後までいられません。');assert.equal(requests.length,1);
 box.textContent='我改了原文';keydown({key:'Tab',preventDefault(){},stopPropagation(){}});box.textContent='還有新內容';finish({draft:'古い翻訳',mode:'本機草稿'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(box.textContent,'還有新內容');
 keydown({key:'Tab',isComposing:true,preventDefault(){throw Error('IME must pass through');}});
});


test('X capture shortcut reaches only its own mounted editor before competing handlers',()=>{
 const box={}, child={}, unrelated={};let count=0,received;
 const composers=new WeakMap([[box,{isConnected:true,translateKey:event=>{count++;received=event;}}]]);
 const start=source.indexOf('  function dispatchComposerKey');
 const end=source.indexOf('  // Run before document/editor',start);
 const dispatch=vm.runInNewContext(source.slice(start,end)+'\ndispatchComposerKey',{composers});
 const event={composedPath:()=>[child,box]};dispatch(event);
 assert.equal(count,1);assert.equal(received,event);
 dispatch({composedPath:()=>[unrelated]});assert.equal(count,1);
 composers.get(box).isConnected=false;dispatch(event);assert.equal(count,1);
});

test('X Spaces controls stay outside native positioning and are reused on repeated scans',()=>{
 let adds=0, hostWrites=0;
 const make=()=>({isConnected:false,children:[],setAttribute(){},append(...nodes){this.children.push(...nodes);},remove(){this.isConnected=false;}});
 const host={classList:{add(){hostWrites++;},remove(){hostWrites++;}},append(){hostWrites++;}};
 const body={append(node){node.isConnected=true;adds++;}};
 const document={body,createElement:make};
 const code=source.slice(source.indexOf('  function installPanel'),source.indexOf('  async function poll'));
 // Use the real mounting/synchronization logic with a stable native dialog.
 const api=vm.runInNewContext('let panel,captionBox,listening=false;\n'+localize+code+'\nfindSpaceHost=()=>host; ({syncSpacePanel,getPanel:()=>panel})',{
  document,host,button:make,window:{JtlCaptionWindow:class{}},message(){throw Error('must not start a model');}
 });
 api.syncSpacePanel();const original=api.getPanel();
 for(let i=0;i<20;i++)api.syncSpacePanel();
 assert.equal(api.getPanel(),original);
 assert.equal(adds,2); // One caption surface and one control panel.
 assert.equal(hostWrites,0);
 const css=fs.readFileSync(new URL('../x-content.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\.jtl-space-host\s*\{/);
 assert.match(css,/\.jtl-x-live\s*\{\s*position:\s*fixed/);
});

function pollingFixture() {
 let reply, reject, renders=0, writes=0;
 const tracked=()=>{let text='';return {get textContent(){return text;},set textContent(value){writes++;text=value;}};};
 const toggle=tracked(),status=tracked();
 const panel={isConnected:true,querySelector:s=>s==='button'?toggle:status};
 const captionBox={controller:{render(){renders++;}}};
 const api=vm.runInNewContext('let polling=false,listening=false,subtitleSignature; let panel=initialPanel,captionBox=initialCaption;\n'+localize+source.slice(source.indexOf('  async function poll()'),source.indexOf('  function scan()'))+'\n({poll,close(){panel.isConnected=false;panel=null;captionBox=null;},replace(value){panel=value;},getListening:()=>listening})',{
  initialPanel:panel,initialCaption:captionBox,Date,JSON,
  message:()=>new Promise((resolve,fail)=>{reply=resolve;reject=fail;})
 });
 return {api,panel,respond:data=>reply(data),reject:error=>reject(error),counts:()=>({renders,writes})};
}
test('X discards subtitle results after closing or replacing the Space',async()=>{
 for(const fail of [false,true]){
  const t=pollingFixture();const pending=t.api.poll();t.api.close();
  if(fail)t.reject(Error('disconnected'));else t.respond({running:true,items:[]});
  await pending;assert.deepEqual(t.counts(),{renders:0,writes:0});
 }
 const t=pollingFixture();const pending=t.api.poll();
 t.api.replace({isConnected:true,querySelector(){throw Error('stale response reached new panel');}});
 t.respond({running:true,items:[]});await pending;
 assert.equal(t.api.getListening(),false);
});
test('X does not rewrite unchanged subtitle status or rerender the same rows',async()=>{
 const t=pollingFixture();
 for(let i=0;i<3;i++){const pending=t.api.poll();t.respond({running:false,items:[]});await pending;}
 assert.deepEqual(t.counts(),{renders:1,writes:2});
});
