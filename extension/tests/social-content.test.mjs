import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isStandaloneGreeting} from '../streamer-vocabulary.mjs';

const source=(fs.readFileSync(new URL('../translation-guards.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../social-content.js',import.meta.url),'utf8'));
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function setup(hostname,japaneseOverride,composerDistractor,semanticOnly=false,genericEnabled=false,languageSettings={},wrappedComposer=false){
 const requests=[], selectors=[], documentEvents={}, storageListeners=[], rendered=[];
 let now=0, runtimeListener;
 const translationLines=[];
 const controls=[];
 const japanese=japaneseOverride||{textContent:'配信ありがとう',innerText:'配信ありがとう',children:[],isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},
  closest:selector=>selector.includes('.jtl-social-')?null:null,
  parentElement:{querySelector:()=>translationLines.find(x=>x.isConnected)},
  insertAdjacentElement(_,line){line.isConnected=true;translationLines.push(line);}};
 const composerHost={append(node){node.isConnected=true;controls.push(node);}};
 const box={value:'今天也很可愛',isConnected:true,focus(){},dispatchEvent(){},addEventListener(){},
  matches(selector){return /textarea|textbox|contenteditable|comment|message|chat|reply/.test(selector);},
  getAttribute(name){return name==='role'?'textbox':name==='placeholder'?'Write a comment':'';},
  getBoundingClientRect(){return {width:300,height:40};},
  closest(selector){return selector.includes('.jtl-social-controls')?null:composerHost;},parentElement:composerHost};
 const shell={textContent:'今天也很可愛',isConnected:true,readOnly:false,closest:()=>null,
  getBoundingClientRect(){return {width:300,height:40};},
  dispatchEvent(){throw Error('must not edit the chat-input wrapper');},focus(){}};
 const makeElement=tag=>({tagName:tag.toUpperCase(),children:[],isConnected:false,className:'',textContent:'',dataset:{},style:{setProperty(){}},
  classList:{add(){}},setAttribute(){},addEventListener(name,fn){this['on'+name]=fn;},append(...kids){this.children.push(...kids);},
  querySelector(){return null;},remove(){this.isConnected=false;}});
 const document={documentElement:{},body:{append(node){node.isConnected=true;if(node.className==='jtl-social-controls')controls.push(node);}},
  querySelectorAll(selector){
   selectors.push(selector);
   if(selector==='.jtl-social-translation,.jtl-social-controls')return [...translationLines,...controls].filter(node=>node.isConnected);
   if(wrappedComposer&&selector==='[data-a-target="chat-input"]')return [shell];
   if(hostname.endsWith('discord.com')&&selector==='[id^="message-content-"]')return Array.isArray(japanese)?japanese:[japanese];
   if(!semanticOnly&&(selector.includes('danmaku-content')||selector.includes('chat-message')||selector.includes('chat-line-message-body')||
      ((hostname.includes('facebook')||hostname.includes('instagram'))&&selector.includes('[dir="auto"]'))||
      (hostname==='example.com'&&(selector.includes('comment')||selector.includes('role="article"')))))return Array.isArray(japanese)?japanese:[japanese];
   if(semanticOnly&&selector.includes('[role="log"]'))return [{querySelectorAll:()=>Array.isArray(japanese)?japanese:[japanese]}];
   if(selector.includes('chat-input textarea')||selector.includes('comment-input"] textarea')||selector.includes('data-a-target="chat-input"')||
      ((hostname.includes('facebook')||hostname.includes('instagram')||hostname==='example.com')&&(selector.includes('comment')||selector.includes('role="textbox"'))))return [box];
   if(composerDistractor&&selector.includes('textarea:not([disabled])'))return [composerDistractor];
   return [];
  },
  createElement:makeElement,addEventListener(name,fn){documentEvents[name]=fn;},createRange:()=>({selectNodeContents(){}})};
 const window={innerWidth:1200,innerHeight:800,getSelection:()=>({removeAllRanges(){},addRange(){}}),JtlCaptionWindow:class{constructor(){} render(rows){rendered.push(rows);} apply(){}}};window.top=window;
 const chrome={runtime:{lastError:null,onMessage:{addListener(fn){runtimeListener=fn;}},sendMessage(message,reply){requests.push({message,reply});}},
  storage:{local:{get:()=>Promise.resolve({websiteTextOptInEnabled:true,languageSettings,genericSiteAccess:genericEnabled?{[hostname]:true}:{}})},onChanged:{addListener(fn){storageListeners.push(fn);}}}};
 let scan,poll,disconnected=false,pollStopped=false;
 vm.runInNewContext(source,{Date:{now:()=>now},VocaLumeStreamerVocabulary:{isStandaloneGreeting},window,document,location:{hostname},chrome,MutationObserver:class{constructor(fn){scan=fn;}observe(){}disconnect(){disconnected=true;}},setTimeout:fn=>{fn();return 1;},clearTimeout(){},setInterval(fn){poll=fn;return 42;},clearInterval(id){if(id===42)pollStopped=true;},Event:class{},InputEvent:class{}});
 return {requests,translationLines,controls,box,shell,selectors,rendered,node:japanese,scan:()=>scan(),poll:()=>poll(),runtime:chrome.runtime,stopped:()=>disconnected&&pollStopped,
  advance:ms=>now+=ms, visibility:hidden=>{document.hidden=hidden;documentEvents.visibilitychange();}, push:item=>runtimeListener({type:'subtitle-update',item}),
  languages:value=>storageListeners.forEach(fn=>fn({languageSettings:{newValue:value}},'local'))};
}

