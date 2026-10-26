import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../translation-policy.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';

function setup(languageSettings={}) {
 let listener;const requests=[];
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',languageSettings,subtitleSettings:{captionMode:'record'}}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 class NativeClient {
  async request(op,fields){requests.push({op,...fields});return op==='translate'?{text:fields.text.includes('楽しかった')?'今天很開心。':fields.text}:{model:'test'};}
  close(){}
 }
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{...policy,NativeClient,RecordingQueue,ResultGate,CueCursor,chrome,URLSearchParams,AbortSignal,AbortController,Date,console,setTimeout,clearTimeout,fetch:async()=>{throw Error('offline');}});
 return {requests,call:message=>new Promise(resolve=>listener(message,{},resolve))};
}

test('emoji, numbers and a URL on separate chat lines cannot fail an otherwise valid translation',async()=>{
 const t=setup();
 const result=await t.call({type:'translate',text:'今日は楽しかったです。\n🎉🎉\n7/14\nhttps://example.invalid/live/123',direction:'ja-zh'});
 assert.equal(result.ok,true,result.error);
 assert.equal(result.text,'今天很開心。🎉🎉7/14https://example.invalid/live/123');
 assert.deepEqual(t.requests.filter(r=>r.op==='translate').map(r=>r.text),['今日は楽しかったです。']);
});

test('page reading keeps its requested language pair while captions use a different pair',async()=>{
 const t=setup({speechSource:'ko',speechTarget:'en'});
 assert.equal((await t.call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 const result=await t.call({type:'translate',text:'今日は楽しかったです。',direction:'ja-zh'});
 assert.equal(result.ok,true,result.error);
 assert.equal(t.requests.find(r=>r.op==='translate').direction,'ja-zh');
 await t.call({type:'subtitle-control',action:'stop'});
});
