import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

/** Live chat and comment translation with a recyclable node, as a virtualized
 * list gives us: the same element object is reused for a different message. */
function setup(semanticOnly=false,titleConfig=null){
 const chat=[], requests=[], rendered=[], intervals=[]; let change, navigate, receive;
 const makeLine=()=>({className:'',textContent:'',dataset:{},children:[],isConnected:false,
  classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},
  setAttribute(){},append(...kids){this.children.push(...kids);},replaceChildren(...kids){this.children=kids;},
  addEventListener(name,fn){this['on'+name]=fn;},insertAdjacentElement(){},remove(){this.removed=true;}});
 const makeNode=text=>{
  const lines=[];
  const node={textContent:text,isConnected:true,lines,
   closest(){return node;},
   parentElement:{querySelector:selector=>selector.includes('jtl-')?lines.find(l=>!l.removed):null},
   insertAdjacentElement(_,line){lines.push(line);}};
  return node;
 };
 const title=titleConfig?makeNode(titleConfig.text):null;
 const overlay={...makeLine(),captionWindow:{render:rows=>rendered.push(rows)}};
 const document={documentElement:{},
  querySelector:selector=>selector==='#jtl-subtitles'?overlay:selector===titleConfig?.selector?title:null,
  // Match the live-chat message selector only; the composer selector also
  // mentions yt-live-chat and must not receive these nodes.
  querySelectorAll:selector=>{
   if(selector==='.jtl-title')return title?.lines.filter(line=>!line.removed)||[];
   if(!semanticOnly&&selector.includes('yt-live-chat-text-message-renderer'))return chat;
   if(semanticOnly&&selector==='[role="log"]')return [{querySelectorAll:()=>chat}];
   return [];
  },
  createElement:()=>makeLine(),
  addEventListener:(name,fn)=>{if(name==='yt-navigate-start')navigate=fn;}};
 const window={};window.top=window;
 const chrome={storage:{local:{get:()=>Promise.resolve({websiteTextOptInEnabled:true})},
   onChanged:{addListener:f=>change=f}},
  runtime:{onMessage:{addListener:f=>receive=f},sendMessage:(message,reply)=>requests.push({message,reply})}};
 let scan;
 vm.runInNewContext((fs.readFileSync(new URL('../translation-guards.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../content.js',import.meta.url),'utf8')),
  {chrome,window,document,MutationObserver:class{constructor(fn){scan=fn;}observe(){}},
   setInterval(fn){intervals.push(fn);},setTimeout(fn,delay){if(delay===250)fn();return 0;},clearTimeout(){},console});
 return {chat,title,requests,makeNode,scan:()=>scan(),navigate:()=>navigate?.(),runtime:chrome.runtime,
  rendered,poll:()=>intervals[0](),push:item=>receive({type:'subtitle-update',item}),
  toggle:v=>change({websiteTextOptInEnabled:{newValue:v}},'local')};
}

const settle=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};

test('Chinese containing a Japanese name and name-only chat do not add translation rows',async()=>{
 const t=setup();await settle();
 for(const text of ['這是中文','我喜歡まほろ的歌','まほろちゃん今天辛苦了','鹿乃まほろ','まほろ'])t.chat.push(t.makeNode(text));
 const japanese=t.makeNode('まほろは明日来ません。');t.chat.push(japanese);
 t.scan();await settle();
 assert.deepEqual(t.requests.map(r=>r.message.text),['まほろは明日来ません。']);
 assert(t.chat.slice(0,-1).every(node=>node.lines.length===0));
});

test('an unchanged message is translated once however often the page mutates',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('こんばんは、配信ありがとう');
 t.chat.push(node);
 t.scan();await settle();
 assert.equal(t.requests.length,1);
 t.requests[0].reply({ok:true,text:'晚安，謝謝你的直播'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：晚安，謝謝你的直播');
 // Repeated scans must not re-request or add a second line.
 t.scan();t.scan();await settle();
 assert.equal(t.requests.length,1);
 assert.equal(node.lines.length,1);
});

test('recycling a translated chat node for Chinese clears its old line without another request',async()=>{
 const t=setup();await settle();const node=t.makeNode('まほろの配信です。');t.chat.push(node);
 t.scan();await settle();t.requests[0].reply({ok:true,text:'這是まほろ的直播。'});await settle();
 node.textContent='我很喜歡まほろちゃん';t.scan();await settle();
 assert.equal(node.lines.filter(line=>!line.removed).length,0);
 assert.equal(t.requests.length,1);
 node.textContent='まほろの配信です。';t.scan();await settle();
 assert.equal(node.lines.find(line=>!line.removed).textContent,'中：這是まほろ的直播。');
});

test('a recycled node discards the late result and translates its new message',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('最初のコメントです');
 t.chat.push(node);
 t.scan();await settle();
 assert.equal(t.requests.length,1);
 // The virtualized list reuses this element for a different message.
 node.textContent='別のコメントになりました';
 t.requests[0].reply({ok:true,text:'這是第一則留言'});await settle();
 assert.equal(node.lines.filter(line=>!line.removed).length,0,'a result for text that is gone must not be written');
 t.scan();await settle();
 assert.equal(t.requests.length,2);
 t.requests[1].reply({ok:true,text:'變成另一則留言了'});await settle();
 assert.equal(node.lines.filter(line=>!line.removed).length,1);
 assert.equal(node.lines.find(line=>!line.removed).textContent,'中：變成另一則留言了');
});