test('idle social tabs back off status requests, hidden tabs stay quiet, and visibility or a push resumes captions',async()=>{
 const t=setup('example.com');await settle();
 void t.poll();t.requests.at(-1).reply({ok:true,text:{running:false,items:[]}});await settle();
 for(let i=0;i<12;i++){t.advance(700);await t.poll();}
 assert.equal(t.requests.length,1,'idle tabs do not keep waking the background worker every 700 ms');
 t.visibility(true);t.advance(20000);await t.poll();assert.equal(t.requests.length,1);
 t.visibility(false);assert.equal(t.requests.length,2,'returning to the tab refreshes immediately');
 t.requests.at(-1).reply({ok:true,text:{running:false,items:[]}});await settle();
 t.push(null);void t.poll();assert.equal(t.requests.length,3,'capture updates bypass the idle delay');
 t.requests.at(-1).reply({ok:true,text:{running:true,items:[]}});await settle();
 t.advance(700);void t.poll();assert.equal(t.requests.length,4,'active captions keep their existing polling cadence');
 t.requests.at(-1).reply({ok:true,text:{running:false,items:[]}});await settle();
});

test('an older idle status response cannot erase a pushed caption or reinstate the idle delay',async()=>{
 const t=setup('example.com');await settle();void t.poll();
 t.push({original:'こんにちは',translated:'你好',expiresAt:20});
 assert.equal(t.rendered.at(-1)[0].translated,'你好');
 t.requests[0].reply({ok:true,text:{running:false,items:[]}});await settle();
 assert.equal(t.rendered.at(-1)[0].translated,'你好');
 void t.poll();assert.equal(t.requests.length,2);
 t.requests[1].reply({ok:true,text:{running:false,items:[]}});await settle();
});

test('changing reading language cannot reuse an older request or let its cleanup forget newer work',async()=>{
 const t=setup('www.twitch.tv');await settle();
 t.languages({readTarget:'en'});await settle();
 t.languages({readTarget:'zh'});await settle();
 assert.deepEqual(t.requests.map(r=>r.message.direction),['ja-zh','ja-en','ja-zh']);
 t.requests[0].reply({ok:true,text:'舊設定結果'});t.requests[1].reply({ok:true,text:'old English result'});await settle();
 assert.equal(t.translationLines.find(line=>line.isConnected).textContent,'中：翻譯中…');
 t.scan();await settle();assert.equal(t.requests.length,3,'old completion must not unmark the newer source');
 t.requests[2].reply({ok:true,text:'目前設定結果'});await settle();
 assert.equal(t.translationLines.find(line=>line.isConnected).textContent,'中：目前設定結果');
});

