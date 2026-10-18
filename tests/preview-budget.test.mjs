import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreviewBudget} from '../preview-budget.mjs';
import {SpeechWindows} from '../streaming.mjs';

test('slow recognition receives actual idle time, including when a decode exceeds 2.5 seconds',()=>{
 const b=new PreviewBudget();assert.equal(b.remainingMs(0),0);
 b.complete(5000,5000);
 assert.ok(b.intervalMs()>5800);
 assert.ok(b.remainingMs(5000)>880);
 assert.equal(b.remainingMs(5900),0);
 assert.ok(b.remainingMs(5000,{previewDutyCycle:.4})>=7500);
 assert.equal(b.intervalMs({previewsPaused:true}),Infinity);
 assert.equal(b.remainingMs(90000,{previewsPaused:true}),Infinity);
});

test('brief inference keeps normal responsiveness, and invalid timings do not poison the budget',()=>{
 const b=new PreviewBudget();b.complete(10,100);
 assert.equal(b.remainingMs(100),0);assert.equal(b.intervalMs(),500);
 b.complete(NaN,200);b.complete(-1,200);
 assert.equal(b.intervalMs(),500);
 assert.equal(b.remainingMs(100,{previewFloorMs:900}),890);
});

test('pausing previews retains all final acoustic utterances and flushes the last one',()=>{
 const windows=new SpeechWindows();windows.sentenceMode=true;windows.maxSamples=320000;
 const jobs=[],frame=new Float32Array(512).fill(.1);
 for(let utterance=0;utterance<3;utterance++){
  for(let i=0;i<45;i++){const job=windows.push(frame,.9,Infinity);if(job)jobs.push(job);}
  for(let i=0;i<45;i++){const job=windows.push(frame,0,Infinity);if(job)jobs.push(job);}
 }
 for(let i=0;i<30;i++)windows.push(frame,.9,Infinity);
 jobs.push(windows.finish());
 assert.equal(jobs.length,4);assert.ok(jobs.every(j=>j.final&&j.audio.length>0));
 assert.deepEqual(jobs.map(j=>j.utteranceId),[1,2,3,4]);
});