test('an existing translation line is reused rather than duplicated',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('一回目のコメント');
 t.chat.push(node);
 t.scan();await settle();t.requests[0].reply({ok:true,text:'第一次'});await settle();
 node.textContent='二回目です';
 t.scan();await settle();
 t.requests[1].reply({ok:true,text:'第二次'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：第二次');
});

test('turning website text off drops a result that is already in flight',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('途中で切ります');
 t.chat.push(node);
 t.scan();await settle();
 t.toggle(false);
 t.requests.at(-1).reply({ok:true,text:'中途關閉'});await settle();
 assert.equal(node.lines.filter(line=>!line.removed).length,0);
});

test('a restored chat backlog is bounded and newest messages are translated first',async()=>{
 const t=setup();await settle();
 for(let i=0;i<40;i++)t.chat.push(t.makeNode(`新しいコメント${i}です`));
 t.scan();await settle();
 assert.equal(t.requests.length,3,'only a small number of translations may run concurrently');
 assert.deepEqual(t.requests.map(r=>r.message.text),[
  '新しいコメント39です','新しいコメント38です','新しいコメント37です'
 ]);
 t.requests[0].reply({ok:true,text:'最新'});await settle();
 assert.equal(t.requests.length,4);
 assert.equal(t.requests[3].message.text,'新しいコメント36です');
});

test('a queued live-chat message that left the screen is skipped',async()=>{
 const t=setup();await settle();
 for(let i=0;i<5;i++)t.chat.push(t.makeNode(`画面のコメント${i}です`));
 t.scan();await settle();
 assert.equal(t.requests.length,3);
 t.chat[1].isConnected=false; // next queued item after the three active jobs
 t.requests[0].reply({ok:true,text:'最新'});await settle();
 assert.equal(t.requests.length,4);
 assert.equal(t.requests[3].message.text,'画面のコメント0です');
});

test('a queued duplicate remains valid after its first consumer leaves the screen',async()=>{
 const t=setup();await settle();
 const first=t.makeNode('同じコメントです'), second=t.makeNode(first.textContent);
 t.chat.push(second,first,...['次のコメントです','次々のコメントです','最後のコメントです'].map(t.makeNode));
 t.scan();await settle();
 assert.equal(t.requests.length,3);
 first.isConnected=false;
 t.requests[0].reply({ok:true,text:'最新'});await settle();
 assert.equal(t.requests.length,4);
 assert.equal(t.requests[3].message.text,second.textContent);
 assert.equal(second.lines[0].textContent,'中：翻譯中…');
 t.requests[3].reply({ok:true,text:'這是同一則留言'});await settle();
 assert.equal(second.lines[0].textContent,'中：這是同一則留言');
});

test('an older subtitle poll cannot clear a newly pushed caption',async()=>{
 const t=setup();await settle();
 const poll=t.poll();
 const caption={id:2,original:'今',translated:'新字幕',expiresAt:Date.now()/1000+30};
 t.push(caption);
 t.requests[0].reply({ok:true,text:{running:false,items:[]}});
 await poll;
 assert.equal(t.rendered.length,1);
 assert.equal(t.rendered[0][0],caption);
});

test('a blank live-chat reply is not cached or rendered as a successful translation',async()=>{
 const t=setup();await settle();const node=t.makeNode('もう一度翻訳してください');
 t.chat.push(node);t.scan();await settle();
 assert.equal(node.lines[0].textContent,'中：翻譯中…');
 t.requests[0].reply({ok:true,text:' '});await settle();
 assert.equal(t.requests.length,1);
 assert.equal(node.lines[0].textContent,'中：翻譯暫時失敗。');
 const retry=node.lines[0].children[0];
 retry.onclick({preventDefault(){},stopPropagation(){}});await settle();
 t.requests[1].reply({ok:true,text:'請再翻譯一次'});await settle();
 assert.equal(node.lines[0].textContent,'中：請再翻譯一次');
});

