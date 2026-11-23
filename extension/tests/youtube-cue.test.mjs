import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {NativeCueTimeline} from '../youtube-cue.mjs';

test('source coverage requires a matching fresh track and does not erase audio during a gap',()=>{
 const cues=new NativeCueTimeline();
 const cue={key:'manual-ja:1',language:'ja-JP',text:'本日休業',startAt:1000,observedAt:1500};
 assert.equal(cues.observe({...cue,language:'zh-TW'},'ja',1500),null);
 assert.equal(cues.observe(cue,'ja',2200),null);
 assert.equal(cues.observe(cue,'ja',1500).text,'本日休業');
 assert.equal(cues.covers(1000,1480),true);
 assert.equal(cues.covers(800,1480),false,'the unmatched beginning must stay on audio');
 cues.observe(null,'ja',1700);
 assert.equal(cues.covers(1000,1480),true,'a late ASR final for a displayed cue still deduplicates');
 assert.equal(cues.covers(1480,1800),false,'handoff speech cannot be suppressed');
 cues.observe({...cue,observedAt:2100},'ja',2100);
 assert.equal(cues.covers(1500,2100),false,'a repeated cue cannot claim the gap');
 cues.reset();
 assert.equal(cues.covers(1000,1480),false);
});

test('the player bridge uses timed source cues and rejects translated and automatic tracks',()=>{
 const document=new EventTarget();
 let now=5000, selected={languageCode:'ja',vssId:'.ja'};
 class Clock extends Date{static now(){return now;}}
 const video={paused:false,seeking:false,currentTime:12,playbackRate:2,
  textTracks:[{mode:'showing',kind:'subtitles',language:'ja',id:'real-source',
    activeCues:[{id:'1',startTime:11,endTime:13,text:'<b>本日休業</b>'}]}]};
 const player={getVideoData:()=>({video_id:'test'}),getOption:()=>selected,classList:{contains:()=>false},
  querySelector(selector){return selector==='video'?video:{getAttribute:()=> 'true'};},
  querySelectorAll:()=>[{textContent:'本日休業'}]};
 document.querySelector=()=>player;
 vm.runInNewContext(readFileSync(new URL('../youtube-source.js',import.meta.url),'utf8'),
  {document,CustomEvent,Date:Clock});
 let received;
 document.addEventListener('vocalume-source-cue',event=>{received=JSON.parse(event.detail);});
 const read=()=>{document.dispatchEvent(new Event('vocalume-read-source-cue'));return received;};
 assert.equal(read().text,'本日休業');
 assert.equal(read().startAt,4500);
 selected={languageCode:'ja',vssId:'a.ja'};
 assert.equal(read(),null);
 selected={languageCode:'ja',vssId:'.ja',translationLanguage:{languageCode:'zh'}};
 assert.equal(read(),null);
 selected={languageCode:'ja',vssId:'.ja'};
 video.textTracks=[];
 const first=read();
 assert.equal(first.startAt,5000,'DOM captions never claim unseen media time');
 now+=250;video.currentTime+=.5;
 assert.equal(read().key,first.key,'the same visible cue extends its observed interval');
 assert.equal(read(),null,'a stalled video cannot extend coverage');
 video.seeking=true;
 assert.equal(read(),null);
});

test('the browser speech worker decodes the chosen language on its multilingual model',async()=>{
 const self={}, messages=[],decodes=[];
 const source=readFileSync(new URL('../speech-worker.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace("new URL('./ort/', import.meta.url).href","'runtime/'");
 const env={backends:{onnx:{wasm:{}}}};
 vm.runInNewContext(source,{self,env,postMessage:message=>messages.push(message),
  pipeline:async(_task,id)=>{
   assert.equal(id,'onnx-community/whisper-small');
   return async(_audio,options)=>{decodes.push(options.language);return {text:'안녕하세요'};};
  }});
 await self.onmessage({data:{type:'init',sourceLanguage:'ko'}});
 await self.onmessage({data:{type:'decode',id:1,audio:new Float32Array(16),stream:false}});
 assert.deepEqual(decodes,['ko']);
 assert.equal(messages.at(-1).text,'안녕하세요');
 await self.onmessage({data:{type:'init',sourceLanguage:'unknown'}});
 assert.equal(messages.at(-1).type,'error');
});

test('optional browser precision keeps the same model and qualifies or falls back cleanly',async()=>{
 const source=readFileSync(new URL('../speech-worker.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace("new URL('./ort/', import.meta.url).href","'runtime/'");
 for(const scenario of [
  {profile:'default',supported:true,dtype:'fp32',type:'ready'},
  {profile:'small-fp16',supported:false,dtype:'fp32',type:'ready',fallback:true},
  {profile:'small-fp16',supported:true,dtype:'fp16',type:'ready'},
  {profile:'small-fp16',supported:true,dtype:'fp16',type:'profile-fallback',fails:true}
 ]){
  const self={},messages=[],loads=[];
  const navigator={gpu:{requestAdapter:async()=>({features:new Set(scenario.supported?['shader-f16']:[])})}};
  vm.runInNewContext(source,{self,navigator,env:{backends:{onnx:{wasm:{}}}},postMessage:message=>messages.push(message),
   pipeline:async(_task,id,{dtype})=>{loads.push({id,dtype});if(scenario.fails)throw Error('session failed');}});
  await self.onmessage({data:{type:'init',sourceLanguage:'ja',profile:scenario.profile}});
  assert.deepEqual(loads,[{id:'onnx-community/whisper-small',dtype:scenario.dtype}]);
  assert.equal(messages.at(-1).type,scenario.type);
  if(scenario.type==='ready')assert.equal(messages.at(-1).fallback,Boolean(scenario.fallback));
 }
});
