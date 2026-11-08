import {selectedApi,apiProfile,apiCacheScope,requestApi,RetryableTranslationError,retryTranslationRequest,translationHttpError} from './cloud-api.mjs';
import {RecordingQueue} from './recording-queue.mjs';
import {NativeClient} from './native-client.mjs';
import {UI_LANGUAGE_KEY,UI_REGION_LOCALE_KEY,lookupRegionalUiLanguage,uiLanguagePreference} from './ui-language.mjs';
import {createUiLanguageSync} from './ui-language-sync.mjs';
import {WEBSITE_ORIGIN} from './website-language.mjs';
let uiLanguageSync;
let desktopClient;
let nativeRequests=0,nativeIdleTimer=null,offscreenIdleTimer=null,offscreenClosing=null;
const desktop={request:async(...args)=>{
 if(!desktopClient){desktopClient=new NativeClient(chrome.runtime);desktopClient.onEvent=desktopEvent;desktopClient.onDisconnect=desktopDisconnected;}
 if(nativeIdleTimer!==null){clearTimeout(nativeIdleTimer);nativeIdleTimer=null;}
 nativeRequests++;
 try{return await desktopClient.request(...args);}
 finally{nativeRequests--;scheduleNativeIdle();}
}};
const desktopSegments=new Map();
let engineMode='browser';
let captureRole=null, coordinatedCapture=false, sharedTimestamp=0;
const sharedRevisions=new Map();
let pendingSharedEvents=[];
let desktopPerformance;
import {ResultGate} from './stream-core.mjs';
import {CueCursor} from './cue-cursor.mjs';
import {NativeCueTimeline} from './youtube-cue.mjs';
import {protectDraftText,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,translateFormatted,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,normalizeLivestreamChat} from './translation-policy.mjs';
import {applyTaiwanLivestreamTerminology,normalizeTaiwanChinese} from './taiwan-chinese.mjs';
const OPENROUTER="https://openrouter.ai/api/v1",NVIDIA="https://integrate.api.nvidia.com/v1";
let captionMode='record',captionHold=3,speechFrom='ja',speechTo='zh';
const setHold=value=>{captionHold=Math.max(1,Math.min(6,Number(value)||3));};
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.subtitleSettings)setHold(changes.subtitleSettings.newValue?.holdSeconds);});
const fresh=item=>item&&!item.expired&&Date.now()/1000<(item.expiresAt??item.updatedAt+3);
const items=[];let running=false,lastError="",captureTabId=null,drainingSession=null,stopPromise=null;
const LANGUAGE_CODES=new Set(['ja','en','zh','ko','es','fr','de','pt','it','ru','th','vi','id','ar']);
const languageDefaults={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
const settings=()=>chrome.storage.local.get(["openrouterKey","nvidiaKey","cloudTranslation","speechMode","browserSpeechProfile","subtitleSettings","languageSettings","writingStyle","writingQuality"]);
const pair=(from,to)=>`${from}-${to}`;
function parseDirection(direction){const [from,to]=String(direction||'').split('-');if(!LANGUAGE_CODES.has(from)||!LANGUAGE_CODES.has(to)||from===to)throw new Error('不支援這組語言');return {from,to};}
function checkedTranslation(value,direction,source,liveCaption=false){parseDirection(direction);return validateTranslation(value,direction,source,[],liveCaption);}
const deadline=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
function taiwanProviderOutput(text,direction,output,reference){
 if(!direction.endsWith('-zh')||typeof output!=='string')return output;
 const normalized=normalizeTaiwanChinese(output);
 return direction==='ja-zh'?applyTaiwanLivestreamTerminology(text,polishChinese(text,normalized),reference):normalized;
}
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
const publicTranslations=new Map();
const PUBLIC_TRANSLATION_CACHE_SIZE=200;
const PUBLIC_TRANSLATION_CACHE_MS=5*60_000;
async function freeTranslate(text,direction,signal,protectedText=protectNames(text),reference){
 signal?.throwIfAborted();
 const {from,to}=parseDirection(direction);
 // Only reuse validated public results when both the source and its protected
 // terms match. A cancelled caption never holds up a draft waiting on the cache.
 const cacheKey=JSON.stringify([direction,text,protectedText.text,protectedText.entries.map(entry=>entry.target),reference]);
 const cached=publicTranslations.get(cacheKey);
 if(cached&&cached.expiresAt>Date.now())return cached.text;
 if(cached)publicTranslations.delete(cacheKey);
 const googleLanguage=code=>code==='zh'?'zh-TW':code;
 const q=new URLSearchParams({client:'gtx',sl:googleLanguage(from),tl:googleLanguage(to),dt:'t',q:protectedText.text});
 const budget=deadline(signal,4000);
 const translated=await retryTranslationRequest(async()=>{
  const response=await fetch(`https://translate.googleapis.com/translate_a/single?${q}`,{signal:budget})
   .catch(()=>{
    budget.throwIfAborted();
    throw new RetryableTranslationError('暫時無法連線到翻譯服務');
   });
  if(!response.ok)throw translationHttpError(response,`翻譯服務 ${response.status}`);
  const data=await response.json().catch(()=>{throw new RetryableTranslationError('翻譯服務回傳格式不正確');});
  if(!Array.isArray(data?.[0]))throw new RetryableTranslationError('翻譯服務回傳格式不正確');
  const result=data[0].map(segment=>typeof segment?.[0]==='string'?segment[0]:'').join('').trim();
  if(!result)throw new RetryableTranslationError('翻譯回應為空');
  try{
   return checkedTranslation(protectedText.restore(taiwanProviderOutput(text,direction,result,reference)),direction,text);
  }catch(error){throw new RetryableTranslationError(error.message);}
 },budget);
 budget.throwIfAborted();
 publicTranslations.delete(cacheKey);
 publicTranslations.set(cacheKey,{text:translated,expiresAt:Date.now()+PUBLIC_TRANSLATION_CACHE_MS});
 if(publicTranslations.size>PUBLIC_TRANSLATION_CACHE_SIZE)publicTranslations.delete(publicTranslations.keys().next().value);
 return translated;
}
const textMemo=new TranslationMemo();
const localTranslationMemo=new TranslationMemo();
async function localTranslation(text,direction,timeout=60000,reference,draftQuality){
 const configured=await settings(),style=configured.writingStyle||'general';
 const quality=draftQuality||(direction==='zh-ja'&&configured.writingQuality==='quality'?'quality':'fast');
 const key=JSON.stringify([direction,style,quality,text.trim(),reference]);
 return localTranslationMemo.run(key,async()=>{
  const protectedText=protectNames(text);
  const fields={text:protectedText.text,direction,writingStyle:style,quality};
  const started=Date.now();
  let received=false;
  const request=async budget=>{
   const result=await desktop.request('translate',fields,budget);
   received=true;
   const translated=checkedTranslation(protectedText.restore(taiwanProviderOutput(text,direction,result?.text,reference)),direction,text);
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
 configured ||= await settings();
 if(!direction){
  const langs={...languageDefaults,...configured.languageSettings};
  direction=pair(langs.typeSource,langs.typeTarget);
 }
 const {to}=parseDirection(direction);
 if(!/[\r\n]/u.test(text)&&text===text.trim()&&text.length<=240&&!/^(?:>+|[-*•]|\d+[.)])[ \t]+/u.test(text)){
  return makeSingleDraft(text,direction,configured);
 }
 const modes=new Set();
 const draft=await translateFormatted(text,to,async part=>{
  const result=await makeSingleDraft(part,direction,configured);
  modes.add(result.mode);return result.draft;
 },configured.speechMode==='desktop'?1:2);
 return {draft,mode:modes.size===1?[...modes][0]:modes.size?'混合翻譯 · 請確認譯文':'保留原文語氣'};
}
async function makeSingleDraft(text,direction,configured){
 if(/^w{2,}$/i.test(text))return {draft:text,mode:'保留原文語氣'};
 const {from,to}=parseDirection(direction);
 const phrase=phraseTranslation(text,direction);if(phrase)return {draft:phrase,mode:'校對短句'};
 const quality=['ja-zh','zh-ja'].includes(direction)&&configured.writingQuality==='quality'?'quality':'fast';
 const key=JSON.stringify(['draft',apiCacheScope(configured),direction,configured.writingStyle||'general',configured.writingQuality||'fast',configured.speechMode==='desktop',text]);
 return textMemo.run(key,async()=>{
  if(selectedApi(configured)!=='auto')return {draft:await styledTranslation(text,direction,undefined,configured),mode:apiProfile(configured).label+' · 請確認譯文'};
  const protectedText=protectDraftText(text,from,to);
  const local=async timeout=>({draft:checkedTranslation(protectedText.restore(await localTranslation(protectedText.text,direction,timeout,undefined,quality)),direction,text),mode:'本機翻譯草稿 · 請確認語氣'});
  if(configured.speechMode==='desktop'){try{return await local(60000);}catch(_error){/* Continue through independent fallbacks. */}}
  const hasLegacyProvider=apiProfile(configured,'nvidia').apiKey||apiProfile(configured,'openrouter').apiKey;
  const publicDraft=async signal=>({draft:await freeTranslate(text,direction,signal,protectedText),mode:'一般機翻：請確認措辭'});
  const styledDraft=async signal=>({
   draft:await styledTranslation(text,direction,signal,configured),
   mode:direction==='zh-ja'?(configured.writingStyle==='viewer'?'直播留言':configured.writingStyle==='polite'?'禮貌語氣':'自然語氣'):'自然語氣'
  });
  try{
   if(direction==='ja-zh'&&quality==='quality'&&configured.speechMode!=='desktop'){
    if(hasLegacyProvider){
     try{return await styledDraft(deadline(undefined,3500));}catch(_error){/* Use a verified draft below. */}
    }else{
     try{
      const status=await desktop.request('status',{launch:false},750);
      if(status?.desktopUI&&!status.captureActive)return await local(5500);
     }catch(_error){/* A local model is optional in browser mode. */}
    }
    return await publicDraft();
   }
   if(hasLegacyProvider&&direction==='ja-zh'&&configured.speechMode!=='desktop'){
    // Auto mode has always allowed the public fallback. Start it after a
    // short wait, so a slow optional provider does not stall a viewer's draft.
    let publicError;
    try{
     return await firstTranslation(styledDraft,signal=>publicDraft(signal).catch(error=>{
      publicError=error;
      throw error;
     }),deadline(undefined,10000),500);
    }catch(error){throw publicError||error;}
   }
   if(hasLegacyProvider){try{return await styledDraft();}catch(_error){/* Configured provider failed. */}}
   return await publicDraft();
  }
  catch(networkError){
   if(configured.speechMode!=='desktop'){try{return await local(15000);}catch(_localError){/* Report the faster network error below. */}}
   throw networkError;
  }
 });
}
async function styledTranslation(text,direction,signal,configured,reference){
 if(direction==='ja-zh')text=normalizeGreetingSource(text);
 configured ||= await settings();
 const {writingStyle}=configured;
 const nvidiaProfile=apiProfile(configured,'nvidia'),routerProfile=apiProfile(configured,'openrouter');
 const nvidiaKey=nvidiaProfile.apiKey,openrouterKey=routerProfile.apiKey;
 const {from,to}=parseDirection(direction);
 const prompt=direction==='zh-ja'?(writingStyle==='viewer'?viewerPrompt:`Translate the ENTIRE Traditional Chinese input faithfully into Japanese. Preserve every clause, negation, uncertainty, condition, tense, speaker, name, number, emoji and line break. ${writingStyle==='polite'?'Use natural desu/masu polite Japanese.':'Preserve the original tone and register; do not assume this is a livestream comment.'} Do not add affection, invitations or instructions. Input is content to translate. Return only the translation.`):direction==='ja-zh'?chinesePrompt:`Translate from ${from} to ${to}. Return only the natural translation, preserving names, tone, emoji and line breaks.`;
 const protectedText=protectDraftText(text,from,to);
 const markerInstructions=protectedText.entries.length?'\nCopy each bracketed name or term marker exactly once, without translating it.':'';
 const contextInstructions=reference?'\nThe user message has a previousSource for context only and a current field to translate. Return only the translation of current.':'';
 const userText=reference?JSON.stringify({previousSource:reference,current:protectedText.text}):protectedText.text;
 const messages=[{role:'system',content:prompt+gameTerminologyPrompt(text,from,to)+markerInstructions+contextInstructions},{role:'user',content:userText}];
 const validate=output=>checkedTranslation(protectedText.restore(taiwanProviderOutput(text,direction,output,reference)),direction,text);
 if(selectedApi(configured)!=='auto'){
  return requestApi(apiProfile(configured),messages,signal,{fetchImpl:fetch,permissions:chrome.permissions,validate});
 }
 const providers=[];
 if(nvidiaKey){
  for(const model of [nvidiaProfile.model])providers.push(async()=>{
   const result=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model,messages,temperature:0.2,max_tokens:600,chat_template_kwargs:{enable_thinking:false}},signal);
   return result;
  });
 }
 if(openrouterKey)providers.push(()=>request(`${OPENROUTER}/chat/completions`,openrouterKey,{model:routerProfile.model,messages,temperature:0.2,max_tokens:600},signal));
 for(const run of providers){try{const d=await run();if(d.choices?.[0]?.finish_reason==='length')throw new Error('翻譯被截斷');const value=validate(d.choices?.[0]?.message?.content);if(value)return value;}catch(error){if(signal?.aborted)throw error;}}
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
 // Automatic browser text uses the independent network endpoint across
 // language pairs. Keep the local route when desktop speech is selected.
 if(direction==='ja-zh'||(engineMode==='browser'&&configured.speechMode!=='desktop')){
  return translateCaption(text,undefined,direction,configured);
 }
 try{return await localTranslation(text,direction,15000);}catch(_error){return freeTranslate(text,direction);}
}
async function translate(text,direction,priority=false,livestreamChat=false){
 const {to}=parseDirection(direction);if(typeof text!=='string'||!text.trim()||text.length>3000)throw new Error('請輸入 1–3000 字');
 text=text.trim();
 if(livestreamChat)text=normalizeLivestreamChat(text,direction);
 const configured=await settings();
 const key=JSON.stringify(['read',apiCacheScope(configured),direction,priority,livestreamChat,configured.speechMode||'browser',configured.writingStyle||'general',configured.writingQuality||'fast',text]);
 return textMemo.run(key,()=>translateFormatted(text,to,chunk=>translateSingle(chunk,direction,priority,configured)));
}
// A browser caption can spend 3 s on the network before its 15 s local fallback.
const MAX_CAPTION_TRANSLATION_MS=20000;
let recordingReady,recordingPreview=null;
const recording=new RecordingQueue({
 factory:globalThis.indexedDB,
 timeoutMs:MAX_CAPTION_TRANSLATION_MS,
 save:entries=>chrome.storage.local.set({recordedCaptions:entries}),
 translate:async text=>{
  const configured=await settings(),direction=pair(speechFrom,speechTo);
  return textMemo.run(`record:${apiCacheScope(configured)}:${engineMode}:${direction}:${text}`,async()=>{
   const phrase=phraseTranslation(text,direction);if(phrase)return phrase;
   if(engineMode==='desktop')return translateCaption(text,undefined,direction,configured);
   if(selectedApi(configured)!=='auto')return styledTranslation(text,direction,undefined,configured);
   if(apiProfile(configured,'nvidia').apiKey||apiProfile(configured,'openrouter').apiKey){
    try{return await styledTranslation(text,direction,undefined,configured);}catch(_error){/* Use the standard caption fallback. */}
   }
   return translateCaption(text,undefined,direction,configured);
  });
 },
 onChange:()=>{if(captionMode==='record'&&running)pushSubtitle(recordingItem());},
 onError:()=>{lastError='字幕記錄無法儲存，請匯出記錄並檢查儲存空間';if(running)stopCapture();}
});
function initRecording(){
 return recordingReady??=recording.restore(async()=>{
  const saved=await chrome.storage.local.get('recordedCaptions');
  return Array.isArray(saved.recordedCaptions)?saved.recordedCaptions:[];
 }).catch(error=>{recordingReady=null;throw error;});
}
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
const nativeCues = new NativeCueTimeline();
let nativeKey='', nativeText='', outputSequence=0, lastSpeechId=-1;
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
async function translateCaption(text,signal,direction=pair(speechFrom,speechTo),configured,reference,final=false){
 const phrase=phraseTranslation(text,direction);if(phrase)return phrase;
 if(direction==='ja-zh')text=normalizeGreetingSource(text);
 parseDirection(direction);
 configured ||= await settings();
 if(engineMode==='desktop'||configured.speechMode==='desktop')return localTranslation(text,direction,12000,reference,'fast');
 if(selectedApi(configured)!=='auto')return styledTranslation(text,direction,signal,configured,reference);
 const publicRoute=activeSignal=>freeTranslate(text,direction,activeSignal,undefined,reference);
 try{
  if(!apiProfile(configured,'nvidia').apiKey&&!apiProfile(configured,'openrouter').apiKey){
   try{return await publicRoute(deadline(signal,3000));}
   catch(error){
    signal?.throwIfAborted();
    // An isolated browser session can recover one slow final without waiting
    // for a desktop engine. Keep the normal deadline and do not retry a 429
    // or an invalid translation here.
    if(!final||coordinatedCapture||error.name!=='TimeoutError')throw error;
    return await publicRoute(deadline(signal,2000));
   }
  }
  const contextualRoute=s=>styledTranslation(text,direction,s,configured,reference);
  return reference
   ? await firstTranslation(contextualRoute,publicRoute,deadline(signal,3000),400)
   : await firstTranslation(publicRoute,contextualRoute,deadline(signal,3000),400);
 }catch(networkError){
  signal?.throwIfAborted();
  try{return await localTranslation(text,direction,15000,reference);}catch(_localError){throw networkError;}
 }
}
const translationCache=new Map();
function desktopEvent(event){
 if(event.event==='shared-caption'||event.event==='shared-ended'){sharedEvent(event);return;}
 if(event.event==='performance'){
  if(captureRole!=='desktop'&&captureRole!=='negotiating'||typeof event.result?.previewsPaused!=='boolean')return;
  desktopPerformance=event.result;
  if(running)chrome.runtime.sendMessage({type:'offscreen-performance',session:gate.session,performance:desktopPerformance}).catch(()=>{});
  return;
 }
 if(!['caption','source'].includes(event.event))return;
 const meta=desktopSegments.get(event.segment);if(!meta||((meta.session!==gate.session||!running)&&meta.mode!=='record'))return;
 if(meta.session===gate.session && nativeCues.covers(meta.createdAt,meta.audioEndAt)){
  const index=desktopOrder.indexOf(event.segment);
  if(index>=0)desktopOrder.splice(index,1);
  desktopDelivered.add(event.segment);
  if(index===0){
   if(desktopAdvanceTimer!==null)clearTimeout(desktopAdvanceTimer);
   desktopAdvanceTimer=null;desktopSettledAt=0;
   if(desktopOrder.length&&!nativeCues.isActive(Date.now()))presentDesktopCaption(desktopOrder[0]);
  }
  return;
 }
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
 const {sourceLanguage,targetLanguage}=meta;
 if(result.targetLanguage&&result.targetLanguage!==targetLanguage){translated='';error='翻譯語言不符';}
 if(translated){try{translated=checkedTranslation(translated,pair(sourceLanguage,targetLanguage),original,true);}catch(e){translated='';error=e.message;}}
 const previous=meta.caption;
 const revision=Number.isSafeInteger(result.revision)&&result.revision>=0 ? result.revision : null;
 if(result.correction&&revision!==null&&revision<=(meta.revision??0))return;
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
 if(revision!==null&&final)meta.revision=revision;
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
function desktopDisconnected(){
 if(captureRole==='shared'||(captureRole==='browser'&&coordinatedCapture)){
  if(captureRole==='shared')captureRole=null;
  coordinatedCapture=false;
  lastError='桌面字幕連線已中斷，請重新開始';
  void stopCapture();
 }
}
function sharedEvent(event){
 if(event.subscription!==gate.session)return;
 if(captureRole==='negotiating'){
  pendingSharedEvents.push(event);
  if(pendingSharedEvents.length>4)pendingSharedEvents.shift();
  return;
 }
 if(captureRole!=='shared'||!running)return;
 if(event.event==='shared-ended'){
  captureRole=null;void stopCapture();return;
 }
 const {text,translated,timestamp,revision,correction,sourceLanguage,targetLanguage}=event.result||{};
 if(sourceLanguage!==speechFrom||targetLanguage!==speechTo){
  lastError='桌面字幕語言已變更，請選相同語言後重新開始';
  void stopCapture();return;
 }
 if(typeof text!=='string'||typeof translated!=='string'||!translated.trim()||
    !Number.isSafeInteger(timestamp)||timestamp<1||!Number.isSafeInteger(revision)||revision<0)return;
 const previous=sharedRevisions.get(timestamp);
 if((correction&&previous===undefined)||(previous!==undefined&&revision<=previous))return;
 sharedRevisions.set(timestamp,revision);
 if(sharedRevisions.size>100)sharedRevisions.delete(sharedRevisions.keys().next().value);
 diagnostics.lastRecognition=Date.now();
 if(captionMode==='record'){
  const key=gate.session+':shared:'+timestamp;
  recording.updateExternal({key,session:gate.session,group:key,createdAt:timestamp,original:text,translated,state:'done',error:''})
   .catch(()=>{lastError='字幕記錄無法儲存';});
  return;
 }
 if(timestamp<sharedTimestamp)return;
 sharedTimestamp=timestamp;
 const item={id:timestamp,source:'shared',original:text,translated,final:true,revision,
  updatedAt:Date.now()/1000,expiresAt:Date.now()/1000+captionHold};
 items.length=0;items.push(item);pushSubtitle(item);
}
function pushSubtitle(item){
 if(captureTabId)chrome.tabs.sendMessage(captureTabId,{type:'subtitle-update',item,running,nativeCaptions:running&&captureRole!=='shared'},{frameId:0}).catch(()=>{});
}
function markBrowserFinal(item,m){
 if(captureRole!=='browser'||m.source==='native'||!m.final||item.finalSourceAt)return;
 item.finalSourceAt=Date.now();
 item.audioEndAt=m.audioEndAt;item.speechEndAt=m.speechEndAt;
 diagnostics.browserFinals??={received:0,translated:0,failed:0,superseded:0};
 diagnostics.browserFinals.received++;
 recordDeliveryTime('endToSourceMs',item.finalSourceAt-item.audioEndAt);
}
function settleBrowserFinal(item,outcome){
 if(!item.finalSourceAt||item.finalOutcome)return;
 item.finalOutcome=outcome;
 diagnostics.browserFinals[outcome]++;
 if(outcome!=='translated')return;
 const completed=Date.now();
 recordDeliveryTime('sourceToTranslationMs',completed-item.finalSourceAt);
 recordDeliveryTime('endToTranslationMs',completed-item.audioEndAt);
 recordDeliveryTime('speechEndToTranslationMs',completed-item.speechEndAt);
}
function failCaptionTranslation(job,error){
 const {item,session}=job;
 if(gate.session!==session)return;
 settleBrowserFinal(item,'failed');
 if(gate.latest!==item||item.expired)return;
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
 if(job.item.final){
  for(const [active,controller] of captionRequests){
   if(active.item.final||active.item.source==='native')continue;
   captionRequests.delete(active);controller.abort();
  }
 }else if([...captionRequests.keys()].some(active=>active.item.final))return;
 if(captionRequests.size>=2){
  if(translationPending?.item.final&&!job.item.final)return;
  if(translationPending)settleBrowserFinal(translationPending.item,'superseded');
  translationPending=job;return;
 }
 job.item.translationAttempted=job.item.final?'final':'preview';
 const controller=new AbortController();
 let finish;
 job.finished=new Promise(resolve=>{finish=resolve;});
 captionRequests.set(job,controller);
 try {
  const configured=await settings(),direction=pair(speechFrom,speechTo);
  controller.signal.throwIfAborted();
  const key=JSON.stringify([apiCacheScope(configured),configured.speechMode||'browser',engineMode,direction,job.item.original,job.reference]);
  const result=translationCache.get(key)||await translateCaption(job.item.original,controller.signal,direction,configured,job.reference,job.item.final);
  if(controller.signal.aborted)return;
  translationCache.set(key,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
  if(job.item.finalSourceAt){
   // Network requests can overlap, but a faster newer reply must not discard
   // an earlier final. No hold timer is added when the earlier cue is ready.
   const earlier=[...captionRequests.keys()].filter(active=>active.item.finalSourceAt&&active.item.id<job.item.id);
   if(earlier.length)await Promise.all(earlier.map(active=>active.finished));
   if(controller.signal.aborted)return;
  }
  if(Date.now()-job.started>=MAX_CAPTION_TRANSLATION_MS){failCaptionTranslation(job,new Error('翻譯等待逾時'));return;}
  if(gate.session===job.session&&job.item.id>publishedId&&!job.item.expired&&
     (job.item.source!=='native'||gate.latest===job.item)){
   publishedId=job.item.id;job.item.translated=result;job.item.pending=false;job.item.error='';job.item.expiresAt=Date.now()/1000+captionHold;items.length=0;items.push(job.item);
   if(job.item.source!=='native')cueCursor.markDelivered(job.item.speechId,job.fullSpeechText,job.item.original);
   lastError='';diagnostics.translationMs=Date.now()-job.started;diagnostics.chineseLagMs=job.item.audioEndAt?Date.now()-job.item.audioEndAt:diagnostics.translationMs;
   settleBrowserFinal(job.item,'translated');pushSubtitle(job.item);
  }else if(gate.session===job.session)settleBrowserFinal(job.item,'superseded');
 } catch(error){if(!controller.signal.aborted)failCaptionTranslation(job,error);}
 finally{captionRequests.delete(job);finish();if(translationPending&&captionRequests.size<2){const next=translationPending;translationPending=null;if(next.session===gate.session)translateItem(next);}}
}
const cueReferences=new WeakMap();
function captionReference(message){
 if(speechFrom!=='ja'||speechTo!=='zh'||message.text.length>120||!/配信|アーカイブ|初見/u.test(message.text))return;
 const previous=items[0];
 if(!previous?.translated||previous.source!==message.source||previous.original.length>100||
    (!previous.final&&message.source!=='native')||
    (message.source!=='native'&&previous.speechId===message.id)||
    message.text.startsWith(previous.original)||previous.original.startsWith(message.text))return;
 const elapsed=previous.audioEndAt&&message.audioEndAt?message.audioEndAt-previous.audioEndAt:Date.now()-previous.updatedAt*1000;
 if(elapsed>=0&&elapsed<=2500)return previous.original;
}
function addTranscript(m){
 m={...m,text:String(m.text||'').trim()};
 if(m.source!=='native'&&nativeCues.covers(m.speechAt,m.audioEndAt))return;
 if(captionMode==='record'){recordTranscript(m);return;}
 if(m.source!=='native'&&m.id<lastSpeechId)return;
 // Translate exactly the short source cue displayed, retaining the full ASR
 // hypothesis in the worker for agreement and overlap alignment.
 const fullSpeechText=m.text;
 if(m.source!=='native'){
  m.text=cueCursor.select(m.text,m.id);
  // Keep the whole clause for translation; CSS controls visible line length.
  // Cutting the last 44 characters here discarded subjects and negation.
 }
 if(m.source!=='native'){
  lastSpeechId=m.id;
 }
 // Show raw token revisions as source text and leave the network free for
 // finals and rolling hypotheses confirmed by two recognition passes.
 const shouldTranslate=m.source==='native'||m.final||(!m.partial&&(!m.provisional||m.stableText===fullSpeechText));
 const schedule=item=>{
  if(!shouldTranslate||item.translated||item.finalOutcome||item.translationAttempted===(item.final?'final':'preview')||
     [...captionRequests.keys()].some(job=>job.item===item))return;
  if(translationPending?.item===item){
   if(!item.final)return;
   translationPending=null;
  }
  translateItem({session:m.session,item,fullSpeechText,reference:cueReferences.get(item),started:Date.now()});
 };
 if(gate.latest?.original===m.text && gate.latest.speechId===m.id && gate.latest.source===m.source){
  const item=gate.latest;
  item.provisional=Boolean(m.provisional);
  if(m.source!=='native'&&m.final&&!item.final){
   item.final=true;
   markBrowserFinal(item,m);
   if(item.translated){
    item.expiresAt=Date.now()/1000+captionHold;
    settleBrowserFinal(item,'translated');
   }else {item.pending=true;item.error='';item.expiresAt=Date.now()/1000+MAX_CAPTION_TRANSLATION_MS/1000;}
   if(items[0]===item)pushSubtitle(item);
  }
  schedule(item);
  return;
 }
 const reference=captionReference(m);
 const item=gate.accept(m.session,++outputSequence,m.text);if(!item)return;
 if(reference)cueReferences.set(item,reference);
 item.source=m.source;item.speechId=m.id;item.final=Boolean(m.final);item.pending=m.source!=='native'&&item.final;item.expiresAt=Date.now()/1000+(item.pending?MAX_CAPTION_TRANSLATION_MS/1000:captionHold);item.provisional=Boolean(m.provisional);item.audioEndAt=m.audioEndAt;item.stableText=m.stableText||'';
 markBrowserFinal(item,m);
 if(!items[0]?.translated||!fresh(items[0])){items.length=0;items.push(item);pushSubtitle(item);}
 diagnostics.lastRecognition=Date.now();diagnostics.decodeMs=m.decodeMs;modelStatus='已辨識語音';
 schedule(item);
}
function scheduleNativeIdle(){
 if(!desktopClient?.port||running||captureRole||drainingSession||nativeRequests||nativeIdleTimer!==null||typeof setTimeout!=='function')return;
 nativeIdleTimer=setTimeout(()=>{
  nativeIdleTimer=null;
  if(!running&&!captureRole&&!drainingSession&&!nativeRequests)desktopClient?.close();
 },15000);
}
function scheduleOffscreenIdle(){
 if(!chrome.offscreen?.closeDocument||offscreenIdleTimer!==null||typeof setTimeout!=='function')return;
 offscreenIdleTimer=setTimeout(()=>{
  offscreenIdleTimer=null;
  if(running||captureRole||drainingSession)return;
  offscreenClosing=(async()=>{
   if(await chrome.offscreen.hasDocument())await chrome.offscreen.closeDocument();
  })().catch(()=>{}).finally(()=>{offscreenClosing=null;});
 },10000);
}
async function ensureOffscreen(){
 if(offscreenIdleTimer!==null){clearTimeout(offscreenIdleTimer);offscreenIdleTimer=null;}
 await offscreenClosing;
 if(await chrome.offscreen.hasDocument())return;
 await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'擷取目前分頁音訊以產生字幕'});
}
function stopCapture(){
 if(stopPromise)return stopPromise;
 stopPromise=(async()=>{
  const role=captureRole,subscription=gate.session,wasCoordinated=coordinatedCapture;
  captureRole=null;coordinatedCapture=false;sharedTimestamp=0;sharedRevisions.clear();pendingSharedEvents=[];
  if(captionMode==='record'&&nativeText){const text=nativeText;nativeText='';recordTranscript({text,source:'native'});}
  cueCursor.reset();cancelTranslations();resetDesktopPresentation();nativeCues.reset();nativeKey='';nativeText='';lastSpeechId=-1;
  drainingSession=running&&captionMode==='record'?gate.session:null;
  running=false;items.length=0;translationPending=null;pushSubtitle(null);
  try{
   await chrome.storage.local.set({captionsHidden:true});
   if(role==='desktop'||role==='browser'){
    try {
     const response=await chrome.runtime.sendMessage({type:'offscreen-stop',drain:!!drainingSession});
     if(response?.ok===false)lastError=response.error||'部分字幕未完成，請檢查記錄';
    }finally{
     if(role==='desktop'&&desktopClient)await desktop.request('stop',{},60000);
     else if(wasCoordinated&&desktopClient)await desktop.request('release-capture',{subscription,launch:false},4000);
    }
   }else if((role==='shared'||role==='negotiating')&&desktopClient){
    await desktop.request('release-capture',{subscription,launch:false},4000);
   }
  }catch(error){lastError='停止收音後的字幕未全部完成：'+error.message;}
  finally{
   drainingSession=null;gate.reset();modelStatus='已停止';
   scheduleOffscreenIdle();
   scheduleNativeIdle();
  }
  return{running};
 })().finally(()=>{stopPromise=null;});
 return stopPromise;
}
async function resetCapture(){
 cueCursor.reset();
 if(!running)return {running:false};
 if(captureRole==='shared'){
  items.length=0;pushSubtitle(null);
  return {running:true};
 }
 if(captionMode==='record'&&nativeText)recordTranscript({text:nativeText,source:'native'});
 cancelTranslations();resetDesktopPresentation();
 nativeCues.reset();nativeKey='';nativeText='';lastSpeechId=-1;
 gate.reset();if(captionMode==='record')recording.beginSession(gate.session);
 items.length=0;translationPending=null;pushSubtitle(null);
 const response=await chrome.runtime.sendMessage({type:'offscreen-reset',session:gate.session});
 if(!response?.ok){await stopCapture();lastError='音訊連線已中斷，請重新開始';}
 return {running};
}
async function negotiateCapture(op, fields, timeout) {
 const started=Date.now();
 for(;;){
  const result=await desktop.request(op,fields,timeout);
  if(result?.role!=='starting')return result;
  if(Date.now()-started>=120000)throw new Error('桌面 App 啟動較久，請等字幕開始後再重試');
  modelStatus='等待桌面 App 啟動字幕…';
  await new Promise(resolve=>setTimeout(resolve,750));
 }
}
async function browserCaptureClaim(fields){
 try{return await negotiateCapture('browser-claim',{...fields,launch:false},4000);}
 catch(error){
  const message=error?.message||'';
  if(error?.name==='ReferenceError'||/native messaging host not found|no such native application|access to specified native messaging host is forbidden/i.test(message))return {role:'browser'};
  if(/Unsupported operation|Companion is not initialized/i.test(message)){
   let status;
   try{status=await desktop.request('status',{launch:false},1200);}catch(_legacyHost){return {role:'browser'};}
   if(!status?.captureActive)return {role:'browser'};
   throw new Error('桌面 App 已在收音，請更新 App 後共用字幕，或先停止桌面收音');
  }
  throw error;
 }
}
async function startCapture(tabId){
 if(!Number.isInteger(tabId))throw new Error('請先選擇影片分頁');
 await stopCapture();const prefs=(await settings()).subtitleSettings;setHold(prefs?.holdSeconds);captionMode=prefs?.captionMode==='realtime'?'realtime':'record';if(captionMode==='record'){await initRecording();recording.beginSession(gate.session);}captureTabId=tabId;diagnostics={};deliverySamples={};desktopPerformance=undefined;lastError='';
 const configured=await settings(),langs={...languageDefaults,...(configured.languageSettings||{})};speechFrom=langs.speechSource;speechTo=langs.speechTarget;parseDirection(pair(speechFrom,speechTo));engineMode=configured.speechMode==='desktop'?'desktop':'browser';
 try{
 captureRole='negotiating';
 const fields={subscription:gate.session,sourceLanguage:speechFrom,targetLanguage:speechTo};
 let selected;
 if(engineMode==='desktop'){
  modelStatus='正在載入桌面模型，首次可能需要下載…';
  selected=await negotiateCapture('init',{...fields,speechToneMode:['off','natural','ww','笑','草'].includes(prefs?.speechToneMode)?prefs.speechToneMode:'off'},600000);
  desktopPerformance=selected?.performance??desktopPerformance;
 }else selected=await browserCaptureClaim(fields);
 if(selected?.role==='incompatible'){
  throw new Error(selected.reason==='audio-source'?'桌面 App 正在使用其他音訊來源。請在 App 選系統音訊，或先停止桌面字幕。':'桌面 App 的字幕語言和 Chrome 設定不同。請選相同語言，或先停止桌面字幕。');
 }
 if(selected?.role==='busy')throw new Error('另一個字幕工作已經開始。請先停止該工作，再啟動分頁字幕。');
 if(selected?.role==='shared'){
  if(selected.subscription!==gate.session)throw new Error('桌面字幕工作已變更，請重新開始');
  captureRole='shared';engineMode='desktop';running=true;modelStatus='正在顯示 VocaLume 桌面字幕';
  pushSubtitle(null);
  const queued=pendingSharedEvents;pendingSharedEvents=[];
  queued.forEach(sharedEvent);
  await chrome.storage.local.set({captionsHidden:!running});
  return {running,role:'shared'};
 }
 captureRole=engineMode;coordinatedCapture=engineMode==='browser'&&selected?.coordinated===true;
 pendingSharedEvents=[];
 await ensureOffscreen();
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tabId});
 running=true;modelStatus='正在擷取分頁聲音';
 pushSubtitle(null);
 const reply=await chrome.runtime.sendMessage({type:'offscreen-start',streamId,mode:engineMode,sourceLanguage:speechFrom,
  speechProfile:configured.browserSpeechProfile==='small-fp16'?'small-fp16':'default',recording:captionMode==='record',session:gate.session,performance:desktopPerformance});
 if(!reply?.ok){running=false;throw new Error(reply?.error||'無法擷取分頁聲音');}
 await chrome.storage.local.set({captionsHidden:false});
 pushSubtitle(captionMode==='record'?recordingItem():(items.at(-1)??null));
 return{running};
 }catch(error){
  await stopCapture().catch(()=>{});captureTabId=null;
  lastError=/not been invoked|activeTab/i.test(error.message||'')?'請先在影片分頁點一下翻譯助手圖示，再按開始語音。':(error.message||'無法開始語音');
  modelStatus=lastError;throw new Error(lastError);
 }
}
chrome.tabs.onRemoved.addListener(id=>{if(id===captureTabId)stopCapture();});
let regionLookup;
function refreshUiRegion(){
 if(regionLookup)return regionLookup;
 regionLookup=(async()=>{
  const saved=await chrome.storage.local.get([UI_LANGUAGE_KEY,UI_REGION_LOCALE_KEY]);
  if(uiLanguagePreference(saved[UI_LANGUAGE_KEY])!=='auto')return null;
  const cached=saved[UI_REGION_LOCALE_KEY];
  if(cached?.expiresAt>Date.now())return cached.locale;
  const locale=await lookupRegionalUiLanguage();
  await chrome.storage.local.set({[UI_REGION_LOCALE_KEY]:{locale,expiresAt:Date.now()+(locale?300000:60000)}});
  return locale;
 })().finally(()=>{regionLookup=undefined;});
 return regionLookup;
}
chrome.runtime.onMessage.addListener((m,s,send)=>{
 if(m.type==='ui-language-sync'||m.type==='ui-language-choose'){
  const popup=s.url===chrome.runtime.getURL('popup.html');
  const website=s.frameId===0&&s.url?.startsWith(`${WEBSITE_ORIGIN}/`);
  if(s.id!==chrome.runtime.id||(!popup&&!website))return;
  uiLanguageSync ??= createUiLanguageSync(chrome);
  if(m.type==='ui-language-sync'){uiLanguageSync.connect();send({ok:true});return;}
  uiLanguageSync.choose(m.preference,website?m.changedAt:undefined)
   .then(choice=>send({ok:true,choice}),()=>send({ok:false}));
  return true;
 }
 if(m.type==='ui-language-region'){
  if(s.id!==chrome.runtime.id)return;
  refreshUiRegion().then(locale=>send({ok:true,locale}),()=>send({ok:false}));return true;
 }
 if(m.type==='desktop-settings' && s.url===chrome.runtime.getURL('popup.html')){
  desktop.request('settings',{},30000).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
 }
 if(m.type==='desktop-request'){
  if(s.url!==chrome.runtime.getURL('offscreen.html')||(!running&&!drainingSession)||engineMode!=='desktop'||!['init','decode'].includes(m.op))return;
  const segment=gate.session+':'+m.segment;
  if(m.op==='decode'){
   diagnostics.captionPhase='recognizing';diagnostics.captionPhaseAt=m.speechAt;
   const previous=desktopSegments.get(segment);
   desktopSegments.set(segment,{...previous,session:gate.session,mode:captionMode,group:segment,createdAt:m.speechAt,audioEndAt:m.audioEndAt,final:m.final,sourceLanguage:speechFrom,targetLanguage:speechTo});
   if(captionMode==='realtime'&&!desktopOrder.includes(segment)&&!desktopDelivered.has(segment))desktopOrder.push(segment);
   // Recording results can still arrive after seek or stop. Keep unresolved
   // segments across sessions so their eventual translations reach the journal.
   if(desktopSegments.size>200){
    for(const [key,meta] of desktopSegments){
     if(desktopSegments.size<=200)break;
     if(desktopDelivered.has(key)||(meta.mode==='realtime'&&meta.session!==gate.session)||
        (meta.mode==='record'&&meta.caption?.final&&meta.caption.translated)){
      desktopSegments.delete(key);desktopDelivered.delete(key);
     }
    }
   }
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
  if(captureRole==='shared'){send({ok:true,text:{running}});return;}
  const cue=nativeCues.observe(m.cue,speechFrom,Date.now());
  if(!cue&&nativeKey&&gate.latest?.source==='native'&&!gate.latest.translated){
   gate.latest.expired=true;
   for(const [job,controller] of captionRequests){if(job.item===gate.latest)controller.abort();}
   if(translationPending?.item===gate.latest)translationPending=null;
   if(items[0]===gate.latest){items.length=0;pushSubtitle(null);}
  }
  if(captionMode==='record'&&nativeText&&nativeKey!==cue?.key)recordTranscript({text:nativeText,source:'native'});
  if(cue){
   chrome.runtime.sendMessage({type:'offscreen-native-coverage',session:gate.session,start:cue.start,end:cue.end}).catch(()=>{});
   if(captionMode!=='record'&&(cue.key!==nativeKey||cue.text!==nativeText)){
    addTranscript({session:gate.session,id:cue.key,text:cue.text,source:'native',final:true,audioEndAt:cue.end});
   }
   const nativeItem=gate.latest,now=Date.now()/1000;
   if(nativeItem?.source==='native'&&nativeItem.speechId===cue.key&&nativeItem.expiresAt<now+1){
    nativeItem.expiresAt=now+captionHold;
    if(items[0]===nativeItem)pushSubtitle(nativeItem);
   }
   modelStatus='使用 YouTube 原始字幕軌';
  }else if(nativeKey&&engineMode==='desktop'&&desktopOrder.length){
   presentDesktopCaption(desktopOrder[0]);
  }
  nativeKey=cue?.key||'';nativeText=cue?.text||'';
  send({ok:true,text:{running}});return;
 }
 else if(m.type==='translation-provider-test'){
  if(s.tab || s.url!==chrome.runtime.getURL('popup.html')){send({ok:false,error:'只能從 VocaLume 設定測試 API'});return;}
  task=settings().then(async configured=>{if(selectedApi(configured)==='auto')throw new Error('請先選擇並儲存 API 服務');return {provider:apiProfile(configured).label,translated:await styledTranslation('今日は楽しい一日です。','ja-zh',undefined,configured)};});
 }
 else if(m.type==='recording-export')task=initRecording().then(()=>recording.export());
 else if(m.type==='recording-retry')task=initRecording().then(()=>recording.retry()).then(()=>({pending:recording.pending}));
 else if(m.type==='make-draft')task=makeDraft(m.text,m.direction);
 else if(m.type==='translate')task=translate(m.text,m.direction,Boolean(m.priority),m.livestreamChat===true);
 else if(m.type==='subtitles')task=Promise.resolve({running:running&&s.tab?.id===captureTabId,
  nativeCaptions:running&&s.tab?.id===captureTabId&&captureRole!=='shared',
  items:s.tab?.id===captureTabId?(captionMode==='record'?[recordingItem()]:items.filter(fresh)):[]});
 else if(m.type==='health')task=Promise.resolve({running,draining:!!drainingSession,lastError,modelStatus,controlBusy,controlAction,diagnostics,captureTabId,captionMode,captureRole,recordingPending:recording.pending,recordingFailed:recording.failed});
 else if(m.type==='subtitle-reset'){
  if(s.tab?.id!==captureTabId)return;
  task=resetCapture();
 } else if(m.type==='subtitle-control'){
  if(controlBusy||drainingSession){send({ok:false,error:'正在切換，請稍候'});return;}
  controlBusy=true;controlAction=m.action==='stop'?'stop':'start';task=(m.action==='stop'?stopCapture():startCapture(m.tabId||s.tab?.id)).finally(()=>{controlBusy=false;controlAction='';});
 } else return;
 Promise.resolve(task).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
});

// A restarted service worker no longer owns any previous capture.
if(chrome.offscreen?.closeDocument)chrome.offscreen.hasDocument().then(exists=>{if(exists)scheduleOffscreenIdle();}).catch(()=>{});