test('a terminal background failure stops instead of creating a retry loop',async()=>{
 const t=setup();await settle();const node=t.makeNode('翻訳が失敗するコメントです');
 t.chat.push(node);t.scan();await settle();
 t.requests[0].reply({ok:false,error:'background retries exhausted'});await settle();
 assert.equal(node.lines[0].textContent,'中：翻譯暫時失敗。');
 t.scan();t.scan();await settle();
 assert.equal(t.requests.length,1);
 const retry=node.lines[0].children[0];assert.equal(retry.textContent,'再試一次');
 retry.onclick({preventDefault(){},stopPropagation(){}});await settle();
 assert.equal(t.requests.length,2);
 retry.onclick({preventDefault(){},stopPropagation(){}});await settle();assert.equal(t.requests.length,2);
 t.requests[1].reply({ok:true,text:'重試成功'});await settle();
 assert.equal(node.lines[0].textContent,'中：重試成功');
});

test('a synchronous messaging failure does not strand subsequent chat translations',async()=>{
 const t=setup();await settle();
 const send=t.runtime.sendMessage;
 let blocked=0;
 t.runtime.sendMessage=(message,reply)=>{
  if(message.type==='translate' && blocked++<3) throw new Error('Extension message could not be sent');
  send(message,reply);
 };
 for(let i=0;i<4;i++) t.chat.push(t.makeNode(`コメントの番号は${i}です。`));
 t.scan();await settle();
 assert.equal(t.requests.length,1);
 t.requests[0].reply({ok:true,text:'留言編號是零。'});await settle();
 assert.equal(t.chat[0].lines[0].textContent,'中：留言編號是零。');
});

test('YouTube live chat survives selector changes through its semantic log region',async()=>{
 const t=setup(true);await settle();
 const node=t.makeNode('新しい配信コメントです');node.children=[];node.querySelectorAll=()=>[];node.closest=()=>null;
 t.chat.push(node);t.scan();await settle();
 assert.equal(t.requests.length,1);
 assert.equal(t.requests[0].message.text,'新しい配信コメントです');
});

test('YouTube live chat keeps a multi-line Japanese message as one translated row',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('今日は長い話をします。\nまず最初の話です。\n次に二つ目の話です。');
 t.chat.push(node);t.scan();await settle();
 assert.equal(t.requests.length,1);
 t.requests[0].reply({ok:true,text:'今天要說一段很長的話。首先是第一件事。接著是第二件事。'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：今天要說一段很長的話。首先是第一件事。接著是第二件事。');
});

test('YouTube title translation supports the current alternate heading structure',async()=>{
 const t=setup(false,{selector:'#above-the-fold #title h1',text:'雑談しながら配信します'});await settle();
 assert.equal(t.requests.length,1);
 assert.equal(t.requests[0].message.text,'雑談しながら配信します');
 t.requests[0].reply({ok:true,text:'一邊聊天一邊直播'});await settle();
 assert.equal(t.title.lines[0].textContent,'中：一邊聊天一邊直播');
});

test('a title node rebuilt while translation is pending can be retried',async()=>{
 const t=setup(false,{selector:'ytd-watch-metadata h1 yt-formatted-string',text:'新しい配信です'});await settle();
 assert.equal(t.requests.length,1);
 t.title.isConnected=false;
 t.requests[0].reply({ok:true,text:'新的直播'});await settle();
 t.title.isConnected=true;t.scan();await settle();
 assert.equal(t.requests.length,1,'the cached result should be reused without a second network request');
 assert.equal(t.title.lines.find(line=>!line.removed).textContent,'中：新的直播');
});


test('a Japanese title is removed when a reused heading changes to Chinese',async()=>{
 const t=setup(false,{selector:'#above-the-fold #title h1',text:'日本語の配信です'});await settle();
 t.requests[0].reply({ok:true,text:'日文直播'});await settle();
 t.title.textContent='中文影片標題';t.scan();await settle();
 assert.equal(t.title.lines.filter(l=>!l.removed).length,0);
});

test('a slower old translation cannot remove or overwrite a newer reused line',async()=>{
 const t=setup(false,{selector:'#above-the-fold #title h1',text:'古い配信です'});await settle();
 t.title.textContent='新しい配信です';t.scan();await settle();
 t.requests[1].reply({ok:true,text:'新的直播'});await settle();
 t.requests[0].reply({ok:true,text:'舊的直播'});await settle();
 assert.equal(t.title.lines.find(l=>!l.removed).textContent,'中：新的直播');
 t.scan();await settle();assert.equal(t.requests.length,2);
});


test('a title translated before a language change is restored when it returns',async()=>{
 const t=setup(false,{selector:'#above-the-fold #title h1',text:'日本語の配信です'});await settle();
 t.requests[0].reply({ok:true,text:'日文直播'});await settle();
 t.title.textContent='中文影片';t.scan();await settle();
 t.title.textContent='日本語の配信です';t.scan();await settle();
 assert.equal(t.title.lines.find(l=>!l.removed).textContent,'中：日文直播');
 assert.equal(t.requests.length,1);
});
