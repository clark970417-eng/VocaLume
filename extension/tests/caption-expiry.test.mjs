import {NativeCueTimeline} from '../youtube-cue.mjs';
import * as cloudApi from '../cloud-api.mjs';
import * as taiwanChinese from '../taiwan-chinese.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
import * as policy from '../translation-policy.mjs';
test('identical ASR does not extend expiry; later utterance can repeat; native end clears pending results',async()=>{
 let listener,session,now=Date.now(),finish;const updates=[];
 class Clock extends Date{static now(){return now;}}
 const chrome={storage:{local:{set:async()=>{},get:async()=>({subtitleSettings:{holdSeconds:3,captionMode:'realtime'}})}},tabs:{sendMessage:async(id,m)=>updates.push(m),onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{if(m.type==='offscreen-start')session=m.session;return{ok:true};}}};
 const fetch=()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>[[['今天的天氣']]]}));
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,RecordingQueue,chrome,ResultGate,CueCursor,NativeCueTimeline,...policy,URLSearchParams,AbortSignal,AbortController,Date:Clock,console,fetch});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));const flush=()=>new Promise(r=>setTimeout(r,0));
 const say=id=>listener({type:'speech-result',session,id,text:'こんにちは'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 const current=async()=> (await call({type:'subtitles'},{tab:{id:7}})).text.items;
 await call({type:'subtitle-control',action:'start',tabId:7});say(1);await flush();
 const first=(await current())[0];assert.equal(first.expiresAt,now/1000+3);
 now+=2000;say(1);await flush();assert.equal((await current())[0].expiresAt,first.expiresAt);
 now+=1100;assert.equal((await current()).length,0,'silence clears after three seconds');
 say(2);await flush();assert.equal((await current()).length,1,'a new utterance may repeat the same word');
 const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=test'};
 await call({type:'native-caption',cue:{key:'cue-1',language:'ja',text:'今日の天気ですね',startAt:now-200,observedAt:now}},sender);await flush();
 await call({type:'native-caption',cue:null},sender);finish();await flush();
 assert.equal((await current()).some(item=>item.source==='native'),false,'late translation cannot resurrect ended native cue');
});

test('browser token drafts do not compete with finals, including an identical promoted cue',async()=>{
 let listener,session;const requests=[],updates=[];
 const chrome={
  storage:{local:{set:async()=>{},get:async()=>({subtitleSettings:{captionMode:'realtime'}})}},
  tabs:{sendMessage:async(_id,message)=>updates.push(message),onRemoved:{addListener(){}}},
  offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},
  runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},
   sendMessage:async m=>{if(m.type==='offscreen-start')session=m.session;return{ok:true};}},
 };
 const fetch=async(_url,{signal})=>new Promise((resolve,reject)=>{
  requests.push({signal,complete:()=>resolve({ok:true,json:async()=>[[['今天下雨了']]]})});
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{...cloudApi,...taiwanChinese,RecordingQueue,chrome,ResultGate,CueCursor,NativeCueTimeline,
  ...policy,URLSearchParams,AbortSignal,AbortController,Date,console,fetch});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 const cue=(id,text,extra)=>call({type:'speech-result',session,id,text,audioEndAt:Date.now()-10,
  speechEndAt:Date.now()-500,...extra},{url:'chrome-extension://test/offscreen.html'});
 await call({type:'subtitle-control',action:'start',tabId:7});
 const draft='今日は雨が降っていました。';
 await cue(1,draft,{partial:true,provisional:true});await tick();
 assert.equal(requests.length,0);
 assert.equal(updates.at(-1).item.original,draft);
 await cue(1,draft,{final:true});await tick();
 assert.equal(requests.length,1);
 requests[0].complete();await tick();
 const health=(await call({type:'health'})).text.diagnostics;
 assert.equal(health.browserFinals.received,1);
 assert.equal(health.browserFinals.translated,1);
 assert.equal(health.deliveryMetrics.speechEndToTranslationMs.count,1);
 assert.equal(updates.at(-1).item.translated,'今天下雨了');

 for(const [id,text] of [[2,'明日の東京は晴れるでしょう。'],[3,'今夜は雪が降るでしょう。'],[4,'今日は夕方に雨が降っていました。']]){
  await cue(id,text,{provisional:true,stableText:text});await tick();
 }
 assert.equal(requests.length,3,'the third preview is waiting');
 await cue(4,'今日は夕方に雨が降っていました。',{final:true});await tick();
 assert.equal(requests[1].signal.aborted,true);
 assert.equal(requests[2].signal.aborted,true);
 assert.equal(requests.length,4,'the promoted final bypasses the waiting preview');
 requests[3].complete();await tick();
 assert.equal(updates.at(-1).item.speechId,4);
 await call({type:'subtitle-control',action:'stop'});
});
