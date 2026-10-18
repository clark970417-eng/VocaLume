import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../x-content.js',import.meta.url),'utf8');
const body={};const locate=vm.runInNewContext(source.slice(source.indexOf('  function composerToolbar'),source.indexOf('  function addComposer'))+'\ncomposerToolbar',{document:{body}});
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
 const context={document,window,button,composers:new WeakMap(),read:box=>box.textContent,websiteTextEnabled:true,textEpoch:0,langLabel:x=>x,languageSettings:{typeSource:'zh',typeTarget:'ja'},direction:()=> 'zh-ja',matchesLanguage:t=>/[\u3400-\u9fff]/.test(t),InputEvent:class{},Event:class{},message:m=>{requests.push(m);return new Promise(resolve=>finish=resolve);}};
 const add=vm.runInNewContext(source.slice(source.indexOf('  function composerToolbar'),source.indexOf('  function addPost'))+'\naddComposer',context);add(box);
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
