import {NativeCueTimeline} from '../youtube-cue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as cloudApi from '../cloud-api.mjs';
import * as taiwanChinese from '../taiwan-chinese.mjs';
import * as policy from '../translation-policy.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';

function setup(speechMode='desktop') {
 const saved={speechMode,subtitleSettings:{captionMode:'record'},cloudTranslation:cloudApi.apiSettingsUpdate({}, {provider:'openai',model:'configured-model',apiKey:'test-key'})};
 let listener;const calls=[],native=[];const state={status:200};
 const chrome={permissions:{contains:async()=>true},storage:{local:{get:async()=>saved,set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 class NativeClient {async request(op,fields){native.push({op,...fields});return op==='translate'?{text:'本機譯文。'}:{model:'test'};}close(){}}
 const fetch=async(url,options)=>{
  if(new URL(url).hostname==='translate.googleapis.com'){
   calls.push({url,options});
   const query=new URL(url).searchParams;
   const output=state.outputs?.shift()??(query.get('tl')==='en'?'There will be no stream tomorrow.':
    query.get('q').includes('[NAME0]')?'明天不會直播。[NAME0]':'明天不會直播。');
   return {ok:true,json:async()=>[[[output]]]};
  }
  calls.push({url,options,body:JSON.parse(options.body)});
  if(state.waitForPublicFallback){
   await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  }
  const status=state.statuses?.shift()??state.status;
  const content=state.outputs?.shift()??(options.body.includes('明天我')?'明日は配信を休みます。':'明天不會直播。');
  return {ok:status===200,status,json:async()=>({choices:[{finish_reason:'stop',message:{content}}]})};
 };
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const internals=vm.runInNewContext(source+'\n({translateCaption});',{...cloudApi,...taiwanChinese,...policy,NativeClient,RecordingQueue,ResultGate,CueCursor,NativeCueTimeline,chrome,URLSearchParams,AbortSignal,AbortController,Date,console,setTimeout,clearTimeout,fetch});
 return {saved,calls,native,state,...internals,call:(message,sender={})=>new Promise(resolve=>listener(message,sender,resolve))};
}

test('explicit provider handles reading and writing even with desktop speech selected; no native/cloud fallback',async()=>{
 const t=setup();
 for(const priority of [false,true]){
  const result=await t.call({type:'translate',text:'明日は配信を休みます。',direction:'ja-zh',priority});
  assert.equal(result.ok,true,result.error);assert.equal(result.text,'明天不會直播。');
 }
 const draft=await t.call({type:'make-draft',text:'明天我不會直播。',direction:'zh-ja'});
 assert.equal(draft.ok,true,draft.error);assert.equal(draft.text.draft,'明日は配信を休みます。');assert.match(draft.text.mode,/OpenAI/);
 assert.equal(t.native.length,0);assert(t.calls.every(c=>c.url==='https://api.openai.com/v1/chat/completions'));
});

test('automatic browser page translation does not queue other language pairs behind the desktop model',async()=>{
 const t=setup('browser');
 delete t.saved.cloudTranslation;
 const result=await t.call({type:'translate',text:'明日は配信を休みます。',direction:'ja-en'});
 assert.equal(result.ok,true,result.error);
 assert.equal(result.text,'There will be no stream tomorrow.');
 assert.equal(t.calls.length,1);
 assert.equal(t.native.length,0);
 assert.equal(new URL(t.calls[0].url).searchParams.get('tl'),'en');
});

test('changing the chosen model invalidates reading and draft caches; API failure stays visible',async()=>{
 const t=setup();const message={type:'translate',text:'明日は配信を休みます。',direction:'ja-zh'};
 await t.call(message);await t.call(message);assert.equal(t.calls.length,1);
 t.saved.cloudTranslation=cloudApi.apiSettingsUpdate(t.saved,{provider:'openai',model:'another-model',apiKey:''});
 await t.call(message);assert.equal(t.calls.length,2);assert.equal(t.calls[1].body.model,'another-model');
 t.state.status=401;
 const bad=await t.call({...message,text:'来週の配信はお休みです。'});
 assert.equal(bad.ok,false);assert.match(bad.error,/401/);assert.equal(t.native.length,0);assert.equal(t.calls.length,3);
});

test('a temporary failure or invalid output is retried with the same selected provider',async()=>{
 for(const failure of [{statuses:[503,200]},{outputs:['wrong language','明天不會直播。']}]){
  const t=setup();Object.assign(t.state,failure);
  const message={type:'translate',text:'明日は配信を休みます。',direction:'ja-zh'};
  const result=await t.call(message);
  assert.equal(result.ok,true,result.error);assert.equal(result.text,'明天不會直播。');
  assert.equal(t.calls.length,2);
  assert(t.calls.every(call=>call.url==='https://api.openai.com/v1/chat/completions'));
  assert.equal(t.native.length,0);
 }
});

test('browser caption translation uses the selected provider but desktop speech keeps its local route',async()=>{
 const browser=setup('browser');assert.equal(await browser.translateCaption('明日は配信を休みます。',undefined,'ja-zh'),'明天不會直播。');assert.equal(browser.calls.length,1);
 const desktop=setup('desktop');assert.equal(await desktop.translateCaption('明日は配信を休みます。',undefined,'ja-zh'),'本機譯文。');assert.equal(desktop.calls.length,0);assert.equal(desktop.native.length,1);
});

test('a browser draft reuses a validated public caption without another network or native request',async()=>{
 const t=setup('browser');
 delete t.saved.cloudTranslation;
 const source='明日は配信を休みます。';
 assert.equal(await t.translateCaption(source,undefined,'ja-zh'),'明天不會直播。');
 const draft=await t.call({type:'make-draft',text:source,direction:'ja-zh'});
 assert.equal(draft.ok,true,draft.error);
 assert.equal(draft.text.draft,'明天不會直播。');
 assert.equal(t.calls.length,1);
 assert.equal(t.native.length,0);
 for(const call of t.calls){
  const url=new URL(call.url);
  assert.equal(url.hostname,'translate.googleapis.com');
  assert.equal(url.searchParams.get('sl'),'ja');
  assert.equal(url.searchParams.get('tl'),'zh-TW');
  assert.equal(url.searchParams.get('q'),source);
  assert(call.options.signal instanceof AbortSignal);
 }
});

test('the public cache does not bypass draft protection for standalone laughter',async()=>{
 const t=setup('browser');
 delete t.saved.cloudTranslation;
 const source='明日は配信を休みます。ww';
 await t.translateCaption(source,undefined,'ja-zh');
 const draft=await t.call({type:'make-draft',text:source,direction:'ja-zh'});
 assert.equal(draft.ok,true,draft.error);
 assert.equal(draft.text.draft,'明天不會直播。ww');
 assert.equal(t.calls.length,2);
 assert.equal(new URL(t.calls[0].url).searchParams.get('q'),source);
 assert.equal(new URL(t.calls[1].url).searchParams.get('q'),'明日は配信を休みます。[NAME0]');
});

test('an automatic Japanese draft can finish through public fallback while a legacy provider stalls',async()=>{
 const t=setup('browser');
 delete t.saved.cloudTranslation;
 t.saved.nvidiaKey='test-key';
 t.state.waitForPublicFallback=true;
 const draft=await t.call({type:'make-draft',text:'明日は配信を休みます。',direction:'ja-zh'});
 assert.equal(draft.ok,true,draft.error);
 assert.equal(draft.text.draft,'明天不會直播。');
 assert.match(draft.text.mode,/一般機翻/);
 assert.equal(t.calls.length,2);
 assert.equal(new URL(t.calls[0].url).hostname,'integrate.api.nvidia.com');
 assert.equal(new URL(t.calls[1].url).hostname,'translate.googleapis.com');
 assert.equal(t.calls[0].options.signal.aborted,true);
 assert.equal(t.native.length,0);
});

test('connection test accepts only the popup and uses fixed sample text without taking page input',async()=>{
 const t=setup();const message={type:'translation-provider-test',text:'private page content'};
 for(const sender of [{url:'https://page.example'},{url:'chrome-extension://test/popup.html',tab:{id:1}}]){
  const result=await t.call(message,sender);assert.equal(result.ok,false);assert.equal(t.calls.length,0);
 }
 const result=await t.call(message,{url:'chrome-extension://test/popup.html'});assert.equal(result.ok,true,result.error);
 assert.equal(t.calls.length,1);assert.equal(t.calls[0].body.messages[1].content,'今日は楽しい一日です。');
});

test('explicit and public Japanese drafts both normalize to Taiwan Traditional Chinese',async()=>{
 for(const provider of ['explicit','public']){
  const t=setup('browser');
  if(provider==='public')delete t.saved.cloudTranslation;
  t.state.outputs=['明天的广播晚上九点开始。'];
  const result=await t.call({type:'make-draft',text:'明日の配信は夜九時から始まります。',direction:'ja-zh'});
  assert.equal(result.ok,true,result.error);
  assert.equal(result.text.draft,'明天的直播晚上九點開始。');
  assert.equal(t.calls.length,1);
 }
});

test('public captions isolate reference-dependent results from an identical source without context',async()=>{
 const t=setup('browser');
 delete t.saved.cloudTranslation;
 t.state.outputs=['稍後廣播。','稍後廣播。'];
 const source='あとで配信します。';
 const reference='YouTubeのライブ配信を見てください。';
 assert.equal(await t.translateCaption(source,undefined,'ja-zh',t.saved,reference),'稍後直播。');
 assert.equal(await t.translateCaption(source,undefined,'ja-zh',t.saved),'稍後廣播。');
 assert.equal(await t.translateCaption(source,undefined,'ja-zh',t.saved,reference),'稍後直播。');
 assert.equal(t.calls.length,2);
 assert(t.calls.every(call=>new URL(call.url).searchParams.get('q')===source));
});

test('configured cloud receives a separate caption reference and only translates the current source',async()=>{
 const t=setup('browser');
 t.state.outputs=['稍後直播。'];
 const current='あとで配信します。',previousSource='YouTubeで生配信を始めます。';
 assert.equal(await t.translateCaption(current,undefined,'ja-zh',t.saved,previousSource),'稍後直播。');
 const messages=t.calls[0].body.messages;
 assert.match(messages[0].content,/Return only the translation of current/);
 assert.deepEqual(JSON.parse(messages[1].content),{previousSource,current});
});
