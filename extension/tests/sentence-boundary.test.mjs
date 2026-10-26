import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeSentence,completeSpokenClause,unfinishedSentence} from '../sentence-boundary.mjs';
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

test('a recent unfinished clause can cross eight seconds, with a strict twelve-second bound',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<245;i++)w.push(frame,.9,Infinity);
 w.hint('魚が逃げて。',w.utterance);
 for(let i=0;i<12;i++)assert.equal(w.push(frame,.9,Infinity),null);
 w.hint('魚が逃げてしまいました。',w.utterance);
 let final;for(let i=0;i<15;i++)final=w.push(frame,0,Infinity)||final;
 assert.ok(final?.final);assert.ok(final.audio.length>128000);assert.ok(final.audio.length<=192000);
 const bounded=new SpeechWindows({shortCues:true});let cut;
 for(let i=0;i<380&&!cut;i++){
  if(bounded.active)bounded.hint('それで。',bounded.utterance);
  const job=bounded.push(frame,.9,Infinity);if(job?.final)cut=job;
 }
 assert.equal(cut?.audio.length,192000);
});

test('an old unfinished hint cannot add delay to unrelated fresh audio',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);let cut;
 for(let i=0;i<250;i++){
  if(i===100)w.hint('魚が逃げて。',w.utterance);
  cut=w.push(frame,.9,Infinity)||cut;
 }
 assert.equal(cut?.final,true);assert.equal(cut.audio.length,128000);
});

test('a complete spoken Japanese ending can use an acoustic pause without ASR punctuation',()=>{
 for(const text of ['今日は行きません','魚が逃げてしまいました','ありがとうございます']){
  assert.equal(completeSpokenClause(text),true,text);
 }
 for(const text of ['今日は一緒に','魚が逃げて','明日行こうと思って','今日は行くと','I will not','我還沒'])assert.equal(completeSpokenClause(text),false,text);
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<50;i++)w.push(frame,.9,Infinity);
 w.hint('今日は遊びません',w.utterance,w.id,w.clock);
 let final;for(let i=0;i<15;i++)final=w.push(frame,0,Infinity)||final;
 assert.equal(final?.utteranceEnd,true);
 assert.equal(final?.endSample,65*512);
});

test('an old hanging hypothesis cannot block a later breath after new speech',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<90;i++)w.push(frame,.9,Infinity);
 w.hint('今日は一緒に',w.utterance,w.id,w.clock);
 for(let i=0;i<60;i++)w.push(frame,.9,Infinity);
 let final;for(let i=0;i<5;i++)final=w.push(frame,0,Infinity)||final;
 assert.equal(final?.final,true);
 assert.equal(final?.utteranceEnd,false,'breath closes a caption, not necessarily the thought');
 assert.equal(final?.endSample,155*512);
});

test('a fresh hanging clause stays protected while silence alone does not age its evidence',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<135;i++)w.push(frame,.9,Infinity);
 w.hint('魚が逃げて',w.utterance,w.id,w.clock);
 for(let i=0;i<35;i++)assert.equal(w.push(frame,0,Infinity),null);
});

test('a substantial breath closes a short useful fragment with lossless continuation',()=>{
 const w=new SpeechWindows({shortCues:true}),jobs=[],input=[];
 const feed=(count,p)=>{for(let i=0;i<count;i++){const frame=new Float32Array(512).fill(input.length+1);input.push(frame);const job=w.push(frame,p,Infinity);if(job?.final)jobs.push(job);}};
 feed(85,.9);feed(10,0);feed(45,.9);
 const tail=w.finish();if(tail)jobs.push(tail);
 assert.equal(jobs.length,2);
 assert.equal(jobs[0].endSample,95*512);
 assert.equal(jobs[1].startSample,jobs[0].endSample);
 assert.equal(jobs[0].utteranceId,jobs[1].utteranceId);
 assert.equal(jobs[1].id,jobs[0].id+1);
 assert.deepEqual(jobs.flatMap(j=>Array.from(j.audio)),input.flatMap(f=>Array.from(f)));
});

test('older feedback cannot replace a newer hanging-clause safeguard',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<135;i++)w.push(frame,.9,Infinity);
 w.hint('今日は行くと',w.utterance,w.id,w.clock);
 w.hint('今日は行きます',w.utterance,w.id,w.clock-512);
 assert.equal(w.sentenceUnfinished,true);
 for(let i=0;i<20;i++)assert.equal(w.push(frame,0,Infinity),null);
});
