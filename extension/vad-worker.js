import {ort} from './whisper-runtime.js';
import {Resampler,SpeechWindows,SpeechGain} from './streaming.mjs?v=4.5.1';
ort.env.wasm.wasmPaths=new URL('./ort/',import.meta.url).href;
ort.env.wasm.numThreads=1;
const context=new Float32Array(64),frame=new Float32Array(512),contextual=new Float32Array(576);
let session,state,sr,input,resampler,windows,gain,filled=0,epoch=0,origin=0;
function reset(m){
 context.fill(0);epoch=m.epoch;origin=m.origin;filled=0;resampler=new Resampler(m.rate);
 if(windows?.shortCues===!!m.desktop)windows.reset();
 else windows=new SpeechWindows({shortCues:!!m.desktop});
 windows.sentenceMode=true;gain=new SpeechGain();
 state?.dispose();state=new ort.Tensor('float32',new Float32Array(256),[2,1,128]);
}
function publish(job){
 if(!job)return;
 job.epoch=epoch;job.speechAt=origin+job.speechStartSample/16;job.audioEndAt=origin+job.endSample/16;job.speechEndAt=origin+job.lastSpeechSample/16;
 postMessage({type:'segment',job},[job.audio.buffer]);
}
async function processFrame(interval,allowPreview){
 gain.push(frame,frame);
 contextual.set(context);contextual.set(frame,64);context.set(frame.subarray(448));
 const out=await session.run({input,state,sr});
 state.dispose();state=out.stateN;
 const probability=Number(out.output.data[0]);out.output.dispose();
 publish(windows.push(frame,probability,interval,allowPreview));
 return probability;
}
async function processFrames(samples,interval,allowPreview){
 let probability=0;
 for(let offset=0;offset<samples.length;){
  const count=Math.min(frame.length-filled,samples.length-offset);
  frame.set(samples.subarray(offset,offset+count),filled);
  offset+=count;filled+=count;
  if(filled===frame.length){probability=await processFrame(interval,allowPreview);filled=0;}
 }
 return probability;
}
let chain=Promise.resolve();
self.onmessage=({data:m})=>{
 chain=chain.then(async()=>{
  if(m.type==='init'){
   session=await ort.InferenceSession.create(new URL('./vendor/silero/silero_vad_v5.onnx',import.meta.url).href,{executionProviders:['wasm']});
   sr=new ort.Tensor('int64',BigInt64Array.from([16000n]),[]);input=new ort.Tensor('float32',contextual,[1,576]);
   reset(m);postMessage({type:'ready',epoch});return;
  }
  if(m.type==='reset'){reset(m);return;}
  if(m.type==='transcript'&&m.epoch===epoch){windows.hint(m.text,m.utteranceId,m.id,m.sampleCount);return;}
  if(m.type==='flush'&&m.epoch===epoch){
   if(filled){frame.fill(0,filled);await processFrame(.65,false);filled=0;}
   publish(windows.finish());postMessage({type:'flushed',epoch});return;
  }
  if(m.type!=='audio'||m.epoch!==epoch){if(m.type==='audio')postMessage({type:'processed',epoch,probability:0,vadMs:0});return;}
  const began=performance.now();
  let probability=0;
  const batch=m.batch||[m.audio];
  for(const audio of batch){
   probability=await processFrames(resampler.push(audio),m.interval,m.allowPreview!==false);
  }
  postMessage({type:'processed',epoch,probability,vadMs:(performance.now()-began)/batch.length});
 }).catch(error=>postMessage({type:'error',error:error.message,epoch}));
};
