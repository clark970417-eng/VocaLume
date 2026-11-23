import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const path = new URL('../background.js', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
const imports = [...source.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)];
const bindings = Object.fromEntries((await Promise.all(imports.map(async ([, names, specifier]) => {
 const module = await import(new URL(specifier, path));
 return names.split(',').map(name => name.trim()).map(name => [name,module[name]]);
}))).flat());

function captureFixture({desktop = false} = {}) {
 let listener, now = Date.now();
 const requests = [], updates = [], nativeOps = [];
 class Clock extends Date {
  static now() { return now; }
 }
 const chrome = {
  storage:{local:{get:async()=>({
   subtitleSettings:{captionMode:'realtime',captionInput:'youtube'},
   speechMode:desktop?'desktop':'browser'
  }),set:async()=>{}}},
  tabs:{
   get:async()=>({url:'https://www.youtube.com/watch?v=fixture'}),
   sendMessage:async(_,message)=>updates.push(structuredClone(message)),
   onRemoved:{addListener(){}}
  },
  runtime:{
   getURL:p=>'chrome-extension://test/'+p,
   onMessage:{addListener:f=>listener=f},
   sendMessage:async message=>{throw Error('Unexpected '+message.type);}
  }
 };
 class NativeClient {
  request(op,params){
   nativeOps.push({op,params});
   return Promise.resolve({text:'來看直播了，謝謝你。'});
  }
 }
 vm.runInNewContext(source.replace(/^import .*;\n/gm,''),{
  ...bindings,NativeClient,chrome,URLSearchParams,AbortSignal,AbortController,Date:Clock,
  setTimeout,clearTimeout,performance,console,
  fetch:(url,{signal})=>new Promise(resolve=>requests.push({
   source:new URL(url).searchParams.get('q'), signal,
   respond:text=>resolve({ok:true,json:async()=>[[[text]]]}),
  })),
 });
 const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=fixture'};
 const call=(message,from=sender)=>new Promise(resolve=>listener(message,from,resolve));
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const native=async (text,revision=updates.at(-1)?.nativeRevision,advance=0)=>{
  now+=advance;
  const result=await call({type:'native-caption',text,rolling:true,nativeRevision:revision});
  await settle();
  return result;
 };
 return {call,native,nativeOps,requests,updates,settle};
}

test('rolling capture sends one translation for a growing cue and discards old work after a timeline reset',async()=>{
 const fixture=captureFixture();
 const {call,native,requests,updates,settle}=fixture;
 assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 const initialRevision=updates.at(-1).nativeRevision;
 for(const text of ['配信に','配信に来て','配信に来てくれて'])await native(text,initialRevision,200);
 assert.equal(requests.length,0);
 await native('配信に来てくれてありがとう。',initialRevision,200);
 await native('配信に来てくれてありがとう。',initialRevision,700);
 assert.deepEqual(requests.map(request=>request.source),['配信に来てくれてありがとう。']);
 const old=requests[0];

 const revision=initialRevision+1;
 assert.equal((await call({type:'subtitle-reset',nativeRevision:revision})).ok,true);
 assert.equal(updates.at(-1).item,null);
 assert.equal(updates.at(-1).nativeRevision,revision);
 assert.equal((await native('前の動画です。',initialRevision)).ok,false);
 await native('新しい動画です。',revision);
 assert.equal(requests.length,2);
 requests[1].respond('這是新影片。');
 await settle();
 old.respond('這是上一部影片。');
 await settle();
 const current=(await call({type:'subtitles'})).text.items[0];
 assert.equal(current.translated,'這是新影片。');
 assert.equal(updates.some(update=>update.nativeRevision===revision&&update.item?.translated==='這是上一部影片。'),false);
 await call({type:'subtitle-control',action:'stop'});
});

test('desktop YouTube CC translates text without starting or stopping a desktop audio session',async()=>{
 const {call,native,nativeOps}=captureFixture({desktop:true});
 assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 assert.deepEqual(nativeOps,[]);
 await native('配信に来てくれてありがとう。');
 assert.equal((await call({type:'subtitles'})).text.items[0].translated,'來看直播了，謝謝你。');
 await call({type:'subtitle-control',action:'stop'});
 assert.deepEqual(nativeOps.map(call=>call.op),['translate']);
 assert.equal(nativeOps[0].params.liveCaption,true);
});
