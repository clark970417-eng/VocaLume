import {NativeCueTimeline} from '../youtube-cue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {protectNames,TranslationMemo} from '../translation-policy.mjs';
const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const body=src.slice(src.indexOf('async function localTranslation('),src.indexOf('async function makeDraft('));
function harness(){
 const calls=[];let configured={writingStyle:'general',writingQuality:'fast'};
 const translate=vm.runInNewContext(body+';localTranslation',{settings:async()=>configured,localTranslationMemo:new TranslationMemo(),protectNames,checkedTranslation:x=>x,taiwanProviderOutput:(_text,_direction,output)=>output,desktop:{request:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))}});
 return{calls,translate,set:value=>configured={...configured,...value}};
}
test('concurrent page/caption calls share local inference and repeat returns the complete result',async()=>{
 const h=harness(),a=h.translate('まだ終わっていません。','ja-zh'),b=h.translate('まだ終わっていません。','ja-zh');
 await new Promise(r=>setTimeout(r,0));assert.equal(h.calls.length,1);
 h.calls[0].resolve({text:'還沒有結束。'});assert.deepEqual(await Promise.all([a,b]),['還沒有結束。','還沒有結束。']);
 assert.equal(await h.translate('まだ終わっていません。','ja-zh'),'還沒有結束。');assert.equal(h.calls.length,1);
});
test('failed local inference retries; direction, tone and selected model never share a result',async()=>{
 const h=harness(),a=h.translate('今天無法參加。','zh-ja');
 const failure=assert.rejects(a,/worker exited/);await new Promise(r=>setTimeout(r,0));h.calls[0].reject(new Error('worker exited'));await failure;
 const b=h.translate('今天無法參加。','zh-ja');await new Promise(r=>setTimeout(r,0));h.calls[1].resolve({text:'今日は参加できません。'});await b;
 for(const change of [{writingStyle:'polite'},{writingQuality:'quality'}]){
  h.set(change);const request=h.translate('今天無法參加。','zh-ja');await new Promise(r=>setTimeout(r,0));h.calls.at(-1).resolve({text:'新設定的譯文'});await request;
 }
 assert.equal(h.calls.length,4);
 const c=h.translate('今天無法參加。','zh-en');await new Promise(r=>setTimeout(r,0));assert.equal(h.calls.length,5);h.calls.at(-1).resolve({text:'Cannot attend today.'});await c;
});
