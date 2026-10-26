import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as cloudApi from '../cloud-api.mjs';
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
  calls.push({url,options,body:JSON.parse(options.body)});
  return {ok:state.status===200,status:state.status,json:async()=>({choices:[{finish_reason:'stop',message:{content:options.body.includes('明天我')?'明日は配信を休みます。':'明天不會直播。'}}]})};
 };
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const internals=vm.runInNewContext(source+'\n({translateCaption});',{...cloudApi,...policy,NativeClient,RecordingQueue,ResultGate,CueCursor,chrome,URLSearchParams,AbortSignal,AbortController,Date,console,setTimeout,clearTimeout,fetch});
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

test('changing the chosen model invalidates reading and draft caches; API failure stays visible',async()=>{
 const t=setup();const message={type:'translate',text:'明日は配信を休みます。',direction:'ja-zh'};
 await t.call(message);await t.call(message);assert.equal(t.calls.length,1);
 t.saved.cloudTranslation=cloudApi.apiSettingsUpdate(t.saved,{provider:'openai',model:'another-model',apiKey:''});
 await t.call(message);assert.equal(t.calls.length,2);assert.equal(t.calls[1].body.model,'another-model');
 t.state.status=401;
 const bad=await t.call({...message,text:'来週の配信はお休みです。'});
 assert.equal(bad.ok,false);assert.match(bad.error,/401/);assert.equal(t.native.length,0);assert.equal(t.calls.length,3);
});

test('browser caption translation uses the selected provider but desktop speech keeps its local route',async()=>{
 const browser=setup('browser');assert.equal(await browser.translateCaption('明日は配信を休みます。',undefined,'ja-zh'),'明天不會直播。');assert.equal(browser.calls.length,1);
 const desktop=setup('desktop');assert.equal(await desktop.translateCaption('明日は配信を休みます。',undefined,'ja-zh'),'本機譯文。');assert.equal(desktop.calls.length,0);assert.equal(desktop.native.length,1);
});

test('connection test accepts only the popup and uses fixed sample text without taking page input',async()=>{
 const t=setup();const message={type:'translation-provider-test',text:'private page content'};
 for(const sender of [{url:'https://page.example'},{url:'chrome-extension://test/popup.html',tab:{id:1}}]){
  const result=await t.call(message,sender);assert.equal(result.ok,false);assert.equal(t.calls.length,0);
 }
 const result=await t.call(message,{url:'chrome-extension://test/popup.html'});assert.equal(result.ok,true,result.error);
 assert.equal(t.calls.length,1);assert.equal(t.calls[0].body.messages[1].content,'今日は楽しい一日です。');
});
