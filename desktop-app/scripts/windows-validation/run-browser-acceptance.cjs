const {_electron:electron,chromium}=require('playwright'),{expect}=require('@playwright/test')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process')
const assets=path.resolve(process.argv[2]||''),output=path.resolve(process.argv[3]||'')
if(process.platform!=='win32'||!process.argv[3])throw new Error('Usage: node scripts/windows-validation/run-browser-acceptance.cjs ASSETS OUTPUT')
fs.mkdirSync(output,{recursive:true})
const root=path.resolve('../extension'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'vocalume-browser-app-'))
fs.symlinkSync(path.join(assets,'models'),path.join(profile,'models'),'junction')
const rows=[];let app,browser
const record=(name,details)=>{rows.push({name,passed:true,...details});fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(rows,null,2));console.log('ACCEPTED '+name)}
;(async()=>{
 const env={...process.env,JTL_UI_PROFILE:profile,SKIP_ONBOARDING:'1'};delete env.ELECTRON_RUN_AS_NODE
 app=await electron.launch({args:[path.resolve('scripts/windows-validation/acceptance-bootstrap.cjs')],env,timeout:60000})
 app.process().stdout?.on('data',bytes=>fs.appendFileSync(path.join(output,'app-private.log'),bytes));app.process().stderr?.on('data',bytes=>fs.appendFileSync(path.join(output,'app-private.log'),bytes))
 let settings
 for(let i=0;i<200;i++){for(const win of app.windows())if(await win.locator('h1').count().catch(()=>0))settings=win;if(settings)break;await new Promise(r=>setTimeout(r,50))}
 assert.ok(settings,'Desktop settings window appeared')
 await settings.evaluate(()=>window.api.saveSettings({sourceLanguage:'ja',targetLanguage:'zh',translationEngine:'offline-hymt15',draftTranslationEngine:'offline-hymt15',sttEngine:'haas-ja-fast',whisperVariant:'base'}))
 browser=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'vocalume-extension-')),{executablePath:process.env.VOCALUME_BROWSER_EXECUTABLE || path.resolve('../../browser-runtime/chrome-win64/chrome.exe'),headless:false,args:['--disable-extensions-except='+root,'--load-extension='+root]})
 let worker=browser.serviceWorkers()[0];if(!worker)worker=await browser.waitForEvent('serviceworker',{timeout:30000})
 const id=new URL(worker.url()).host
 execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'desktop/install-windows.ps1'),'-ExtensionId',id,'-App',path.resolve('../../installed-validation/VocaLume.exe')],{windowsHide:true,encoding:'utf8'})
 const popup=await browser.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');await popup.waitForLoadState('domcontentloaded')
 // Native messaging is the real Windows registry → launcher → host → App path.
 // Disable browser network so local-success assertions cannot use cloud fallback.
 await browser.setOffline(true)
 const status=await popup.evaluate(async()=>{const {NativeClient}=await import(chrome.runtime.getURL('native-client.mjs'));window.validationNative=new NativeClient(chrome.runtime);return window.validationNative.request('status')})
 assert.equal(status.desktopUI,true);record('Chrome extension installation and native host → running App',{extensionId:id,status})
 const translated=await popup.evaluate(()=>window.validationNative.request('translate',{text:'明日の配信は午後八時からです。今日は配信しません。',direction:'ja-zh',quality:'fast'},60000))
 assert.match(translated.text,/[\u4e00-\u9fff]/);record('browser native text translation without browser network',{translated:translated.text})
 const init=await popup.evaluate(()=>window.validationNative.request('init',{sourceLanguage:'ja',targetLanguage:'zh'},120000))
 assert.match(init.model,/haas-ja-fast/)
 const corpusRoot=path.resolve('../../haas-assets'),corpus=JSON.parse(fs.readFileSync(path.join(corpusRoot,'corpus.json'),'utf8')),sample=corpus.rows.find(r=>r.seconds>3&&r.seconds<10)
 const audio=fs.readFileSync(path.join(corpusRoot,'corpus',sample.id+'.f32')).toString('base64')
 const decoded=await popup.evaluate(audio=>window.validationNative.request('decode',{audio,final:true},120000),audio)
 assert.ok(decoded.text&&decoded.translated);record('browser native audio → Haas-ja → real local translation',{model:init.model,clip:sample.id,result:decoded})
 await popup.evaluate(()=>window.validationNative.request('stop'));await popup.evaluate(()=>{window.validationNative.close();delete window.validationNative})
 await new Promise(r=>setTimeout(r,500))
 await popup.evaluate(()=>chrome.storage.local.set({speechMode:'desktop',writingQuality:'fast',websiteTextOptInEnabled:true,languageSettings:{readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja'}}))
 const draft=await popup.evaluate(()=>chrome.runtime.sendMessage({type:'make-draft',text:'明天晚上八點開始直播，今天不直播。',direction:'zh-ja'}))
 assert.ok(draft.ok,JSON.stringify(draft));assert.match(draft.text.draft,/[\u3040-\u30ff]/);assert.match(draft.text.mode,/本機/)
 record('actual extension background reply-draft translation with cloud disabled',{draft:draft.text})
 // Physical microphone: open locally, inspect only signal statistics, then stop.
 // No room recording or transcript is written or uploaded.
 const mic=await settings.evaluate(async()=>{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true}),context=new AudioContext(),analyser=context.createAnalyser()
  context.createMediaStreamSource(stream).connect(analyser);await context.resume();await new Promise(r=>setTimeout(r,1000))
  const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples)
  const result={live:stream.getAudioTracks().every(t=>t.readyState==='live'),sampleRate:context.sampleRate,rms:Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length)}
  stream.getTracks().forEach(t=>t.stop());await context.close();return result
 })
 assert.ok(mic.live);record('physical Windows microphone opens and stops',{signalStatistics:mic})
})().catch(error=>{rows.push({name:'remaining browser flow',passed:false,error:String(error)});fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(rows,null,2));console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();await app?.close()})