test('queued translations capture their own language and obsolete queues do not occupy new requests',async()=>{
 const nodes=Array.from({length:5},(_,index)=>({textContent:`新しいコメント${index}です`,innerText:`新しいコメント${index}です`,isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,parentElement:{querySelector(){return null;}},insertAdjacentElement(){}}));
 const t=setup('www.twitch.tv',nodes);await settle();
 t.languages({readTarget:'en'});await settle();assert.equal(t.requests.length,3);
 for(let i=0;i<3;i++){t.requests[i].reply({ok:true,text:'舊結果'});await settle();}
 assert.equal(t.requests.length,6);
 assert.ok(t.requests.slice(3).every(r=>r.message.direction==='ja-en'));
 for(let i=3;i<8;i++){t.requests[i].reply({ok:true,text:'new translation'});await settle();}
 assert.equal(t.requests.length,8,'five current messages plus the three already active old messages');
});

test('a queued shared translation survives when its first message is recycled but another still needs it',async()=>{
 const nodes=Array.from({length:5},(_,index)=>({textContent:index<2?'同じコメントです':`新しいコメント${index}です`,innerText:index<2?'同じコメントです':`新しいコメント${index}です`,isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,parentElement:{querySelector(){return null;}},insertAdjacentElement(){}}));
 const t=setup('www.twitch.tv',nodes);await settle();assert.equal(t.requests.length,3);
 nodes[1].isConnected=false;
 t.requests[0].reply({ok:true,text:'中文'});await settle();
 assert.equal(t.requests[3].message.text,'同じコメントです');
 for(let i=1;i<4;i++)t.requests[i].reply({ok:true,text:'同一則留言'});
 await settle();assert.equal(t.requests.length,4,'one live subscriber retains the shared request without wasting a retry');
});

test('Twitch and general social reading skip Chinese sentences containing a kana name',async()=>{
 const node=text=>({textContent:text,innerText:text,children:[],isConnected:true,querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,parentElement:{querySelector:()=>null},insertAdjacentElement(){}});
 for(const hostname of ['www.twitch.tv','www.facebook.com','www.instagram.com']){
  const t=setup(hostname,[node('我很喜歡まほろちゃん'),node('まほろ'),node('まほろの歌が好きです。')]);await settle();
  assert.deepEqual(t.requests.filter(r=>r.message.type==='translate').map(r=>r.message.text),['まほろの歌が好きです。']);
 }
});

test('romanized creator greetings are recognized in Twitch chat without treating ordinary English as Japanese',async()=>{
 const node=text=>({textContent:text,innerText:text,children:[],isConnected:true,querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,parentElement:{querySelector:()=>null},insertAdjacentElement(){}});
 const t=setup('www.twitch.tv',[node('Konmaho!'),node('This is konmahogany wood')]);await settle();
 const requests=t.requests.filter(r=>r.message.type==='translate');
 assert.equal(requests.length,1);assert.equal(requests[0].message.text,'Konmaho!');
});

test('recycled social messages clear old translations when the new message is already Chinese',async()=>{
 const t=setup('www.twitch.tv');await settle();t.requests[0].reply({ok:true,text:'謝謝直播'});await settle();
 t.node.textContent=t.node.innerText='我喜歡まほろ的歌';t.scan();await settle();
 assert.equal(t.translationLines.filter(line=>line.isConnected).length,0);
 assert.equal(t.requests.length,1);
 t.node.textContent=t.node.innerText='配信ありがとう';t.scan();await settle();
 assert.equal(t.translationLines.find(line=>line.isConnected).textContent,'中：謝謝直播');
});

