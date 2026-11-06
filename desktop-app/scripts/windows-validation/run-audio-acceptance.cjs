const {_electron:electron}=require('playwright'),{expect}=require('@playwright/test')
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
const assets=path.resolve(process.argv[2]||''),wav=path.resolve(process.argv[3]||''),output=path.resolve(process.argv[4]||''),mode=process.argv[5]||'system',noise=process.argv[6]==='noise'
if(!process.argv[4]||!['system','fixture'].includes(mode))throw new Error('Usage: node scripts/windows-validation/run-audio-acceptance.cjs ASSETS WAV OUTPUT [system|fixture] [noise]')
fs.mkdirSync(output,{recursive:true});const profile=fs.mkdtempSync(path.join(os.tmpdir(),'vocalume-audio-'))
fs.symlinkSync(path.join(assets,'models'),path.join(profile,'models'),'junction')
let app,filterReady=false
;(async()=>{
 const env={...process.env,JTL_UI_PROFILE:profile,SKIP_ONBOARDING:'1'};delete env.ELECTRON_RUN_AS_NODE
 app=await electron.launch({args:[path.resolve('scripts/windows-validation/acceptance-bootstrap.cjs'),'--autoplay-policy=no-user-gesture-required',...(mode==='fixture'?['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wav]:[])],env,timeout:60000})
 app.process().stdout?.on('data',v=>fs.appendFileSync(path.join(output,'private-runtime.log'),v));app.process().stderr?.on('data',v=>fs.appendFileSync(path.join(output,'private-runtime.log'),v))
 let page
 for(let i=0;i<200;i++){for(const w of app.windows())if(await w.locator('h1').count().catch(()=>0))page=w;if(page)break;await new Promise(r=>setTimeout(r,50))}
 assert.ok(page,'Settings window appeared')
 page.on('console',message=>{if(message.text().includes('[noise-suppression] DeepFilterNet3 initialized'))filterReady=true;fs.appendFileSync(path.join(output,'private-renderer.log'),message.type()+': '+message.text()+'\n')})
 await page.evaluate(noise=>window.api.saveSettings({sourceLanguage:'ja',targetLanguage:'zh',translationEngine:'offline-hymt15',sttEngine:'haas-ja-fast',noiseSuppressionEnabled:noise}),noise)
 await page.reload();await expect(page.getByRole('combobox',{name:'Source language',exact:true})).toHaveValue('ja')
 if(noise){await page.getByText('Audio options',{exact:true}).click();await expect(page.getByRole('checkbox',{name:'Enable noise suppression',exact:true})).toBeChecked()}
 await page.getByRole('combobox',{name:'Audio source',exact:true}).selectOption(mode==='system'?'system':'microphone')
 await page.evaluate(()=>{window.validationResults=[];window.validationStatuses=[];window.api.onTranslationResult(r=>window.validationResults.push(r));window.api.onStatusUpdate?.(s=>window.validationStatuses.push(s))})
 await page.getByRole('button',{name:'Start translation',exact:true}).click()
 await expect(page.getByRole('button',{name:'Stop translation',exact:true})).toBeVisible({timeout:120000})
 if(mode==='system')await page.evaluate(async url=>{window.validationPlayer=new Audio(url);await window.validationPlayer.play()},pathToFileURL(wav).href)
 // Only known public test speech is retained; system/room audio that does not
 // match this test phrase is never written to the public result artifact.
 await expect.poll(()=>page.evaluate(()=>window.validationResults.filter(r=>!r.isInterim&&/バルセロナ/.test(r.sourceText||'')).length),{timeout:60000}).toBeGreaterThan(0)
 const observed=await page.evaluate(()=>window.validationResults.filter(r=>!r.isInterim&&/バルセロナ/.test(r.sourceText||'')).map(r=>({sourceText:r.sourceText,translatedText:r.translatedText})))
 assert.ok(observed.some(r=>r.translatedText))
 if(noise)assert.ok(filterReady,'DeepFilterNet3 must initialize; raw-stream fallback is not a denoising pass')
 await page.getByRole('button',{name:'Stop translation',exact:true}).click();await expect(page.getByRole('button',{name:'Start translation',exact:true})).toBeEnabled({timeout:30000})
 await page.evaluate(()=>{window.validationPlayer?.pause();delete window.validationPlayer})
 fs.writeFileSync(path.join(output,'audio-results.json'),JSON.stringify({passed:true,mode,noise,filterReady,matchedPublicPhrase:true,captions:mode==='fixture'?observed:undefined,matchingFinalCaptions:observed.length},null,2))
 console.log('ACCEPTED '+mode+' audio capture → VAD → Haas-ja → local translation → captions; noise='+noise)
})().catch(async error=>{if(app)for(const w of app.windows())try{fs.appendFileSync(path.join(output,'private-failure-body.txt'),await w.textContent('body'))}catch{}fs.writeFileSync(path.join(output,'audio-results.json'),JSON.stringify({passed:false,mode,noise,error:String(error)},null,2));console.error(error);process.exitCode=1}).finally(async()=>{await app?.close()})
