import { pipeline, env } from './whisper-runtime.js';
import {CaptionTokenStream} from './token-stream.mjs';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
const supportedLanguages=new Set(['ja','en','zh','ko','es','fr','de','pt','it','ru','th','vi','id','ar']);
let model, sourceLanguage;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      if (!supportedLanguages.has(data.sourceLanguage)) throw new Error('瀏覽器語音模型不支援這個來源語言');
      sourceLanguage=data.sourceLanguage;
      const modelId=['whisper-tiny','whisper-base','whisper-small'].includes(data.model)?data.model:'whisper-small';
      let dtype='fp32',fallback=false;
      if(data.profile==='small-fp16'){
        let adapter;
        try{adapter=await globalThis.navigator?.gpu?.requestAdapter();}catch{/* Use the established profile. */}
        if(adapter?.features.has('shader-f16'))dtype='fp16';
        else fallback=true;
      }
      try{
        model=await pipeline('automatic-speech-recognition','onnx-community/'+modelId,{
          device:'webgpu',dtype,progress_callback:p=>{if(p.status==='progress')postMessage({type:'progress',progress:Math.round(p.progress||0)});}
        });
      }catch(error){
        if(dtype!=='fp16')throw error;
        // The host restarts in a clean worker before allocating FP32 buffers.
        postMessage({type:'profile-fallback'});
        return;
      }
      postMessage({type:'ready',model:modelId,dtype,fallback});
    } else if (data.type === 'decode') {
      const streamer=data.stream===false?undefined:new CaptionTokenStream(model.tokenizer,text=>postMessage({type:'partial',id:data.id,text}));
      const result = await model(data.audio, {language:sourceLanguage, task:'transcribe', max_new_tokens:128,streamer});
      postMessage({type:'result', id:data.id, text:result.text || ''});
    }
  } catch(error) { postMessage({type:'error', error:error.message}); }
};
