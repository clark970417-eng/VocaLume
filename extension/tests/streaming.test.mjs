import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Resampler,SpeechWindows,SpeechGain,Agreement,DecodeQueue,Measurements,trimOverlap} from '../streaming.mjs';
test('gain preserves digital silence and bounds low-volume amplification',()=>{
 const gain=new SpeechGain();assert.ok(gain.push(new Float32Array(512)).every(x=>x===0));
 let out;for(let i=0;i<30;i++)out=gain.push(new Float32Array(512).fill(.001));
 assert.ok(out[0]>.01&&out[0]<=.012001);
 assert.ok(gain.push(new Float32Array(512).fill(.9)).every(x=>Math.abs(x)<=1));
});
test('resampling across arbitrary block boundaries preserves clock and amplitude',()=>{
 for(const rate of [44100,48000]){
  const r=new Resampler(rate);let out=[];
  for(let i=0;i<rate;i+=2048)out.push(...r.push(new Float32Array(Math.min(2048,rate-i)).fill(.12)));
  assert.equal(out.length,16000);assert.ok(out.every(x=>Math.abs(x-.12)<1e-6));
 }
});
test('non-speech never emits, including loud non-speech; short speech ends promptly',()=>{
 const w=new SpeechWindows(),frame=new Float32Array(512).fill(.8);
 for(let i=0;i<1000;i++)assert.equal(w.push(frame,.01),null);
 const jobs=[];for(let i=0;i<15;i++){const j=w.push(frame,.9);if(j)jobs.push(j);}
 for(let i=0;i<20;i++){const j=w.push(frame,.01);if(j)jobs.push(j);}
 assert.ok(jobs.at(-1).final);assert.ok(jobs.at(-1).voicedSeconds>=.4);
});
test('clear speech gets a rolling hypothesis near 500ms while weak speech keeps the accuracy guard',()=>{
 const frame=new Float32Array(512).fill(.2),clear=new SpeechWindows();let first=null,frames=0;
 for(;frames<30&&!first;frames++)first=clear.push(frame,.9,.5);
 assert.ok(first);assert.equal(first.final,false);assert.ok(frames*512/16000<=.55);
 const weak=new SpeechWindows();let guarded=null,weakFrames=0;
 for(;weakFrames<30&&!guarded;weakFrames++)guarded=weak.push(frame,weakFrames<2?.9:.2,.5);
 assert.ok(guarded);assert.ok(weakFrames*512/16000>=.64);
});
test('continuous speech bounded with real overlapping samples and increasing times',()=>{
 const w=new SpeechWindows(),jobs=[];
 for(let i=0;i<600;i++){const j=w.push(new Float32Array(512).fill(i),.9);if(j)jobs.push(j);}
 assert.ok(jobs.every(j=>j.audio.length<=80512));
 const final=jobs.find(j=>j.final),next=jobs.find(j=>j.id===final.id+1);
 assert.ok(next.overlap);assert.ok(next.startSample<final.endSample);
 assert.equal(next.audio[0],final.audio[final.audio.length-16384]);
});
test('local agreement confirms prefixes and rejects out-of-order revisions',()=>{
 assert.equal(trimOverlap('ありがとうございます。','ありがとうございます、またね'),'またね');
 const a=new Agreement();
 assert.equal(a.accept('今日はみんな',{id:1,sampleCount:10}).stableText,'');
 assert.equal(a.accept('今日はみんな来てくれて',{id:1,sampleCount:20}).stableText,'今日はみんな');
 assert.equal(a.accept('古い',{id:1,sampleCount:10}),null);
 assert.equal(a.accept('今日はありがとう',{id:1,sampleCount:30,final:true}).provisional,false);
 assert.equal(a.accept('ありがとうまたね',{id:2,sampleCount:40,overlap:true}).text,'またね');
 assert.equal(a.accept('ありがとう',{id:3,sampleCount:50}).text,'ありがとう');
});
test('decode queue retains final followed by latest partial with bounded overload',()=>{
 const q=new DecodeQueue();q.push({id:1,final:true});q.push({id:2});q.push({id:2,revision:2});
 assert.equal(q.shift().id,1);assert.equal(q.shift().revision,2);
 for(let i=0;i<100;i++)q.push({id:i});assert.equal(q.jobs.length,2);assert.equal(q.dropped,98);
});
test('latency measurements are bounded and report distributions',()=>{
 const m=new Measurements();for(let i=0;i<200;i++)m.add('decode',i);
 assert.equal(m.summary().decode.count,120);assert.ok(m.summary().decode.p95>180);
});

