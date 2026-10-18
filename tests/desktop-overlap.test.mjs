import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';
import * as policy from '../translation-policy.mjs';

test('pending desktop acknowledgements keep Japanese open for late Chinese and retain row order',async()=>{
 let listener,client;
 const segments=[];
 class NativeClient {
  constructor(){client=this;}
  async request(op,fields){
   if(op!=='decode')return {};
   segments.push(fields.segment);
   const text='日本語'+segments.length;
   this.onEvent({event:'source',segment:fields.segment,text});
   return {text,translated:'',pending:true};
  }
 }
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',subtitleSettings:{captionMode:'record'},recordedCaptions:[]}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{chrome,NativeClient,RecordingQueue,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 await call({type:'subtitle-control',action:'start',tabId:7});
 for(let i=1;i<=5;i++)await call({type:'desktop-request',op:'decode',segment:String(i),utterance:String(i),final:true,audio:'test',speechAt:Date.now()+i,audioEndAt:Date.now()},{url:'chrome-extension://test/offscreen.html'});
 let entries=(await call({type:'recording-export'})).text;
 assert.equal(entries.length,5);
 assert.equal(entries.filter(e=>e.state==='streaming').length,5);
 for(let i=0;i<5;i++)client.onEvent({event:'caption',segment:segments[i],result:{text:'日本語'+(i+1),translated:'中文第'+(i+1)+'句',final:true}});
 entries=(await call({type:'recording-export'})).text;
 assert.deepEqual(Array.from(entries,e=>e.translated),['中文第1句','中文第2句','中文第3句','中文第4句','中文第5句']);
 assert.equal(entries.filter(e=>e.state==='done').length,5);
 await call({type:'subtitle-control',action:'stop'});
});

test('single-pair mode waits for Chinese even when the next sentence has already arrived',async()=>{
 let listener,client;const segments=[],updates=[],timers=new Map();let sequence=0;
 class NativeClient {
  constructor(){client=this;}
  async request(op,fields){if(op!=='decode')return {};segments.push(fields.segment);this.onEvent({event:'source',segment:fields.segment,text:'日本語'+segments.length});return {text:'日本語'+segments.length,pending:true};}
 }
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',subtitleSettings:{captionMode:'realtime'}}),set:async()=>{}}},tabs:{sendMessage:async(_,m)=>updates.push(m),onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=>'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 vm.runInNewContext(fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{chrome,NativeClient,RecordingQueue,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date,setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id)});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 await call({type:'subtitle-control',action:'start',tabId:7});
 for(let i=0;i<2;i++)await call({type:'desktop-request',op:'decode',segment:String(i),utterance:String(i),audio:'test',speechAt:Date.now()+i,audioEndAt:Date.now(),final:true},{url:'chrome-extension://test/offscreen.html'});
 assert.equal(updates.at(-1).item.original,'日本語1');
 client.onEvent({event:'caption',segment:segments[1],result:{text:'日本語2',translated:'第二句中文',final:true}});
 assert.equal(updates.at(-1).item.original,'日本語1');
 client.onEvent({event:'caption',segment:segments[0],result:{text:'日本語1',translated:'第一句中文',final:true}});
 assert.equal(updates.at(-1).item.translated,'第一句中文');
 const [id,advance]=[...timers.entries()][0];timers.delete(id);advance();
 assert.equal(updates.at(-1).item.translated,'第二句中文');
 // Late corrections to the earlier segment cannot replace the new pair.
 client.onEvent({event:'caption',segment:segments[0],result:{text:'日本語1',translated:'舊句修正',correction:true}});
 assert.equal(updates.at(-1).item.translated,'第二句中文');
 await call({type:'subtitle-control',action:'stop'});assert.equal(timers.size,0);
});
