import * as taiwanChinese from '../taiwan-chinese.mjs';
import {NativeCueTimeline} from '../youtube-cue.mjs';
import * as cloudApi from '../cloud-api.mjs';
import * as youtubeGlossary from '../youtube-glossary.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
import {phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames} from '../translation-policy.mjs';
test('capture messages require active session and correct offscreen sender; stop clears subtitles',async()=>{
 let listener,session;const updates=[];
 let captionInput='auto',audioStarts=0;
 const chrome={storage:{local:{get:async()=>({subtitleSettings:{captionMode:'realtime',captionInput}}),set:async()=>{}}},tabs:{get:async()=>({url:'https://www.youtube.com/watch?v=test'}),sendMessage:async(id,m)=>updates.push(m),onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{if(m.type==='offscreen-start'){session=m.session;audioStarts++;}return{ok:true};}}};
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console,fetch:async()=>({ok:true,json:async()=>([[['大家好','こんにちは']]])})});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 await call({type:'subtitle-control',action:'start',tabId:7});
 assert.equal(updates.at(-1).running,true);
 assert.equal(updates.at(-1).item,null,'the page learns about capture before the first caption');
 listener({type:'speech-result',session,id:1,text:'こんにちは'},{url:'https://evil.example'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items.length,0);
 listener({type:'speech-result',session,id:1,text:'こんにちは'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 await new Promise(r=>setTimeout(r,20));
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].translated,'你好！');
 assert.equal((await call({type:'subtitles'},{tab:{id:8}})).text.items.length,0);
 const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=test'};
 const end=Date.now(),start=end-700;
 const cue={key:'test-cue-1',language:'ja',text:'今日はいい天気ですね',startAt:start,observedAt:end};
 await call({type:'native-caption',cue},sender);
 await new Promise(r=>setTimeout(r,0));
 listener({type:'speech-result',session,id:2,text:'古い音声結果',speechAt:start,audioEndAt:end},{url:'chrome-extension://test/offscreen.html'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'今日はいい天気ですね');
 await call({type:'native-caption',cue:{...cue,text:'別のタブ'}}, {...sender,tab:{id:8}});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'今日はいい天気ですね');
 await call({type:'native-caption',cue:null},sender);
 listener({type:'speech-result',session,id:3,text:'音声に戻りました',speechAt:end-300,audioEndAt:end+300},{url:'chrome-extension://test/offscreen.html'},()=>{});
 await new Promise(r=>setTimeout(r,0));
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'音声に戻りました');
 await call({type:'subtitle-control',action:'stop'});
 assert.equal(updates.at(-1).item,null);
 assert.equal(updates.at(-1).running,false);
 listener({type:'speech-result',session,id:2,text:'古い'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items.length,0);

 captionInput='youtube';
 assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 assert.equal(audioStarts,1,'CC-only mode does not start audio capture');
 assert.equal((await call({type:'native-caption',text:'今日はいい天気ですね'},sender)).ok,true);
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.captionInput,'youtube');

 captionInput='audio';
 assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 assert.equal(audioStarts,2);
 assert.equal((await call({type:'native-caption',text:'今日はいい天気ですね'},sender)).ok,false);
 await call({type:'subtitle-control',action:'stop'});
});

test('failed capture startup cleans up and exposes an actionable error, then can retry',async()=>{
 let listener,fail=true;const stopped=[];
 const chrome={storage:{local:{get:async()=>({subtitleSettings:{captionMode:'realtime'}}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=>{if(fail)throw Error('Extension has not been invoked (activeTab)');return 'stream';}},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{stopped.push(m.type);return{ok:true};}}};
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console});
 const call=m=>new Promise(resolve=>listener(m,{},resolve));
 const failure=await call({type:'subtitle-control',action:'start',tabId:7});
 assert.equal(failure.ok,false);assert.match(failure.error,/影片分頁/);
 const health=(await call({type:'health'})).text;
 assert.equal(health.running,false);assert.equal(health.captureTabId,null);assert.equal(health.lastError,failure.error);
 assert.equal(stopped.filter(t=>t==='offscreen-stop').length,1);
 fail=false;assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 assert.equal((await call({type:'health'})).text.lastError,'');
 await call({type:'subtitle-control',action:'stop'});
});

test('frequent chat cheers bypass both desktop inference and network translation',async()=>{
 let listener,inference=0,network=0;
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop'}),set:async()=>{}}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listener=f}}};
 class NativeClient{request(){inference++;throw Error('Unexpected inference');}}
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,NativeClient,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console,fetch:async()=>{network++;throw Error('Unexpected network');}});
 const replies=await Promise.all(Array.from({length:40},(_,i)=>new Promise(resolve=>listener({type:'translate',text:['ないすー','頑張れー！','ファイト','おしい'][i%4],direction:'ja-zh'}, {},resolve))));
 assert(replies.every(r=>r.ok));assert.deepEqual([...new Set(replies.map(r=>r.text))],['漂亮！','加油！','可惜了！']);
 const greetings=await Promise.all(['こんまほ','Konmaho','おつかの～','おつぺこ','こんこよ'].map(text=>new Promise(resolve=>listener({type:'translate',text,direction:'ja-zh'},{},resolve))));
 assert(greetings.every(reply=>reply.ok));assert.deepEqual(greetings.map(reply=>reply.text),['你好！','你好！','辛苦了～','辛苦了！','你好！']);
 assert.equal(inference,0);assert.equal(network,0);
});

