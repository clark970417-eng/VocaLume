import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../translation-policy.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';

function setup(languageSettings={}, translateResult=fields=>fields.text.includes('楽しかった')?'今天很開心。':fields.text) {
 let listener;const requests=[];
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',languageSettings,subtitleSettings:{captionMode:'record'}}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 class NativeClient {
  async request(op,fields){requests.push({op,...fields});return op==='translate'?{text:translateResult(fields)}:{model:'test'};}
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

test('all other targets use their requested pair and preserve multi-line literals through production routing',async()=>{
 const outputs={en:'There will be no stream tomorrow.',ko:'내일은 방송을 쉬겠습니다.',es:'Mañana no habrá transmisión.',fr:'Il n’y aura pas de diffusion demain.',de:'Morgen gibt es keinen Stream.',pt:'Amanhã não haverá transmissão.',it:'Domani non ci sarà una diretta.',ru:'Завтра трансляции не будет.',th:'พรุ่งนี้ไม่มีการถ่ายทอดสด',vi:'Ngày mai sẽ không phát trực tiếp.',id:'Besok tidak ada siaran langsung.',ar:'لن يكون هناك بث غداً.'};
 const t=setup({speechSource:'zh',speechTarget:'ja'},fields=>outputs[fields.direction.split('-')[1]]);
 assert.equal((await t.call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 for(const [to,expected] of Object.entries(outputs)){
  const direction=`ja-${to}`,result=await t.call({type:'translate',text:'明日は配信を休みます。\n🎉\n٧/١٤\nhttps://example.invalid/live',direction});
  assert.equal(result.ok,true,result.error);assert.equal(result.text,expected+'🎉٧/١٤https://example.invalid/live',direction);
  assert.equal(t.requests.filter(r=>r.op==='translate'&&r.direction===direction).length,1);
 }
 await t.call({type:'subtitle-control',action:'stop'});
});

test('invalid non-Japanese output is not cached as success and a later retry can recover',async()=>{
 for(const [direction,bad,good] of [['ja-ko','English instead of Korean','내일은 방송을 쉬겠습니다.'],['ko-en','🎉','There will be no stream tomorrow.'],['ja-ar','', 'لن يكون هناك بث غداً.']]){
  let value=bad;const t=setup({},()=>value);
  const message={type:'translate',direction,text:direction.startsWith('ko')?'내일은 방송을 쉬겠습니다.':'明日は配信を休みます。'};
  const failed=await t.call(message);assert.equal(failed.ok,false,direction);
  value=good;const recovered=await t.call(message);assert.equal(recovered.ok,true,recovered.error);assert.equal(recovered.text,good);
  assert.equal(t.requests.filter(r=>r.op==='translate').length,2,'invalid response is not memoized');
 }
});