test('sentence mode joins breathing pauses and waits longer after a hanging clause',()=>{
 const w=new SpeechWindows();w.sentenceMode=true;w.maxSamples=320000;
 const frame=new Float32Array(512);const output=[];
 for(let i=0;i<35;i++){const j=w.push(frame,.9);if(j)output.push(j);}
 for(let i=0;i<24;i++){const j=w.push(frame,0);if(j)output.push(j);}
 assert.equal(output.some(j=>j.final),false,'768 ms breathing pause keeps the utterance open');
 for(let i=0;i<20;i++)w.push(frame,.9);
 w.hint('そう思うけど。',w.utterance);
 for(let i=0;i<30;i++)assert.notEqual(w.push(frame,0)?.final,true);
 w.hint('そう思います。',w.utterance);
 assert.equal(w.push(frame,0)?.final,true);
});

test('short desktop cues finalize continuous speech within eight seconds without losing or repeating audio',()=>{
 const w=new SpeechWindows({shortCues:true}),finals=[];
 for(let i=0;i<1000;i++){
  const job=w.push(new Float32Array(512).fill(i+1),.9);
  if(job?.final)finals.push(job);
 }
 const tail=w.finish();if(tail)finals.push(tail);
 assert.ok(finals.length>=4);
 assert.ok(finals.every(j=>j.audio.length<=128000));
 assert.ok(finals.every(j=>!j.overlap));
 const audio=finals.flatMap(j=>Array.from(j.audio));
 assert.equal(audio.length,1000*512);
 for(let i=0;i<1000;i++)assert.equal(audio[i*512],i+1);
 assert.deepEqual(finals.map(j=>j.id),[1,2,3,4]);
});

test('short cues use a pause after four seconds but retain early breaths and unfinished clauses',()=>{
 const frame=new Float32Array(512),w=new SpeechWindows({shortCues:true});
 for(let i=0;i<35;i++)w.push(frame,.9);
 for(let i=0;i<24;i++)assert.notEqual(w.push(frame,0)?.final,true,'early breathing pause stays open');
 for(let i=0;i<80;i++)w.push(frame,.9);
 w.hint('そう思うけど。',w.utterance,w.id);
 for(let i=0;i<25;i++)assert.notEqual(w.push(frame,0)?.final,true,'hanging clause keeps its continuation');
 for(let i=0;i<20;i++)w.push(frame,.9);
 w.hint('そう思います。',w.utterance,w.id);
 let final;
 for(let i=0;i<16;i++){const job=w.push(frame,0);if(job?.final)final=job;}
 assert.ok(final,'complete clause publishes on a short pause instead of waiting 20 seconds');
 assert.ok(final.audio.length<128000);
});

test('a delayed recognition hint cannot split the next acoustic cue',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<250;i++)w.push(frame,.9);
 assert.equal(w.id,2);
 for(let i=0;i<35;i++)w.push(frame,.9);
 w.hint('終わりました。',w.utterance,1);
 for(let i=0;i<32;i++)assert.notEqual(w.push(frame,0)?.final,true);
});

test('a short phrase-boundary pause in sustained speech does not force a mid-word eight-second cut',()=>{
 const w=new SpeechWindows({shortCues:true}),frame=new Float32Array(512);
 for(let i=0;i<146;i++)w.push(frame,.9);
 const finals=[];
 for(let i=0;i<6;i++){const job=w.push(frame,0);if(job?.final)finals.push(job);}
 assert.equal(finals.length,1);
 assert.ok(finals[0].endSample/16000<5);
 assert.equal(finals[0].utteranceEnd,false,'a short cue boundary is not a claim that the whole utterance ended');
});
