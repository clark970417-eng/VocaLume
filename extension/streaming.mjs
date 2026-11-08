import {completeSpokenClause,unfinishedSentence} from './sentence-boundary.mjs';
/** Owns captured PCM and returns an independent, chronological copy only on delivery. */
export class PcmRing {
 constructor(capacity){this.data=new Float32Array(capacity);this.clear();}
 get capacity(){return this.data.length;}
 clear(){this.end=0;this.length=0;}
 push(samples){
  const values=samples.length>this.capacity?samples.subarray(samples.length-this.capacity):samples;
  const first=Math.min(values.length,this.capacity-this.end);
  if(first===values.length)this.data.set(values,this.end);
  else{this.data.set(values.subarray(0,first),this.end);this.data.set(values.subarray(first),0);}
  this.end=(this.end+values.length)%this.capacity;this.length=Math.min(this.capacity,this.length+values.length);
 }
 snapshot(count=this.length){
  count=Math.min(count,this.length);
  const start=(this.end-count+this.capacity)%this.capacity,first=Math.min(count,this.capacity-start);
  const out=new Float32Array(count);
  out.set(this.data.subarray(start,start+first));
  if(first<count)out.set(this.data.subarray(0,count-first),first);
  return out;
 }
}

// PCM sample positions, rather than timer cadence, define every audio boundary.
export class Resampler {
 constructor(rate){this.ratio=rate/16000;this.reset();}
 reset(){this.sum=0;this.weight=0;this.remaining=this.ratio;}
 push(input){
  const out=new Float32Array(Math.ceil(input.length/this.ratio)+1);
  let offset=0;
  for(const value of input){
   let left=1;
   while(left>1e-8){
    const take=Math.min(left,this.remaining);
    this.sum+=value*take;this.weight+=take;this.remaining-=take;left-=take;
    if(this.remaining<1e-8){out[offset++]=this.sum/this.weight;this.sum=0;this.weight=0;this.remaining=this.ratio;}
   }
  }
  return out.subarray(0,offset);
 }
}
export class SpeechGain {
 constructor(){this.gain=1;}
 push(frame,out=new Float32Array(frame.length)){
  let energy=0;for(const x of frame)energy+=x*x;
  const rms=Math.sqrt(energy/frame.length);
  const target=rms>1e-5?Math.max(1,Math.min(12,.06/rms)):1;
  this.gain+=.2*(target-this.gain);
  for(let i=0;i<frame.length;i++)out[i]=Math.max(-1,Math.min(1,frame[i]*this.gain));
  return out;
 }
}
export class SpeechWindows {
 constructor({shortCues=false}={}){
  this.shortCues=shortCues;this.sentenceMode=shortCues;this.maxSamples=shortCues?128000:80000;this.overlapFrames=shortCues?0:32;
  this.pcm=new PcmRing(this.maxSamples+(shortCues?64000:0)+512);
  this.frameLengths=new Uint32Array(32);
  this.reset();
 }
 reset(){this.clearAudio();this.clock=0;this.onset=0;this.silent=0;this.voiced=0;this.confident=0;this.active=false;this.id=0;this.lastEmission=0;this.lastPreviewVoiced=undefined;this.overlap=false;this.utterance=0;this.sentenceComplete=false;this.sentenceUnfinished=false;this.lastSpeechSample=0;this.hintSample=0;}
 clearAudio(){this.pcm.clear();this.frameIndex=0;this.frameCount=0;this.samples=0;}
 recentSamples(count){
  let samples=0;
  for(let i=1;i<=Math.min(count,this.frameCount);i++)samples+=this.frameLengths[(this.frameIndex+this.frameLengths.length-i)%this.frameLengths.length];
  return samples;
 }
 appendFrame(frame){
  const required=this.samples+frame.length;
  if(required>this.pcm.capacity){
   const previous=this.pcm.snapshot(this.samples);
   this.pcm=new PcmRing(Math.max(required,this.maxSamples+(this.shortCues?64000:0)+frame.length));
   this.pcm.push(previous);
  }
  this.pcm.push(frame);
  this.frameLengths[this.frameIndex]=frame.length;
  this.frameIndex=(this.frameIndex+1)%this.frameLengths.length;
  this.frameCount=Math.min(this.frameCount+1,this.frameLengths.length);
 }
 hint(text,utteranceId,id=this.id,sampleCount=this.clock){
  if(!this.active||utteranceId!==this.utterance||id!==this.id)return;
  // A recognizer's period alone is weak evidence. Japanese hanging particles
  // and Chinese continuation words need the longer pause even with punctuation.
  const value=String(text||'').trim();
  if(!Number.isFinite(sampleCount)||sampleCount<this.start||sampleCount>this.clock||sampleCount<this.hintSample)return;
  this.hintSample=sampleCount;
  this.sentenceUnfinished=unfinishedSentence(value)||/(?:から|とか|でも)[、，,。.!！?？\s]*$/u.test(value);
  this.sentenceComplete=completeSpokenClause(value)&&!this.sentenceUnfinished;
 }
 finish(){
  if(!this.active)return null;
  this.active=false;
  const job=this.voiced>=3584?this.job(true,true):null;
  this.clearAudio();return job;
 }
 job(final,utteranceEnd){
  const audio=this.pcm.snapshot(this.samples);
  return {id:this.id,utteranceId:this.utterance,utteranceEnd,audio,final,overlap:this.overlap,voicedSeconds:this.voiced/16000,speechSeconds:this.confident/16000,sampleCount:this.clock,startSample:this.start,endSample:this.clock,speechStartSample:this.speechStart,lastSpeechSample:this.lastSpeechSample};
 }
 push(frame,probability,interval=.65,previewAllowed=true){
  const n=frame.length;this.clock+=n;
  this.appendFrame(frame);
  const speech=probability>=(this.active?.15:.30);
  this.onset=speech?this.onset+n:0;
  if(!this.active){
   if(this.onset<1024)return null;
   this.active=true;this.id++;this.utterance++;this.frameCount=Math.min(this.frameCount,16);this.samples=this.recentSamples(16);
   this.start=this.clock-this.samples;this.speechStart=this.clock-this.onset;this.voiced=this.onset;this.confident=this.onset;this.silent=0;
   // The first cadence starts at acoustic onset, not after VAD activation.
   // Otherwise the two-frame onset confirmation is added to the configured
   // preview delay and a nominal 500 ms preview arrives closer to 600 ms.
   this.lastEmission=this.speechStart;this.lastPreviewVoiced=undefined;this.overlap=false;this.sentenceComplete=false;this.sentenceUnfinished=false;this.lastSpeechSample=this.clock;this.hintSample=0;
   return null;
  }
  this.samples+=n;
  if(speech){this.voiced+=n;this.lastSpeechSample=this.clock;}
  // Speech at the onset probability, which the companion's outro check was calibrated on.
  if(probability>=.30)this.confident+=n;
  this.silent=speech?0:this.silent+n;
  const freshHint=this.hintSample>=this.lastSpeechSample;
  const pause=this.sentenceMode?(this.sentenceComplete&&freshHint?7680:22400):9216;
  // A hanging ending only describes audio the recognizer has actually heard.
  // Do not let an old "今日は一緒に" veto a later breath after the speaker has
  // already said its predicate. Protect up to 384ms of newly voiced tail while
  // allowing older evidence to expire; elapsed silence alone never expires it.
  const hangingHere=this.sentenceUnfinished&&this.hintSample>=this.lastSpeechSample-6144;
  // A clear breath can close a useful fragment without a grammatical full stop.
  // Keep very short phrases together; use 320ms after 2.5s of context, or the
  // existing 160ms boundary after 4s. Capture/preview cadence is unchanged.
  const cuePause=this.shortCues&&!hangingHere&&(
   this.samples>=40000&&this.silent>=5120||this.samples>=64000&&this.silent>=2560);
  // Keep the existing 8s ceiling and bounded 12s protection for a recently
  // recognized hanging clause. No future audio or extra inference is awaited.
  const recentUnfinished=this.shortCues&&this.sentenceUnfinished&&this.hintSample>=this.clock-24000;
  const ceiling=recentUnfinished?this.maxSamples+64000:this.maxSamples;
  const ended=this.silent>=pause, cut=this.samples>=ceiling||cuePause;
  const speechSamples=this.clock-this.speechStart;
  // Clear speech can produce a useful rolling hypothesis at 500 ms. Keep the
  // former 650 ms guard for weak/noisy input, where an early Whisper pass tends
  // to create unstable one-token captions.
  const confidentRatio=this.voiced?this.confident/this.voiced:0;
  const previewReady=speechSamples>=(confidentRatio>=.75?8000:10400);
  let job=null;
  const newSpeech=this.lastPreviewVoiced===undefined||this.voiced-this.lastPreviewVoiced>=1536;
  if(this.voiced>=3200 && ((ended||cut) || (previewAllowed&&newSpeech&&previewReady&&this.clock-this.lastEmission>=interval*16000))){
   job=this.job(ended||cut,ended);
   this.lastEmission=this.clock;
   if(!job.final)this.lastPreviewVoiced=this.voiced;
  }
  if(ended){this.active=false;this.clearAudio();this.onset=0;}
  else if(cut){
   const keep=this.overlapFrames??32;this.frameCount=Math.min(this.frameCount,keep);this.samples=this.recentSamples(keep);
   this.start=this.clock-this.samples;this.id++;this.overlap=keep>0;this.voiced=0;this.confident=0;this.speechStart=this.clock;
   this.lastPreviewVoiced=undefined;
   this.sentenceComplete=false;this.sentenceUnfinished=false;
  }
  return job;
 }
}
export function commonPrefix(a,b){let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return a.slice(0,i);}
export function trimOverlap(previous,text){
 const normalized=previous.replace(/[\p{P}\s]/gu,'');
 let prefix='';const ends=[];
 for(let i=0;i<text.length;i++){if(!/[\p{P}\s]/u.test(text[i])){prefix+=text[i];ends.push(i+1);}}
 for(let n=Math.min(normalized.length,prefix.length,80);n>=3;n--)if(normalized.endsWith(prefix.slice(0,n)))return text.slice(ends[n-1]).replace(/^[、。\s]+/u,'');
 return text;
}
export class Agreement {
 constructor(){this.reset();}
 reset(){this.id=null;this.previous='';this.stable='';this.tail='';this.prefixTail='';this.lastSample=-1;}
 preview(text,job){
  if(this.id!==null&&job.id<this.id)return null;
  const tail=this.id===job.id?this.prefixTail:job.overlap?this.tail:'';
  text=tail?trimOverlap(tail,text):text;
  if(!text)return null;
  if(this.id===job.id&&text.length<=this.previous.length)return null;
  if(this.id===job.id){
   const boundary=Math.max(this.previous.lastIndexOf('。'),this.previous.lastIndexOf('！'),this.previous.lastIndexOf('？'));
   if(boundary>=0){
    const prefix=this.previous.slice(0,boundary+1).replace(/[\p{P}\s]/gu,'');
    let normalized='',end=0;
    for(let i=0;i<text.length&&normalized.length<prefix.length;i++){if(!/[\p{P}\s]/u.test(text[i]))normalized+=text[i];end=i+1;}
    if(normalized===prefix)text=text.slice(end).replace(/^[\p{P}\s]+/u,'');
    // A changed earlier sentence cannot be aligned safely during generation.
    // Wait for the completed decode instead of redisplaying old sentences.
    else return null;
   }
  }
  if(!text)return null;
  return {text,stableText:'',provisional:true,revision:job.sampleCount};
 }
 accept(text,job){
  if(this.id!==null&&job.id<this.id)return null;
  if(this.id!==job.id){this.prefixTail=job.overlap?this.tail:'';this.id=job.id;this.previous='';this.stable='';this.lastSample=-1;}
  if(job.sampleCount<=this.lastSample)return null;
  this.lastSample=job.sampleCount;
  text=this.prefixTail?trimOverlap(this.prefixTail,text):text;
  if(!text)return null;
  const common=commonPrefix(this.previous,text);
  // Only advertise a prefix as stable if the current hypothesis still supports it.
  this.stable=job.final?text:common;
  this.previous=text;this.tail=text.slice(-100);
  return {text,stableText:this.stable,provisional:!job.final,revision:job.sampleCount};
 }
}
export class DecodeQueue {
 constructor({retainFinals=false,retainInterim=false}={}){this.jobs=[];this.dropped=0;this.retainFinals=retainFinals;this.retainInterim=retainInterim;}
 clear(){this.jobs=[];}
 push(job){
  if(this.retainFinals){
   if(!job.final){
    if(!this.retainInterim||this.jobs.some(x=>x.id>=job.id&&(x.final||x.sampleCount>=job.sampleCount)))return;
    this.jobs=this.jobs.filter(x=>x.final);
    this.jobs.push(job);return;
   }
   const finals=this.jobs.filter(x=>x.final&&x.id!==job.id);
   // Keep the identity of every accepted cue. Merging audio under the newest
   // ID leaves earlier visible drafts without a matching final translation.
   if(finals.length>=60)throw new Error('辨識積壓超過上限，已停止收音以保護已記錄內容');
   const preview=this.jobs.find(x=>!x.final&&x.id>job.id);
   this.jobs=[...finals,job,...(preview?[preview]:[])];return;
  }
  this.jobs=this.jobs.filter(x=>x.id!==job.id);
  this.jobs.push(job);
  // Keep one final and the newest revision. Never accumulate an unbounded delay.
  while(!this.retainFinals&&this.jobs.length>2){this.jobs.shift();this.dropped++;}
 }
 retry(job){
  // A completed job was already accepted before later queued work, so retry it
  // at the front without coalescing or changing its order. A rolling preview,
  // however, must pass through push() so a newer preview/final can supersede it.
  if(this.retainFinals&&job.final){this.jobs=[job,...this.jobs.filter(x=>x.id!==job.id)];return;}
  this.push(job);
 }
 shift(){return this.jobs.shift();}
 takeFresh(now,epoch){
  while(this.jobs.length){const job=this.shift();if(job.epoch===epoch&&(this.retainFinals||now-job.audioEndAt<=4000))return job;this.dropped++;}
  return null;
 }
}
export class Measurements {
 constructor(){this.values={};}
 add(name,value){if(!Number.isFinite(value))return;const a=this.values[name]??=[];a.push(Math.max(0,value));if(a.length>120)a.shift();}
 summary(){return Object.fromEntries(Object.entries(this.values).map(([name,a])=>{const s=[...a].sort((a,b)=>a-b);return[name,{count:s.length,p50:Math.round(s[Math.floor((s.length-1)*.5)]),p95:Math.round(s[Math.floor((s.length-1)*.95)])}];}));}
}
