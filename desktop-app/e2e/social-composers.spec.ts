import {test, expect, chromium, type Browser, type Page} from '@playwright/test'
import {resolve} from 'node:path'

// Isolated local fixtures: all website requests are fulfilled here. "Send"
// records the editor's owned model; it never posts to a real account.
const source='今天不能參加，明天再來！😊'
const draft='今日は参加できません。\nまた明日来ます！😊'
const root=resolve(__dirname,'../../extension')
const platforms=[
  {name:'YouTube',host:'www.youtube.com',script:'content.js',css:'content.css',editor:'<ytd-commentbox><div data-editor id="contenteditable-root" role="textbox" contenteditable="true"></div></ytd-commentbox>'},
  {name:'X',host:'x.com',script:'x-content.js',css:'x-content.css',editor:'<div data-testid="tweetTextarea_0RichTextInputContainer"><div data-editor role="textbox" contenteditable="true" data-testid="tweetTextarea_0"></div></div><div data-testid="toolBar"></div>'},
  {name:'Discord',host:'discord.com',managed:true,editor:'<div data-editor role="textbox" contenteditable="true" data-slate-editor="true"><span data-slate-string="true"></span></div>'},
  {name:'Twitch',host:'www.twitch.tv',managed:true,editor:'<div class="chat-input"><div data-a-target="chat-input"><div data-editor role="textbox" contenteditable="true" data-slate-editor="true"></div></div></div>'},
  {name:'Facebook',host:'www.facebook.com',managed:true,editor:'<div data-editor role="textbox" aria-label="Write a comment" contenteditable="true" data-lexical-editor="true"></div>'},
  {name:'Instagram',host:'www.instagram.com',textarea:true,editor:'<textarea data-editor aria-label="Add a comment"></textarea>'},
  {name:'TikTok',host:'www.tiktok.com',managed:true,editor:'<div data-e2e="comment-input"><div data-editor role="textbox" contenteditable="true" data-lexical-editor="true"></div></div>'},
  {name:'Bilibili',host:'www.bilibili.com',textarea:true,editor:'<div class="chat-input"><textarea data-editor placeholder="发送弹幕"></textarea></div>'}
]
type Platform=typeof platforms[number]
let browser:Browser
test.beforeAll(async()=>{browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL})})
test.afterAll(async()=>{await browser?.close()})

async function fixture(platform:Platform,reject=false):Promise<Page> {
  const page=await browser.newPage({viewport:{width:1100,height:800}})
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:
    '<!doctype html><meta charset="utf-8"><style>body{margin:50px;background:#18211d;color:white;font:16px system-ui}form{margin-top:150px;width:600px}[data-editor]{display:block;white-space:pre-wrap;min-height:70px;border:1px solid #aaa;width:550px;padding:8px}#send{margin-top:24px;padding:10px 25px}</style><main><form>'+platform.editor+'<button id="send" type="submit">Send fixture</button></form></main>'}))
  await page.goto('https://'+platform.host+'/vocalume-local-fixture')
  await page.evaluate(({source,draft,managed,textarea,reject})=>{
    const box=document.querySelector('[data-editor]') as HTMLElement & {value?:string}
    let model=source
    if(textarea)box.value=source;else box.innerText=source
    const state={submitted:[] as string[],requests:[] as Array<{type:string;direction?:string;text?:string}>,readModel:()=>model}
    Object.assign(window,{__fixture:state})
    // Reproduce editors that report success but reject the native transaction.
    if(reject)document.execCommand=()=>true
    if(textarea){
      const descriptor=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!
      let tracked=source
      Object.defineProperty(box,'value',{get(){return descriptor.get!.call(this)},set(value){tracked=String(value);descriptor.set!.call(this,value)}})
      box.addEventListener('input',()=>{if(box.value!==tracked){tracked=box.value!;model=tracked}})
    }else{
      box.addEventListener('beforeinput',event=>{
        const input=event as InputEvent
        if(reject){event.preventDefault();return}
        if(managed&&input.inputType==='insertReplacementText'){
          event.preventDefault();model=input.data||''
          setTimeout(()=>{box.innerText=model},0)
        }
      })
      box.addEventListener('input',()=>{model=box.innerText})
    }
    document.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();state.submitted.push(model)})
    const settings={websiteTextOptInEnabled:true,languageSettings:{readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja'}}
    const chrome={runtime:{id:'local-test',getURL:(file:string)=>file,lastError:null,onMessage:{addListener(){}},
      sendMessage(payload:{type:string},callback?:(reply:unknown)=>void){
        state.requests.push(payload)
        const text=payload.type==='make-draft'?{draft,mode:'固定測試譯文'}:{running:false,items:[]}
        const reply={ok:true,text};queueMicrotask(()=>callback?.(reply));return Promise.resolve(reply)
      }},
      storage:{onChanged:{addListener(){}},local:{get(_keys:unknown,callback?:(value:unknown)=>void){callback?.(settings);return Promise.resolve(settings)}}}}
    Object.assign(globalThis,{chrome})
  },{source,draft,managed:!!platform.managed,textarea:!!platform.textarea,reject})
  for(const file of ['streamer-vocabulary.js','translation-guards.js','caption-window.js',platform.script||'social-content.js']){
    await page.addScriptTag({path:resolve(root,file)})
  }
  await page.addStyleTag({path:resolve(root,platform.css||'social-content.css')})
  return page
}

