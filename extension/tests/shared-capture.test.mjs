import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as cloud from '../cloud-api.mjs';
import * as policy from '../translation-policy.mjs';
import * as taiwan from '../taiwan-chinese.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';
import {NativeCueTimeline} from '../youtube-cue.mjs';

function setup(speechMode, respond, lifecycle={}) {
 let listener,client,tabCaptures=0,requests=0;
 let created=0,closed=0,nativeClosed=0,exists=lifecycle.existing!==false;
 const timers=new Map();
 const captureTimer=(callback,delay)=>{
  if(!lifecycle.enabled||![10000,15000].includes(delay))return queueMicrotask(callback);
  const timer=Symbol();timers.set(timer,{delay,callback});return timer;
 };
 const operations=[],offscreen=[],updates=[];
 const chrome={storage:{local:{get:async()=>({speechMode,subtitleSettings:{captionMode:'realtime'}}),set:async()=>{}}},
  tabs:{onRemoved:{addListener(){}},sendMessage:async(_tab,event)=>updates.push(event)},
  offscreen:{hasDocument:async()=>exists,
   ...(lifecycle.enabled&&{createDocument:async()=>{exists=true;created++;},closeDocument:async()=>{exists=false;closed++;}})},
  tabCapture:{getMediaStreamId:async()=>{tabCaptures++;if(lifecycle.failTabCapture)throw Error('Tab capture failed');return 'stream';}},
  runtime:{getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:f=>listener=f},
   sendMessage:async message=>{offscreen.push(message);return {ok:true};}}};
 class NativeClient{
  constructor(){client=this;}
  async request(op,fields){if(lifecycle.enabled)this.port={};operations.push({op,fields});return respond(this,op,fields);}
  close(){this.port=null;nativeClosed++;}
 }
 const source=readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{...cloud,...policy,...taiwan,NativeClient,RecordingQueue,ResultGate,CueCursor,NativeCueTimeline,
  chrome,AbortSignal,AbortController,URLSearchParams,Date,console,setTimeout:captureTimer,clearTimeout:timer=>timers.delete(timer),
  fetch:async()=>{requests++;return {ok:true,json:async()=>[[['明天的廣播將於晚上9點開始。']]]};}});
 return {
  operations,offscreen,updates,get created(){return created;},get closed(){return closed;},get nativeClosed(){return nativeClosed;},
  async runTimers(delay){for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.callback();}await Promise.resolve();await Promise.resolve();},
  get client(){return client;},get tabCaptures(){return tabCaptures;},get requests(){return requests;},
  call:(message,sender={})=>new Promise(resolve=>listener(message,sender,resolve))
 };
}

function finalCue(subscription, timestamp, translated, revision=0) {
 return {event:'shared-caption',subscription,result:{sourceLanguage:'ja',targetLanguage:'zh',
  text:'明日の配信',translated,timestamp,revision,correction:revision>0}};
}

for(const mode of ['desktop','browser']){
 test(mode+' reuses the matching App session, without a second audio or translation request',async()=>{
  let selected;
  const state=setup(mode,(client,op,fields)=>{
   if(op==='release-capture')return {stopped:true};
   if(op==='translate')return {text:'明天的廣播將於晚上9點開始。'};
   selected=fields.subscription;
   client.onEvent(finalCue(selected,100,'明天的直播'));
   return {role:'shared',subscription:selected};
  });
  const start=await state.call({type:'subtitle-control',action:'start',tabId:7});
  assert.equal(start.text.role,'shared');
  assert.equal(state.tabCaptures,0);
  assert.equal(state.offscreen.length,0);
  assert.equal(state.requests,0);
  assert.equal(state.updates.at(-1).item.translated,'明天的直播');
  state.client.onEvent(finalCue(selected,100,'明天的直播修正',2));
  state.client.onEvent(finalCue(selected,100,'過期修正',1));
  state.client.onEvent(finalCue('old-session',101,'不能顯示'));
  assert.equal(state.updates.at(-1).item.translated,'明天的直播修正');
  const draft=await state.call({type:'make-draft',direction:'ja-zh',text:'明日の配信は午後九時に始まります。'});
  assert.equal(draft.ok,true,draft.error);
  assert.equal(draft.text.draft,'明天的直播將於晚上9點開始。');
  assert.equal(state.requests,mode==='desktop'?0:1);
  await state.call({type:'subtitle-control',action:'stop'});
  assert.deepEqual(state.operations.map(item=>item.op),
   mode==='browser'?['browser-claim','release-capture']:['init','translate','release-capture']);
  assert.equal(state.updates.at(-1).item,null);
 });
}