test('an old social request cannot remove the translation for newer text in the same node',async()=>{
 const t=setup('www.twitch.tv');await settle();
 t.node.textContent=t.node.innerText='まほろは明日来ません。';t.scan();await settle();
 t.requests[1].reply({ok:true,text:'まほろ明天不會來。'});await settle();
 t.requests[0].reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines.find(line=>line.isConnected).textContent,'中：まほろ明天不會來。');
 t.scan();await settle();assert.equal(t.requests.length,2);
});

test('social live chat limits restored history and starts newest messages first',async()=>{
 const nodes=Array.from({length:40},(_,index)=>({textContent:`新しいコメント${index}です`,innerText:`新しいコメント${index}です`,isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,
  parentElement:{querySelector(){return null;}},insertAdjacentElement(){}}));
 const t=setup('live.bilibili.com',nodes);await settle();
 const translated=t.requests.filter(request=>request.message.type==='translate');
 assert.equal(translated.length,3);
 assert.deepEqual(translated.map(request=>request.message.text),[
  '新しいコメント39です','新しいコメント38です','新しいコメント37です'
 ]);
});

test('semantic live region keeps chat translation working after site selectors change',async()=>{
 const t=setup('www.tiktok.com',null,null,true);await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,'配信ありがとう');
 request.reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
});

test('social live chat exposes retry progress and retries a transient failure once',async()=>{
 const t=setup('www.tiktok.com');await settle();
 assert.equal(t.translationLines[0].textContent,'中：翻譯中…');
 t.requests[0].reply({ok:false,error:'temporary'});await settle();
 assert.equal(t.requests.filter(x=>x.message.type==='translate').length,2);
 assert.equal(t.translationLines[0].textContent,'中：第一次失敗，正在重試…');
 t.requests[1].reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
});