test('live desktop captions keep ordinary chat on the selected local HY-MT path',async()=>{
 let listener;const nativeOps=[];let network=0;
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',subtitleSettings:{captionMode:'record'}}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 class NativeClient{request(op){nativeOps.push(op);return Promise.resolve(op==='translate'?{text:'這是一般聊天訊息'}:{model:'local'});}}
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const fetch=async()=>{network++;return {ok:true,json:async()=>[[['這是一般聊天訊息']]]};};
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,NativeClient,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console,fetch});
 const call=m=>new Promise(resolve=>listener(m,{},resolve));
 assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 const translated=await call({type:'translate',text:'これは普通のチャットメッセージです',direction:'ja-zh'});
 assert.equal(translated.text,'這是一般聊天訊息');
 assert.deepEqual(nativeOps,['init','translate']);
 assert.equal(network,0);
 await call({type:'subtitle-control',action:'stop'});
});

test('multi-line chat translates at most two chunks concurrently and rejoins them in order',async()=>{
 let listener;const pending=[];
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop'}),set:async()=>{}}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listener=f}}};
 class NativeClient{request(op,{text}){assert.equal(op,'translate');return new Promise(resolve=>pending.push({text,resolve}));}}
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,NativeClient,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console});
 const reply=new Promise(resolve=>listener({type:'translate',text:'最初の行です\n二番目の行です\n最後の行です',direction:'ja-zh'}, {},resolve));
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.deepEqual(pending.map(item=>item.text),['最初の行です','二番目の行です']);
 pending[0].resolve({text:'第一行。'});for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(pending[2].text,'最後の行です');
 pending[1].resolve({text:'第二行。'});pending[2].resolve({text:'最後一行。'});
 assert.equal((await reply).text,'第一行。\n第二行。\n最後一行。');
});

test('YouTube terms follow channel and direction and do not reuse outdated translations', async () => {
 let listener, owner;
 const changed = [];
 const channelA = 'UCabcdefghijklmnopqrstuv', channelB = 'UCABCDEFGHIJKLMNOPQRSTUV';
 const term=(source,target)=>({source,target});
 const settings = {
  speechMode:'desktop',
  [youtubeGlossary.youtubeGlossaryKey(undefined,'ja-zh')]:[term('カノ','小鹿'),term('配信','直播')],
  [youtubeGlossary.youtubeGlossaryKey(channelA,'ja-zh')]:[term('カノ','鹿乃')],
  [youtubeGlossary.youtubeGlossaryKey(channelB,'ja-zh')]:[term('カノ','佳乃')],
 };
 const native = [];
 class NativeClient {
  request(op, fields) {
   assert.equal(op, 'translate');
   native.push(fields);
   return Promise.resolve({text:fields.youtubeGlossary?.find(x=>x.source==='カノ')?.target + '今天有直播。'});
  }
 }
 const chrome = {
  storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,settings[key]]))},
    onChanged:{addListener:fn=>changed.push(fn)}},
  tabs:{onRemoved:{addListener(){}},sendMessage:async()=>({channelId:owner})},
  runtime:{onMessage:{addListener:fn=>listener=fn}},
 };
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{...cloudApi,...taiwanChinese,...youtubeGlossary,NativeClient,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,normalizeLivestreamChat,translateFormatted,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console});
 const translate=(url,text,direction='ja-zh')=>new Promise(resolve=>listener({type:'translate',text,direction},{url,tab:{id:1,url}},resolve));
 owner=channelA;
 assert.equal((await translate('https://www.youtube.com/watch?v=a','今日カノが配信します')).text,'鹿乃今天有直播。');
 owner=channelB;
 assert.equal((await translate('https://www.youtube.com/watch?v=b','今日カノが配信します')).text,'佳乃今天有直播。');
 assert.deepEqual(native.map(fields=>fields.youtubeGlossary.map(({target})=>target)),[['鹿乃','直播'],['佳乃','直播']]);
 const key=youtubeGlossary.youtubeGlossaryKey(channelB,'ja-zh');
 settings[key]=[term('カノ','嘉乃')];
 for (const fn of changed) fn({[key]:{newValue:settings[key]}},'local');
 assert.equal((await translate('https://www.youtube.com/watch?v=b','今日カノが配信します')).text,'嘉乃今天有直播。');
 assert.equal((await translate('https://www.youtube.com/watch?v=b','カノ')).text,'嘉乃');
 assert.equal(native.length,3,'an exact term does not occupy the model');
});