test('startup waits for the App claim, and an incompatible source never starts browser audio',async()=>{
 let attempt=0;
 const state=setup('browser',(_client,op)=>{
  if(op==='release-capture')return {stopped:true};
  return ++attempt===1?{role:'starting'}:{role:'incompatible',reason:'audio-source'};
 });
 const result=await state.call({type:'subtitle-control',action:'start',tabId:7});
 assert.equal(result.ok,false);
 assert.match(result.error,/系統音訊/u);
 assert.equal(state.tabCaptures,0);
 assert.equal(state.offscreen.length,0);
 assert.deepEqual(state.operations.map(item=>item.op),['browser-claim','browser-claim','release-capture']);
});

test('unavailable native host preserves standalone browser capture',async()=>{
 const state=setup('browser',()=>{throw Error('Specified native messaging host not found.');});
 assert.equal((await state.call({type:'subtitle-control',action:'start',tabId:7})).text.running,true);
 assert.equal(state.tabCaptures,1);
 assert.equal(state.offscreen[0].type,'offscreen-start');
 assert.equal(state.offscreen[0].mode,'browser');
 await state.call({type:'subtitle-control',action:'stop'});
 assert.deepEqual(state.operations.map(item=>item.op),['browser-claim']);
 assert.equal(state.offscreen[1].type,'offscreen-stop');
});

test('closing the App mirror clears the tab without stopping App or starting a fallback decoder',async()=>{
 let selected;
 const state=setup('browser',(_client,_op,fields)=>{selected=fields.subscription;return {role:'shared',subscription:selected};});
 await state.call({type:'subtitle-control',action:'start',tabId:7});
 state.client.onEvent({event:'shared-ended',subscription:selected});
 assert.equal((await state.call({type:'health'})).text.running,false);
 assert.equal(state.updates.at(-1).item,null);
 assert.equal(state.tabCaptures,0);
 assert.equal(state.offscreen.length,0);
 assert.deepEqual(state.operations.map(item=>item.op),['browser-claim']);
});

test('a rapid restart retains offscreen and native resources, then an idle stop releases them',async()=>{
 const t=setup('browser',(_client,op)=>op==='browser-claim'?{role:'browser',coordinated:true}:{}, {enabled:true,existing:false});
 const start=()=>t.call({type:'subtitle-control',action:'start',tabId:7});
 const stop=()=>t.call({type:'subtitle-control',action:'stop'});
 assert.equal((await start()).text.running,true);
 assert.equal(t.created,1);
 await stop();assert.equal(t.closed,0);assert.equal(t.nativeClosed,0);
 assert.equal((await start()).text.running,true);
 await t.runTimers(10000);await t.runTimers(15000);
 assert.equal(t.created,1);assert.equal(t.closed,0);assert.equal(t.nativeClosed,0);
 await stop();
 await t.runTimers(10000);await t.runTimers(15000);
 assert.equal(t.closed,1);assert.equal(t.nativeClosed,1);
});

test('a restarted worker or a failed tab capture reclaims the orphaned offscreen document',async()=>{
 const orphan=setup('browser',()=>({}),{enabled:true});
 await Promise.resolve();await orphan.runTimers(10000);assert.equal(orphan.closed,1);
 const failed=setup('browser',()=>({role:'browser'}),{enabled:true,existing:false,failTabCapture:true});
 assert.equal((await failed.call({type:'subtitle-control',action:'start',tabId:7})).ok,false);
 assert.equal(failed.created,1);
 await failed.runTimers(10000);await failed.runTimers(15000);
 assert.equal(failed.closed,1);assert.equal(failed.nativeClosed,1);
});
