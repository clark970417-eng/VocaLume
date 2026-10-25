import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeSentence,unfinishedSentence} from '../sentence-boundary.mjs';
import {SpeechWindows} from '../streaming.mjs';

test('Japanese and Chinese negations and hanging particles cannot be completed by ASR punctuation',()=>{
 for(const text of ['魚が。','魚が逃げて。','今日は行くと。','そう思うけど。','如果。','這個不是。','我還沒。']){
  assert.equal(unfinishedSentence(text),true,text);
  assert.equal(completeSentence(text),false,text);
 }
 for(const [text,lang] of [['今日は行きません。','ja'],['魚が逃げてしまいました。','ja'],['明日は行かないと思います。','ja'],['今日は行けなかった。','ja'],['不是右邊，是左邊。','zh'],['我今天沒有去。','zh']])assert.equal(completeSentence(text,lang),true,text);
 assert.equal(completeSentence('明日行こうと思って。','ja'),false);
 assert.equal(completeSentence('今日は行きます','ja'),false);
});

test('a current complete sentence ends after a shorter pause; stale punctuation cannot end new speech',()=>{
 const audio=new Float32Array(512).fill(.1);
 const ready=new SpeechWindows({shortCues:true});
 for(let i=0;i<50;i++)ready.push(audio,.9,Infinity);
 ready.hint('今日は遊びません。',ready.utterance,ready.id,ready.clock);
 let end;
 for(let i=0;i<15;i++)end=ready.push(new Float32Array(512),0,Infinity)||end;
 assert.equal(end?.final,true);assert.equal(end?.utteranceEnd,true);
 const stale=new SpeechWindows({shortCues:true});
 for(let i=0;i<35;i++)stale.push(audio,.9,Infinity);
 const old=stale.clock;
 for(let i=0;i<15;i++)stale.push(audio,.9,Infinity);
 stale.hint('今日は遊びます。',stale.utterance,stale.id,old);
 for(let i=0;i<25;i++)assert.equal(stale.push(new Float32Array(512),0,Infinity),null);
});

test('a pause after a Japanese te-form preserves the continuation despite the four-second soft boundary',()=>{
 const windows=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<130;i++)windows.push(frame,.9,Infinity);
 windows.hint('魚が逃げて。',windows.utterance);
 for(let i=0;i<20;i++)assert.equal(windows.push(frame,0,Infinity),null);
 for(let i=0;i<15;i++)windows.push(frame,.9,Infinity);
 windows.hint('魚が逃げてしまいました。',windows.utterance);
 let final;for(let i=0;i<15;i++)final=windows.push(frame,0,Infinity)||final;
 assert.equal(final?.final,true);
});
