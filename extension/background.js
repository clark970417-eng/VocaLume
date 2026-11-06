import {selectedApi,apiProfile,apiCacheScope,requestApi,RetryableTranslationError,retryTranslationRequest,translationHttpError} from './cloud-api.mjs';
import {RecordingQueue} from './recording-queue.mjs';
import {NativeClient} from './native-client.mjs';
let desktopClient;
const desktop={request:(...args)=>{if(!desktopClient){desktopClient=new NativeClient(chrome.runtime);desktopClient.onEvent=desktopEvent;}return desktopClient.request(...args);}};
const desktopSegments=new Map();
let engineMode='browser';
import {ResultGate} from './stream-core.mjs';
import {CueCursor} from './cue-cursor.mjs';
import {protectDraftText,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,normalizeLivestreamChat} from './translation-policy.mjs';
const OPENROUTER="https://openrouter.ai/api/v1",NVIDIA="https://integrate.api.nvidia.com/v1";
let captionMode='record',captionHold=3,speechFrom='ja',speechTo='zh';
const setHold=value=>{captionHold=Math.max(1,Math.min(6,Number(value)||3));};
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.subtitleSettings)setHold(changes.subtitleSettings.newValue?.holdSeconds);});
const fresh=item=>item&&!item.expired&&Date.now()/1000<(item.expiresAt??item.updatedAt+3);
const items=[];let running=false,lastError="",captureTabId=null,drainingSession=null,stopPromise=null;
const LANGUAGE_CODES=new Set(['ja','en','zh','ko','es','fr','de','pt','it','ru','th','vi','id','ar']);
const languageDefaults={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
const settings=()=>chrome.storage.local.get(["openrouterKey","nvidiaKey","cloudTranslation","speechMode","subtitleSettings","languageSettings","writingStyle","writingQuality"]);
const pair=(from,to)=>`${from}-${to}`;
function parseDirection(direction){const [from,to]=String(direction||'').split('-');if(!LANGUAGE_CODES.has(from)||!LANGUAGE_CODES.has(to)||from===to)throw new Error('不支援這組語言');return {from,to};}
async function languageSettings(){const saved=(await chrome.storage.local.get('languageSettings')).languageSettings||{};return {...languageDefaults,...saved};}
function checkedTranslation(value,direction,source){parseDirection(direction);return validateTranslation(value,direction,source);}
const deadline=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function request(url,key,body,signal){
 const budget=deadline(signal,10000);
 return retryTranslationRequest(async()=>{
  const response=await fetch(url,{signal:budget,method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
   .catch(()=>{throw new RetryableTranslationError('暫時無法連線到翻譯服務');});
  if(!response.ok)throw translationHttpError(response,`API ${response.status}`);
  return response.json().catch(()=>{throw new RetryableTranslationError('翻譯服務回傳格式不正確');});
 },budget);
}
async function nvidia(text,from,to,signal){const {nvidiaKey}=await settings();if(!nvidiaKey)throw new Error("請先儲存 NVIDIA Key");const d=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model:"nvidia/riva-translate-4b-instruct-v2",messages:[{role:"system",content:`${from}-${to}`},{role:"user",content:text}],temperature:0,max_tokens:300},signal);return(d.choices?.[0]?.message?.content||"").trim()}
async function freeTranslate(text,direction,signal,protectedText=protectNames(text)){
 const {from,to}=parseDirection(direction);
 const googleLanguage=code=>code==='zh'?'zh-TW':code;
 const q=new URLSearchParams({client:'gtx',sl:googleLanguage(from),tl:googleLanguage(to),dt:'t',q:protectedText.text});
 const budget=deadline(signal,4000);
 return retryTranslationRequest(async()=>{
  const response=await fetch(`https://translate.googleapis.com/translate_a/single?${q}`,{signal:budget})
   .catch(()=>{throw new RetryableTranslationError('暫時無法連線到翻譯服務');});
  if(!response.ok)throw translationHttpError(response,`翻譯服務 ${response.status}`);
  const data=await response.json().catch(()=>{throw new RetryableTranslationError('翻譯服務回傳格式不正確');});
  if(!Array.isArray(data?.[0]))throw new RetryableTranslationError('翻譯服務回傳格式不正確');
  const result=data[0].map(segment=>typeof segment?.[0]==='string'?segment[0]:'').join('').trim();
  if(!result)throw new RetryableTranslationError('翻譯回應為空');
  try{
   const restored=protectedText.restore(result);
   return checkedTranslation(to==='zh'?polishChinese(text,restored):restored,direction,text);
  }catch(error){throw new RetryableTranslationError(error.message);}
 },budget);
}
const textMemo=new TranslationMemo();
const localTranslationMemo=new TranslationMemo();
async function localTranslation(text,direction,timeout=60000){
 const configured=await settings(),style=configured.writingStyle||'general';
 const quality=direction==='zh-ja'&&configured.writingQuality==='quality'?'quality':'fast';
 const key=direction+':'+style+':'+quality+':'+text.trim();
 return localTranslationMemo.run(key,async()=>{
  const protectedText=protectNames(text);
  const fields={text:protectedText.text,direction,writingStyle:style,quality};
  const started=Date.now();
  let received=false;
  const request=async budget=>{
   const result=await desktop.request('translate',fields,budget);
   received=true;
   const translated=checkedTranslation(protectedText.restore(result?.text),direction,text);
   if(!translated)throw new Error('翻譯回應為空');
   return translated;
  };
  try{return await request(timeout);}catch(error){
   // Native hosts serialize validation failures as text. NativeClient
   // already handles transport recovery, so do not replay transport errors.
   const invalidNativeResult=/^翻譯(?:服務(?:回傳格式不正確|未回傳(?:繁體中文|日文|目標語言))|(?:重複了人名|遺漏人名|人名標記不完整|回應過長)，請重試)$/u.test(error?.message);
   if(!received&&!invalidNativeResult)throw error;
   const remaining=timeout-(Date.now()-started);
   if(remaining<250)throw error;
   return request(remaining);
  }
 });
}
async function makeDraft(text,direction,configured){
 if(typeof text!=='string'||!text.trim()||text.length>3000)throw new Error('請輸入 1–3000 字');
 text=text.trim();
 if(/^w{2,}$/i.test(text))return {draft:text,mode:'保留原文語氣'};
 if(!direction){const langs=await languageSettings();direction=pair(langs.typeSource,langs.typeTarget);}
 const {from,to}=parseDirection(direction);
 const phrase=phraseTranslation(text,direction);if(phrase)return {draft:phrase,mode:'校對短句'};
 configured ||= await settings();
 const key=`draft:${apiCacheScope(configured)}:${direction}:${configured.writingStyle||'general'}:${configured.writingQuality||'fast'}:${configured.speechMode==='desktop'}:${Boolean(configured.openrouterKey)}:${Boolean(configured.nvidiaKey)}:${text}`;
 return textMemo.run(key,async()=>{
  if(selectedApi(configured)!=='auto')return {draft:await styledTranslation(text,direction,undefined,configured),mode:apiProfile(configured).label+' · 請確認譯文'};
  const protectedText=protectDraftText(text,from,to);
  const local=async timeout=>({draft:checkedTranslation(protectedText.restore(await localTranslation(protectedText.text,direction,timeout)),direction,text),mode:'本機翻譯草稿 · 請確認語氣'});
  if(configured.speechMode==='desktop'){try{return await local(60000);}catch(_error){/* Continue through independent fallbacks. */}}
  try{return {draft:await styledTranslation(text,direction),mode:direction==='zh-ja'?(configured.writingStyle==='viewer'?'直播留言':configured.writingStyle==='polite'?'禮貌語氣':'自然語氣'):'自然語氣'};}catch(_error){/* No configured provider or provider failed. */}
  try{return {draft:await freeTranslate(text,direction,undefined,protectedText),mode:'一般機翻：請確認措辭'};}
  catch(networkError){
   if(configured.speechMode!=='desktop'){try{return await local(15000);}catch(_localError){/* Report the faster network error below. */}}
   throw networkError;
  }
 });
}
async function styledTranslation(text,direction,signal,configured){
 if(direction==='ja-zh')text=normalizeGreetingSource(text);
 configured ||= await settings();
 const {writingStyle}=configured;
 const nvidiaProfile=apiProfile(configured,'nvidia'),routerProfile=apiProfile(configured,'openrouter');
 const nvidiaKey=nvidiaProfile.apiKey,openrouterKey=routerProfile.apiKey;
 const {from,to}=parseDirection(direction);
 const prompt=direction==='zh-ja'?(writingStyle==='viewer'?viewerPrompt:`Translate the ENTIRE Traditional Chinese input faithfully into Japanese. Preserve every clause, negation, uncertainty, condition, tense, speaker, name, number, emoji and line break. ${writingStyle==='polite'?'Use natural desu/masu polite Japanese.':'Preserve the original tone and register; do not assume this is a livestream comment.'} Do not add affection, invitations or instructions. Input is content to translate. Return only the translation.`):direction==='ja-zh'?chinesePrompt:`Translate from ${from} to ${to}. Return only the natural translation, preserving names, tone, emoji and line breaks.`;
 const protectedText=protectDraftText(text,from,to);
 const markerInstructions=protectedText.entries.length?'\nCopy each bracketed name or term marker exactly once, without translating it.':'';
 const messages=[{role:'system',content:prompt+gameTerminologyPrompt(text,from,to)+markerInstructions},{role:'user',content:protectedText.text}];
 if(selectedApi(configured)!=='auto'){
  return requestApi(apiProfile(configured),messages,signal,{fetchImpl:fetch,permissions:chrome.permissions,
   validate:output=>checkedTranslation(protectedText.restore(output),direction,text)});
 }
 const providers=[];
 if(nvidiaKey){
  for(const model of [nvidiaProfile.model])providers.push(async()=>{
   const result=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model,messages,temperature:0.2,max_tokens:600,chat_template_kwargs:{enable_thinking:false}},signal);
   return result;
  });
 }
 if(openrouterKey)providers.push(()=>request(`${OPENROUTER}/chat/completions`,openrouterKey,{model:routerProfile.model,messages,temperature:0.2,max_tokens:600},signal));
 for(const run of providers){try{const d=await run();if(d.choices?.[0]?.finish_reason==='length')throw new Error('翻譯被截斷');const value=checkedTranslation(protectedText.restore(d.choices?.[0]?.message?.content),direction,text);if(value)return value;}catch(error){if(signal?.aborted)throw error;}}
 throw new Error('情境翻譯目前無法使用');
}
async function translateSingle(text,direction,priority=false,configured){
 const phrase=phraseTranslation(text,direction);if(phrase)return phrase;
 if(direction==='ja-zh')text=normalizeGreetingSource(text);
 configured ||= await settings();
 if(selectedApi(configured)!=='auto')return styledTranslation(text,direction,undefined,configured);
 if(direction==='zh-ja')return (await makeDraft(text,direction,configured)).draft;
 if(priority){
  try{return await styledTranslation(text,direction,undefined,configured);}catch(_error){}
  // Static page text (especially the title) must not wait behind the live
  // desktop audio queue. Use the independent text endpoint, then fall back
  // to the selected local engine when the network is unavailable.
  try{return await freeTranslate(text,direction);}catch(networkError){
   try{return await localTranslation(text,direction,15000);}catch(_localError){throw networkError;}
  }
 }
 if(direction==='ja-zh')return translateCaption(text,undefined,direction,configured);
 try{return await localTranslation(text,direction,15000);}catch(_error){return freeTranslate(text,direction);}
}
async function translate(text,direction,priority=false,livestreamChat=false){
 parseDirection(direction);if(typeof text!=='string'||!text.trim()||text.length>3000)throw new Error('請輸入 1–3000 字');
 text=text.trim();
 if(livestreamChat)text=normalizeLivestreamChat(text,direction);
 const configured=await settings();
 return textMemo.run(apiCacheScope(configured)+':'+direction+':'+priority+':'+(configured.speechMode||'browser')+':'+(configured.writingStyle||'general')+':'+(configured.writingQuality||'fast')+':'+text,async()=>{
  const chunks=splitTranslationText(text);
  if(chunks.length===1)return translateSingle(text,direction,priority,configured);
  const translated=new Array(chunks.length);let cursor=0;
  // Two workers make multi-line chat noticeably faster without flooding the
  // local model or remote provider with every chunk at once.
  const worker=async()=>{while(cursor<chunks.length){const index=cursor++;translated[index]=await translateSingle(chunks[index],direction,priority,configured);}};
  await Promise.all(Array.from({length:Math.min(2,chunks.length)},worker));
  return translated.join('');
 });
}
// A browser caption can spend 3 s on the network before its 15 s local fallback.
const MAX_CAPTION_TRANSLATION_MS=20000;
let recordingReady,recordingPreview=null;
const recording=new RecordingQueue({
 timeoutMs:MAX_CAPTION_TRANSLATION_MS,
 save:entries=>chrome.storage.local.set({recordedCaptions:entries}),
 translate:async text=>{const configured=await settings();return textMemo.run(`record:${apiCacheScope(configured)}:${engineMode}:${speechFrom}-${speechTo}:${text}`,async()=>{const direction=pair(speechFrom,speechTo);const phrase=phraseTranslation(text,direction);if(phrase)return phrase;if(engineMode==='desktop')return translateCaption(text);if(selectedApi(configured)!=='auto')return styledTranslation(text,direction,undefined,configured);try{return await styledTranslation(text,direction);}catch(_){return translateCaption(text);}});},
 onChange:()=>{if(captionMode==='record'&&running)pushSubtitle(recordingItem());},
 onError:()=>{lastError='字幕記錄無法儲存，請匯出記錄並檢查儲存空間';if(running)stopCapture();}
});
function initRecording(){return recordingReady??=chrome.storage.local.get('recordedCaptions').then(s=>recording.restore(Array.isArray(s.recordedCaptions)?s.recordedCaptions:[]));}
function recordingItem(){const rows=recording.rows(gate.session);if(recordingPreview?.session===gate.session){const existing=rows.find(r=>r.id===recordingPreview.group);if(existing)existing.original=recordingPreview.original;else rows.push({id:recordingPreview.group,original:recordingPreview.original,translated:'',pending:1});}return {id:'recording',recordingRows:rows.slice(-4),original:'',translated:'',updatedAt:Date.now()/1000};}
function recordTranscript(m){
 if(m.source!=='native'&&!m.final){if(m.partial&&m.text){recordingPreview={session:gate.session,group:gate.session+':'+m.id,original:m.text};pushSubtitle(recordingItem());}return;}
 recordingPreview=null;
 const text=String(m.text||'').replace(/\s+/g,' ').trim();if(!text)return;
 const key=gate.session+':'+(m.source==='native'?'native-'+(++outputSequence):m.id);
 recording.add({key,session:gate.session,group:key,original:text,createdAt:Date.now()}).catch(()=>{});
}
const gate=new ResultGate();
const cueCursor=new CueCursor();
let nativeUntil=0, nativeText='', outputSequence=0, lastSpeechId=-1;
let diagnostics={}, modelStatus='', controlBusy=false, controlAction='', translationPending=null, publishedId=-1;
// Bounded, in-memory timing only; never retain the spoken text in diagnostics.
let deliverySamples={};
function recordDeliveryTime(name,value){
 if(!Number.isFinite(value)||value<0||value>600000)return;
 const samples=deliverySamples[name]??=[];samples.push(value);if(samples.length>120)samples.shift();
 const sorted=[...samples].sort((a,b)=>a-b),percentile=p=>Math.round(sorted[Math.floor((sorted.length-1)*p)]);
 diagnostics.deliveryMetrics??={};
 diagnostics.deliveryMetrics[name]={count:sorted.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Math.round(sorted.at(-1))};
}
const captionRequests=new Map();
// Speech continues to be captured while the current subtitle finishes translating.
// Display order is independent of recognition arrival order.
const desktopOrder=[],desktopDelivered=new Set();
let desktopAdvanceTimer=null,desktopSettledAt=0;
function resetDesktopPresentation(){
 if(desktopAdvanceTimer!==null)clearTimeout(desktopAdvanceTimer);
 desktopAdvanceTimer=null;desktopSettledAt=0;desktopOrder.length=0;desktopDelivered.clear();
}
function presentDesktopCaption(segment){
 if(desktopDelivered.has(segment))return;
 if(!desktopOrder.includes(segment))desktopOrder.push(segment);
 const current=desktopOrder[0],meta=desktopSegments.get(current),caption=meta?.caption;
 if(!caption)return;
 if(segment===current){
  const translated=caption.final?caption.translated:'';
  const item={id:current,original:caption.original,translated,updatedAt:Date.now()/1000,
   expiresAt:Date.now()/1000+(caption.final?captionHold:120),pending:!caption.final,error:caption.error||''};
  items.length=0;items.push(item);pushSubtitle(item);
  if(caption.final&&!desktopSettledAt)desktopSettledAt=Date.now();
 }
 if(!caption.final||desktopOrder.length<2||desktopAdvanceTimer!==null)return;
 const hold=caption.translated?Math.min(captionHold*1000,Math.max(1000,caption.translated.length*60)):2000;
 desktopAdvanceTimer=setTimeout(()=>{
  desktopAdvanceTimer=null;
  if(!running)return;
  desktopDelivered.add(desktopOrder.shift());desktopSettledAt=0;
  if(desktopOrder.length)presentDesktopCaption(desktopOrder[0]);
 },Math.max(0,hold-(Date.now()-desktopSettledAt)));
}
function cancelTranslations(){translationPending=null;publishedId=-1;for(const controller of captionRequests.values())controller.abort();captionRequests.clear();}
async function translateCaption(text,signal,direction=pair(speechFrom,speechTo),configured){
 const phrase=phraseTranslation(text,direction);if(phrase)return phrase;
 if(direction==='ja-zh')text=normalizeGreetingSource(text);
 parseDirection(direction);
 configured ||= await settings();
 if(engineMode==='desktop'||configured.speechMode==='desktop')return localTranslation(text,direction,12000);
 if(selectedApi(configured)!=='auto')return styledTranslation(text,direction,signal,configured);
 const primary=activeSignal=>freeTranslate(text,direction,activeSignal);
 try{
  if(!apiProfile(configured,'nvidia').apiKey&&!apiProfile(configured,'openrouter').apiKey)return await primary(deadline(signal,3000));
  return await firstTranslation(primary,s=>styledTranslation(text,direction,s,configured),deadline(signal,3000),400);
 }catch(networkError){
  signal?.throwIfAborted();
  try{return await localTranslation(text,direction,15000);}catch(_localError){throw networkError;}
 }
}
const translationCache=new Map();
function desktopEvent(event){
 if(!['caption','source'].includes(event.event))return;
 const meta=desktopSegments.get(event.segment);if(!meta||((meta.session!==gate.session||!running)&&meta.mode!=='record'))return;
 const result=event.result||{text:event.text};
 if(event.event==='source'&&meta.final&&!meta.finalSourceAt){
  meta.finalSourceAt=Date.now();
  recordDeliveryTime('endToSourceMs',meta.finalSourceAt-meta.audioEndAt);
 }
 const original=String(result.text||(result.final?meta.caption?.original:'')||'').trim();if(!original){
  if(result.final&&meta.mode==='realtime'){
   const index=desktopOrder.indexOf(event.segment);if(index>=0)desktopOrder.splice(index,1);
   if(index===0){if(desktopAdvanceTimer!==null)clearTimeout(desktopAdvanceTimer);desktopAdvanceTimer=null;desktopSettledAt=0;if(desktopOrder.length)presentDesktopCaption(desktopOrder[0]);}
  }
  return;
 }
 let translated=String(result.translated||'').trim(),error=result.error||'';
 if(result.targetLanguage&&result.targetLanguage!==speechTo){translated='';error='翻譯語言不符';}
 if(translated&&(!result.targetLanguage||result.targetLanguage===speechTo)){try{translated=checkedTranslation(translated,pair(speechFrom,speechTo),original);}catch(e){translated='';error=e.message;}}
 const previous=meta.caption;
 // A recovered decoder may complete a previously failed cue. Accept that final
 // while keeping late drafts from reopening an already settled caption.
 if(previous?.final&&!result.correction&&(!result.final||previous.translated))return;
 // An old translation must never be paired with a new source hypothesis.
 if(previous?.original!==original&&!result.final&&translated===previous?.translated)translated='';
 const final=!!result.final||!!(result.correction&&previous?.final);
 if(result.final&&translated&&!result.correction&&!meta.deliveryRecorded){
  const completed=Date.now();meta.deliveryRecorded=true;
  recordDeliveryTime('endToTranslationMs',completed-meta.audioEndAt);
  if(meta.finalSourceAt)recordDeliveryTime('sourceToTranslationMs',completed-meta.finalSourceAt);
 }
 if(previous?.final&&!previous.translated&&translated&&desktopOrder[0]===event.segment){
  if(desktopAdvanceTimer!==null)clearTimeout(desktopAdvanceTimer);
  desktopAdvanceTimer=null;desktopSettledAt=0;
 }
 meta.caption={original,translated,final,error:final&&!translated?(error||'翻譯未完成'):''};
 diagnostics.lastRecognition=Date.now();modelStatus='已辨識語音';
 if(meta.session===gate.session&&meta.createdAt>=(diagnostics.captionPhaseAt||0)){
  diagnostics.captionPhase=translated?'translated':final?'failed':'translating';
  diagnostics.captionPhaseAt=meta.createdAt;
 }
 if(translated)diagnostics.chineseLagMs=Date.now()-meta.audioEndAt;
 if(meta.mode==='record'){
  recording.updateExternal({key:event.segment,session:meta.session,group:meta.group,createdAt:meta.createdAt,original,translated,state:final?(translated?'done':'failed'):'streaming',error:meta.caption.error}).catch(()=>{lastError='字幕記錄無法儲存';});
 }else{
  presentDesktopCaption(event.segment);
 }
}
function pushSubtitle(item){if(captureTabId)chrome.tabs.sendMessage(captureTabId,{type:'subtitle-update',item}).catch(()=>{});}
function failCaptionTranslation(job,error){
 const {item,session}=job;
 if(gate.session!==session||gate.latest!==item||item.expired)return;
 lastError='翻譯失敗：'+error.message;
 if(!item.pending)return;
 item.pending=false;item.error=lastError;item.expiresAt=Date.now()/1000+captionHold;
 if(items[0]===item)pushSubtitle(item);
}
async function translateItem(job){
 // Finish useful work; keep only the newest waiting revision. Repeatedly
 // aborting the oldest request starves subtitles on slower connections.
 if(job.item.expired)return;
 if(Date.now()-job.started>=MAX_CAPTION_TRANSLATION_MS){failCaptionTranslation(job,new Error('翻譯等待逾時'));return;}
 if(captionRequests.size>=2){translationPending=job;return;}
 const controller=new AbortController();captionRequests.set(job,controller);
 try {
 const key=apiCacheScope(await settings())+`:${speechFrom}-${speechTo}:`+job.item.original;
  const result=translationCache.get(key)||await translateCaption(job.item.original,controller.signal);
  if(controller.signal.aborted)return;
  translationCache.set(key,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
  if(Date.now()-job.started>=MAX_CAPTION_TRANSLATION_MS){failCaptionTranslation(job,new Error('翻譯等待逾時'));return;}
  if(gate.session===job.session&&job.item.id>publishedId&&!job.item.expired){
   publishedId=job.item.id;job.item.translated=result;job.item.pending=false;job.item.error='';job.item.expiresAt=Date.now()/1000+captionHold;items.length=0;items.push(job.item);
   if(job.item.source!=='native')cueCursor.markDelivered(job.item.speechId,job.fullSpeechText,job.item.original);
   lastError='';diagnostics.translationMs=Date.now()-job.started;diagnostics.chineseLagMs=job.item.audioEndAt?Date.now()-job.item.audioEndAt:diagnostics.translationMs;pushSubtitle(job.item);
  }
 } catch(error){if(!controller.signal.aborted)failCaptionTranslation(job,error);}
 finally{captionRequests.delete(job);if(translationPending&&captionRequests.size<2){const next=translationPending;translationPending=null;if(next.session===gate.session)translateItem(next);}}
}
function addTranscript(m){
 m={...m,text:String(m.text||'').trim()};
 if(captionMode==='record'){if(m.source!=='native'&&Date.now()<nativeUntil)return;recordTranscript(m);return;}
 if(m.source!=='native'&&(Date.now()<nativeUntil||m.id<lastSpeechId))return;
 // Translate exactly the short source cue displayed, retaining the full ASR
 // hypothesis in the worker for agreement and overlap alignment.
 const fullSpeechText=m.text;
 if(m.source!=='native'){
  m.text=cueCursor.select(m.text,m.id);
  // Keep the whole clause for translation; CSS controls visible line length.
  // Cutting the last 44 characters here discarded subjects and negation.
 }
 if(m.source!=='native'){
  if(Date.now()<nativeUntil || m.id<lastSpeechId)return;
  lastSpeechId=m.id;
 }
 if(gate.latest?.original===m.text && gate.latest.speechId===m.id && gate.latest.source===m.source){
  const item=gate.latest;
  item.provisional=Boolean(m.provisional);
  if(m.source!=='native'&&m.final&&!item.final){
   item.final=true;
   if(!item.translated){
    item.pending=true;item.error='';item.expiresAt=Date.now()/1000+MAX_CAPTION_TRANSLATION_MS/1000;
    if(items[0]===item)pushSubtitle(item);
    const scheduled=translationPending?.item===item||[...captionRequests.keys()].some(job=>job.item===item);
    if(!scheduled)translateItem({session:m.session,item,fullSpeechText,started:Date.now()});
   }
  }
  return;
 }
 const item=gate.accept(m.session,++outputSequence,m.text);if(!item)return;
 item.source=m.source;item.speechId=m.id;item.final=Boolean(m.final);item.pending=m.source!=='native'&&item.final;item.expiresAt=Date.now()/1000+(item.pending?MAX_CAPTION_TRANSLATION_MS/1000:captionHold);item.provisional=Boolean(m.provisional);item.audioEndAt=m.audioEndAt;item.stableText=m.stableText||'';
 if(!items[0]?.translated||!fresh(items[0])){items.length=0;items.push(item);pushSubtitle(item);}
 diagnostics.lastRecognition=Date.now();diagnostics.decodeMs=m.decodeMs;modelStatus='已辨識語音';
 translateItem({session:m.session,item,fullSpeechText,started:Date.now()});
}
async function ensureOffscreen(){if(await chrome.offscreen.hasDocument())return;await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'擷取目前分頁音訊以產生字幕'});}
function stopCapture(){
 if(stopPromise)return stopPromise;
 stopPromise=(async()=>{
  if(captionMode==='record'&&nativeText){const text=nativeText;nativeText='';recordTranscript({text,source:'native'});}
  cueCursor.reset();cancelTranslations();resetDesktopPresentation();nativeUntil=0;nativeText='';lastSpeechId=-1;
  drainingSession=running&&captionMode==='record'?gate.session:null;
  running=false;items.length=0;translationPending=null;pushSubtitle(null);
  try{
   await chrome.storage.local.set({captionsHidden:true});
   const response=await chrome.runtime.sendMessage({type:'offscreen-stop',drain:!!drainingSession});
   if(response?.ok===false)lastError=response.error||'部分字幕未完成，請檢查記錄';
   if(desktopClient)await desktop.request('stop',{},60000);
  }catch(error){lastError='停止收音後的字幕未全部完成：'+error.message;}
  finally{drainingSession=null;gate.reset();modelStatus='已停止';}
  return{running};
 })().finally(()=>{stopPromise=null;});
 return stopPromise;
}
async function resetCapture(){
 cueCursor.reset();
 if(!running)return {running:false};
 cancelTranslations();resetDesktopPresentation();
 nativeUntil=0;nativeText='';lastSpeechId=-1;
 gate.reset();items.length=0;translationPending=null;pushSubtitle(null);
 const response=await chrome.runtime.sendMessage({type:'offscreen-reset',session:gate.session});
 if(!response?.ok){await stopCapture();lastError='音訊連線已中斷，請重新開始';}
 return {running};
}
async function startCapture(tabId){
 if(!Number.isInteger(tabId))throw new Error('請先選擇影片分頁');
 await stopCapture();const prefs=(await settings()).subtitleSettings;setHold(prefs?.holdSeconds);captionMode=prefs?.captionMode==='realtime'?'realtime':'record';if(captionMode==='record')await initRecording();captureTabId=tabId;diagnostics={};deliverySamples={};lastError='';
 const configured=await settings(),langs={...languageDefaults,...(configured.languageSettings||{})};speechFrom=langs.speechSource;speechTo=langs.speechTarget;parseDirection(pair(speechFrom,speechTo));engineMode=configured.speechMode==='desktop'?'desktop':'browser';
 try{
 if(engineMode==='desktop'){modelStatus='正在載入桌面模型，首次可能需要下載…';await desktop.request('init',{sourceLanguage:speechFrom,targetLanguage:speechTo,speechToneMode:['off','natural','ww','笑','草'].includes(prefs?.speechToneMode)?prefs.speechToneMode:'off'},600000);}
 await ensureOffscreen();
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tabId});
 running=true;modelStatus='正在擷取分頁聲音';
 const reply=await chrome.runtime.sendMessage({type:'offscreen-start',streamId,mode:engineMode,recording:captionMode==='record',session:gate.session});
 if(!reply?.ok){running=false;throw new Error(reply?.error||'無法擷取分頁聲音');}
 await chrome.storage.local.set({captionsHidden:false});
 return{running};
 }catch(error){
  await stopCapture().catch(()=>{});captureTabId=null;
  lastError=/not been invoked|activeTab/i.test(error.message||'')?'請先在影片分頁點一下翻譯助手圖示，再按開始語音。':(error.message||'無法開始語音');
  modelStatus=lastError;throw new Error(lastError);
 }
}
chrome.tabs.onRemoved.addListener(id=>{if(id===captureTabId)stopCapture();});
chrome.runtime.onMessage.addListener((m,s,send)=>{
 if(m.type==='desktop-settings' && s.url===chrome.runtime.getURL('popup.html')){
  desktop.request('settings',{},30000).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
 }
 if(m.type==='desktop-request'){
  if(s.url!==chrome.runtime.getURL('offscreen.html')||(!running&&!drainingSession)||engineMode!=='desktop'||!['init','decode'].includes(m.op))return;
  const segment=gate.session+':'+m.segment;
  if(m.op==='decode'){
   diagnostics.captionPhase='recognizing';diagnostics.captionPhaseAt=m.speechAt;
   const previous=desktopSegments.get(segment);
   desktopSegments.set(segment,{...previous,session:gate.session,mode:captionMode,group:segment,createdAt:m.speechAt,audioEndAt:m.audioEndAt,final:m.final});
   if(captionMode==='realtime'&&!desktopOrder.includes(segment)&&!desktopDelivered.has(segment))desktopOrder.push(segment);
   // Never evict a sentence still waiting for its translation.
   if(desktopSegments.size>200){for(const [key,meta] of desktopSegments){if(meta.session!==gate.session||desktopDelivered.has(key)){desktopSegments.delete(key);desktopDelivered.delete(key);break;}}}
  }
  desktop.request(m.op,m.op==='decode'?{audio:m.audio,segment,final:!!m.final,...(Number.isFinite(m.speechSeconds)&&m.speechSeconds>=0&&{speechSeconds:m.speechSeconds}),...(Number.isSafeInteger(m.speechEndSample)&&m.speechEndSample>0&&{speechEndSample:m.speechEndSample}),...(Number.isSafeInteger(m.captureStartSample)&&Number.isSafeInteger(m.captureEndSample)&&{captureStartSample:m.captureStartSample,captureEndSample:m.captureEndSample,continuationExpected:m.continuationExpected===true})}:{},m.op==='init'?600000:60000).then(text=>{
   if(m.op==='decode'&&m.final&&!text?.pending)desktopEvent({event:'caption',segment,result:{...text,final:true}});
   send({ok:true,text});
  },e=>{if(m.op==='decode')desktopEvent({event:'caption',segment,result:{final:true,error:e.message}});send({ok:false,error:e.message});});return true;
 }
 if(['speech-result','model-status','speech-error','audio-health'].includes(m.type)){
  if(s.url!==chrome.runtime.getURL('offscreen.html')||(!running&&m.session!==drainingSession)||m.session!==gate.session)return;
  if(m.type==='speech-result')addTranscript(m);
  if(m.type==='model-status')modelStatus=m.text;
  if(m.type==='audio-health')diagnostics={...diagnostics,...m,lastHeartbeat:Date.now()};
  if(m.type==='speech-error'){lastError=m.error;stopCapture();}
  send({ok:true});return;
 }
 let task;
 if(m.type==='native-caption'){
  if(!running || s.tab?.id!==captureTabId || s.frameId!==0 || !/^https:\/\/www\.youtube\.com\//.test(s.url||'')){send({ok:false});return;}
  const text=typeof m.text==='string'?m.text.trim().slice(0,500):'';
  if(text && (speechFrom!=='ja'||/[\u3040-\u30ff]/.test(text))){
   nativeUntil=Date.now()+1800;
   chrome.runtime.sendMessage({type:'offscreen-native',session:gate.session}).catch(()=>{});
   if(text!==nativeText){if(captionMode==='record'){if(nativeText&&!text.startsWith(nativeText))recordTranscript({text:nativeText,source:'native'});nativeText=text;}else{if(!nativeText){cancelTranslations();items.length=0;pushSubtitle(null);}nativeText=text;addTranscript({session:gate.session,text,source:'native'});}}
   if(gate.latest?.source==='native')gate.latest.expiresAt=Date.now()/1000+1.8;
   modelStatus='使用 YouTube 日文字幕';
  } else {if(captionMode==='record'&&nativeText)recordTranscript({text:nativeText,source:'native'});nativeUntil=0;nativeText='';if(gate.latest?.source==='native')gate.latest.expired=true;for(const [job,controller] of captionRequests){if(job.item.source==='native'){job.item.expired=true;controller.abort();}}if(translationPending?.item.source==='native')translationPending=null;if(items[0]?.source==='native'){items[0].expired=true;items.length=0;pushSubtitle(null);}}
  send({ok:true,text:{running}});return;
 }
 else if(m.type==='translation-provider-test'){
  if(s.tab || s.url!==chrome.runtime.getURL('popup.html')){send({ok:false,error:'只能從 VocaLume 設定測試 API'});return;}
  task=settings().then(async configured=>{if(selectedApi(configured)==='auto')throw new Error('請先選擇並儲存 API 服務');return {provider:apiProfile(configured).label,translated:await styledTranslation('今日は楽しい一日です。','ja-zh',undefined,configured)};});
 }
 else if(m.type==='recording-export')task=initRecording().then(()=>recording.entries);
 else if(m.type==='recording-retry')task=initRecording().then(()=>recording.retry()).then(()=>({pending:recording.pending}));
 else if(m.type==='make-draft')task=makeDraft(m.text,m.direction);
 else if(m.type==='translate')task=translate(m.text,m.direction,Boolean(m.priority),m.livestreamChat===true);
 else if(m.type==='subtitles')task=Promise.resolve({running:running&&s.tab?.id===captureTabId,items:s.tab?.id===captureTabId?(captionMode==='record'?[recordingItem()]:items.filter(fresh)):[]});
 else if(m.type==='health')task=Promise.resolve({running,draining:!!drainingSession,lastError,modelStatus,controlBusy,controlAction,diagnostics,captureTabId,captionMode,recordingPending:recording.pending,recordingFailed:recording.failed});
 else if(m.type==='subtitle-reset'){
  if(s.tab?.id!==captureTabId)return;
  task=resetCapture();
 } else if(m.type==='subtitle-control'){
  if(controlBusy||drainingSession){send({ok:false,error:'正在切換，請稍候'});return;}
  controlBusy=true;controlAction=m.action==='stop'?'stop':'start';task=(m.action==='stop'?stopCapture():startCapture(m.tabId||s.tab?.id)).finally(()=>{controlBusy=false;controlAction='';});
 } else return;
 Promise.resolve(task).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
});