test('social live chat stops after its bounded retry fails',async()=>{
 const t=setup('live.bilibili.com');await settle();
 t.requests[0].reply({ok:false,error:'first'});await settle();
 t.requests[1].reply({ok:false,error:'second'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：翻譯暫時失敗。');
 assert.equal(t.requests.filter(x=>x.message.type==='translate').length,2);
 t.scan();await settle();assert.equal(t.requests.length,2);
 const retry=t.translationLines[0].children[0];assert.equal(retry.textContent,'再試一次');
 retry.onclick({preventDefault(){},stopPropagation(){}});await settle();assert.equal(t.requests.length,3);
 t.requests[2].reply({ok:true,text:'恢復翻譯'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：恢復翻譯');
});

test('Instagram reports a stale extension context clearly and stops invalid requests without editing the draft',async()=>{
 const t=setup('www.instagram.com');await settle();
 let attempts=0;
 t.runtime.sendMessage=()=>{attempts++;throw new Error('Extension context invalidated.');};
 await t.controls[0].children[0].onclick({preventDefault(){},stopPropagation(){}});
 assert.match(t.controls[0].children[1].textContent,/擴充功能已重新載入.*保留未送出的留言.*重新整理/);
 assert.equal(t.controls[0].children[0].disabled,true);
 assert.equal(t.box.value,'今天也很可愛');
 assert.equal(t.stopped(),true);
 t.scan();await t.poll();await settle();
 assert.equal(attempts,1);
});

test('a runtime context error in Instagram reading is not retried as a transient translation failure',async()=>{
 const t=setup('www.instagram.com');await settle();
 t.runtime.lastError={message:'Extension context invalidated.'};
 t.requests[0].reply();await settle();
 assert.equal(t.requests.length,1);
 assert.match(t.translationLines[0].textContent,/重新整理此頁恢復翻譯/);
 assert.equal(t.translationLines[0].children.length,0);
 assert.equal(t.stopped(),true);
});

test('long social chat is translated once instead of being silently skipped',async()=>{
 const source='今日は長い話をします。'.repeat(45);
 const t=setup('live.bilibili.com',{textContent:source,innerText:source,children:[],isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,
  parentElement:{querySelector:()=>t?.translationLines?.find(x=>x.isConnected)},insertAdjacentElement(_,line){line.isConnected=true;t.translationLines.push(line);}});
 await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,source);
 request.reply({ok:true,text:'今天要說一段很長的話。'});await settle();
 assert.equal(t.translationLines.length,1);
 assert.equal(t.translationLines[0].textContent,'中：今天要說一段很長的話。');
});

test('Bilibili page scans cannot steal the button from the focused live composer',async()=>{
 const distractor={value:'',isConnected:true,focus(){},dispatchEvent(){},matches(){return false;},
  getBoundingClientRect(){return {width:300,height:40};},closest(){return null;},parentElement:{append(){}}};
 const t=setup('live.bilibili.com',null,distractor);await settle();
 const original=t.controls[0];
 // Repeated mutation scans discover the same composer but must retain the
 // existing control and its bound Chinese source.
 await settle();
 assert.equal(t.controls.filter(control=>control.isConnected).length,1);
 assert.equal(t.controls[0],original);
 const button=original.children[0];
 button.onclick({preventDefault(){},stopPropagation(){}});await settle();
 assert.equal(t.requests.find(x=>x.message.type==='make-draft').message.text,'今天也很可愛');
});

test('TikTok fallback chat containers translate the message without nickname metadata',async()=>{
 const lines=[];
 const messageLeaf={textContent:'今日も声きれい',innerText:'今日も声きれい',children:[],isConnected:true,closest:()=>null,
  parentElement:{querySelector:()=>lines.find(x=>x.isConnected)},insertAdjacentElement(_,line){line.isConnected=true;lines.push(line);}};
 const nickname={textContent:'カールじい〜 No.2',innerText:'カールじい〜 No.2',children:[],closest:()=>({})};
 const container={textContent:'カールじい〜 No.2 今日も声きれい',innerText:'カールじい〜 No.2 今日も声きれい',isConnected:true,
  children:[nickname,messageLeaf],closest:()=>null,querySelector:()=>null,querySelectorAll:()=>[nickname,messageLeaf]};
 const t=setup('www.tiktok.com',container);await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,'今日も声きれい');
 request.reply({ok:true,text:'今天的聲音也很好聽'});await settle();
 assert.equal(lines[0].textContent,'中：今天的聲音也很好聽');
});

for(const [site,hostname] of [['Bilibili','live.bilibili.com'],['TikTok','www.tiktok.com']]){
 test(`${site} translates Japanese page text and installs a CH/JP composer`,async()=>{
  const t=setup(hostname);await settle();
  const ja=t.requests.find(x=>x.message.type==='translate');
  assert.ok(ja,`${site} Japanese text was discovered`);
  ja.reply({ok:true,text:'謝謝直播'});await settle();
  assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
  assert.equal(t.controls.length,1);
  const button=t.controls[0].children[0];
  button.onclick({preventDefault(){},stopPropagation(){}});await settle();
  const draft=t.requests.find(x=>x.message.type==='make-draft');
  assert.equal(draft.message.text,'今天也很可愛');
  draft.reply({ok:true,text:{draft:'今日もとても可愛いですね！',mode:'可愛禮貌'}});await settle();
  assert.equal(t.box.value,'今日もとても可愛いですね！');
 });
}

test('Twitch discovers stream chat and installs a translated composer',async()=>{
 const t=setup('www.twitch.tv');await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.ok(request,'Twitch Japanese chat was discovered');
 request.reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
 assert.equal(t.controls.length,1);
});

test('Twitch edits the nested text input rather than its chat-input wrapper',async()=>{
 const t=setup('www.twitch.tv',null,null,false,false,{},true);await settle();
 t.controls[0].children[0].onclick({preventDefault(){},stopPropagation(){}});await settle();
 const draft=t.requests.find(x=>x.message.type==='make-draft');
 assert.ok(draft);
 draft.reply({ok:true,text:{draft:'今日も可愛いですね！',mode:'本機草稿'}});await settle();
 assert.equal(t.box.value,'今日も可愛いですね！');
 assert.equal(t.shell.textContent,'今天也很可愛');
});

for(const [site,hostname,genericEnabled] of [['Facebook','www.facebook.com',false],['Instagram','www.instagram.com',false],['general website','example.com',true]]){
 test(`${site} translates matching comments and installs a reviewable composer`,async()=>{
  const t=setup(hostname,null,null,false,genericEnabled);await settle();
  const request=t.requests.find(x=>x.message.type==='translate');
  assert.ok(request,`${site} comment was discovered`);
  request.reply({ok:true,text:'謝謝直播'});await settle();
  assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
  assert.equal(t.controls.length,1);
 });
}

test('general websites such as ChatGPT stay quiet until the user enables that hostname',async()=>{
 const t=setup('chatgpt.com');await settle();
 assert.equal(t.requests.filter(x=>x.message.type==='translate').length,0);
 assert.equal(t.translationLines.length,0);
 assert.equal(t.controls.length,0);
});

test('all-sites manifest uses the general adapter without double-injecting on dedicated sites',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 const general=manifest.content_scripts.find(entry=>entry.matches?.includes('https://*/*'));
 assert.ok(general);
 assert.ok(general.js.includes('social-content.js'));
 assert.equal(general.all_frames,true);
 assert.ok(general.exclude_matches.includes('https://www.youtube.com/*'));
 assert.ok(general.exclude_matches.includes('https://*.tiktok.com/*'));
});


test('Discord translates the complete Korean message body, not its channel or metadata',async()=>{
 const body={textContent:'안녕하세요.\n오늘도 감사합니다.',innerText:'안녕하세요.\n오늘도 감사합니다.',children:[{textContent:'안녕하세요.'},{textContent:'오늘도 감사합니다.'}],isConnected:true,
  closest:()=>null,querySelector:()=>null,
  querySelectorAll:()=>{throw Error('must keep the complete Discord message, not choose a leaf');},
  parentElement:{querySelector:()=>null},insertAdjacentElement(){}};
 const t=setup('discord.com',body,null,false,false,{readSource:'ko',readTarget:'zh'});await settle();
 const requests=t.requests.filter(r=>r.message.type==='translate');
 assert.equal(requests.length,1);
 assert.equal(requests[0].message.direction,'ko-zh');
 assert.equal(requests[0].message.text,'안녕하세요. 오늘도 감사합니다.');
 assert.ok(!t.selectors.some(s=>s.includes('h1')||s.includes('aria-live')||s==='[role="log"]'));
 requests[0].reply({ok:true,text:'你好。今天也謝謝你。'});await settle();
});

test('Discord leaves Korean messages alone when the reader explicitly selected Japanese',async()=>{
 const body={textContent:'안녕하세요',innerText:'안녕하세요',isConnected:true,closest:()=>null,querySelectorAll(){return[];}};
 const t=setup('discord.com',body);await settle();
 assert.equal(t.requests.filter(r=>r.message.type==='translate').length,0);
});


test('holding the reply button drags it without translating or modifying the draft', async () => {
 const t=setup('www.instagram.com');await settle();
 const controls=t.controls[0], button=controls.children[0];
 controls.getBoundingClientRect=()=>({left:100,top:200,width:100,height:30});
 const event={button:0,pointerId:1,clientX:110,clientY:210,preventDefault(){},stopPropagation(){}};
 let captures=0;
 button.setPointerCapture=()=>{captures++;};
 // A relocated button must capture again after entering the floating layer.
 controls.parentElement={};
 const before=t.requests.length;
 button.onpointerdown(event);
 button.onpointermove({...event,clientX:210,clientY:260});
 button.onpointerup(event);
 await button.onclick(event);
 assert.equal(captures,2);
 assert.equal(controls.dataset.placement,'floating');
 assert.equal(controls.style.left,'200px');
 assert.equal(controls.style.top,'250px');
 assert.equal(t.requests.length,before);
 assert.equal(t.box.value,'今天也很可愛');
});