async function translate(page:Page,platform:Platform,shortcut=false){
  if(shortcut)await page.locator('[data-editor]').press('Tab')
  else if(platform.name==='X'){
    await page.locator('.jtl-x-composer .jtl-x-language').click()
    await page.getByRole('button',{name:'放入留言框',exact:true}).click()
  }else await page.locator(platform.name==='YouTube'?'.jtl-compose':'.jtl-social-language').click()
}

for(const platform of platforms)for(const shortcut of [false,true])test(platform.name+' ('+(shortcut?'Tab':'button')+'): visible Japanese equals the submitted model, without automatic sending',async()=>{
  const page=await fixture(platform)
  try{
    await translate(page,platform,shortcut)
    const editor=page.locator('[data-editor]')
    if(platform.textarea)await expect(editor).toHaveValue(draft)
    else await expect.poll(()=>editor.innerText()).toBe(draft)
    await expect.poll(()=>page.evaluate(()=> (window as any).__fixture.submitted.length)).toBe(0)
    const requests=await page.evaluate(()=> (window as any).__fixture.requests.filter((p:any)=>p.type==='make-draft'))
    expect(requests).toEqual([{type:'make-draft',text:source,direction:'zh-ja'}])
    const control=page.locator(platform.name==='X'?'.jtl-x-composer':platform.name==='YouTube'?'.jtl-composer-controls':'.jtl-social-controls')
    const a=await control.boundingBox(),b=await page.locator('#send').boundingBox()
    expect(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y).toBeFalsy()
    await page.locator('#send').click()
    expect(await page.evaluate(()=> (window as any).__fixture.submitted)).toEqual([draft])
  }finally{await page.close()}
})

for(const platform of platforms.filter(p=>['YouTube','X','Discord','Instagram'].includes(p.name)))test(platform.name+': active IME composition does not translate or submit',async()=>{
  const page=await fixture(platform)
  try{
    const box=page.locator('[data-editor]')
    await box.dispatchEvent('compositionstart')
    await box.press('Tab')
    expect(await page.evaluate(()=> (window as any).__fixture.requests.filter((p:any)=>p.type==='make-draft'))).toEqual([])
    expect(await page.evaluate(()=> (window as any).__fixture.submitted)).toEqual([])
    await box.dispatchEvent('compositionend')
    await translate(page,platform,true)
    if(platform.textarea)await expect(box).toHaveValue(draft)
    else await expect.poll(()=>box.innerText()).toBe(draft)
  }finally{await page.close()}
})

for(const platform of platforms.filter(p=>['YouTube','X'].includes(p.name)))test(platform.name+': a rejected edit keeps Chinese and a copyable Japanese draft',async()=>{
  const page=await fixture(platform,true)
  try{
    await translate(page,platform)
    const notice=platform.name==='X'?'請複製上方草稿後貼入留言框。':'未接受'
    await expect(page.getByRole('status').last()).toContainText(notice)
    await expect(page.locator('[data-editor]')).toHaveText(source)
    const preview=page.locator('textarea').last()
    await expect(preview).toBeVisible()
    await expect(preview).toHaveValue(draft)
    expect(await page.evaluate(()=>{
      const state=(window as any).__fixture
      return {editorModel:state.readModel(),submitted:state.submitted}
    })).toEqual({editorModel:source,submitted:[]})
  }finally{await page.close()}
})
