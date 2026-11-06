// Isolated manual test page: fault injection affects only its authored retry
// message, never production tabs or the background/native companion.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
document.querySelector('#test').onclick = async event => {
 const button=event.target, out=document.querySelector('#result'), cases=document.querySelector('#cases');
 button.disabled=true; cases.replaceChildren();
 const keys=['websiteTextOptInEnabled','languageSettings','speechMode'];
 const prior=await chrome.storage.local.get(keys), lines=[];
 const originalSend=chrome.runtime.sendMessage;
 const send=originalSend.bind(chrome.runtime);
 const request=async payload=>{const reply=await send(payload);if(!reply?.ok)throw Error(reply?.error||'沒有收到回應');return reply.text;};
 const show=text=>{lines.push(text);out.textContent=lines.join('\n');};
 const retrySource='まほろは明日来ません。';let changed=false,attempts=0;
 try {
  const before=await request({type:'health'});
  if(before.running||before.draining)throw Error('請先停止語音收音，再開始文字測試');
  show(`版本：${chrome.runtime.getManifest().version}`);
  chrome.runtime.sendMessage=function(message,...args){
   if(message?.type==='translate'&&message.text===retrySource&&++attempts===1){
    const reply={ok:false,error:'Authored test: temporary outage'};
    const callback=args.at(-1);if(typeof callback==='function'){queueMicrotask(()=>callback(reply));return;}
    return Promise.resolve(reply);
   }
   return send(message,...args);
  };
  changed=true;
  await chrome.storage.local.set({websiteTextOptInEnabled:true,speechMode:'desktop',languageSettings:{...prior.languageSettings,readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja'}});
  for(const [id,label,text] of [
   ['mixed','多行留言','今日は楽しかったです。\n🎉🎉\n7/14\nhttps://example.invalid/live/123'],
   ['retry','重試測試',retrySource]
  ]){
   const section=document.createElement('section');section.id=id;
   const title=document.createElement('h2');title.textContent=label;
   const chat=document.createElement('yt-live-chat-text-message-renderer');
   const message=document.createElement('span');message.id='message';message.textContent=text;
   chat.append(message);section.append(title,chat);cases.append(section);
  }
  const deadline=Date.now()+45000;
  const mixed=()=>document.querySelector('#mixed .jtl-translation')?.textContent||'';
  while(Date.now()<deadline&&(!/🎉🎉/.test(mixed())||!document.querySelector('#retry .jtl-translation button')))await wait(200);
  if(!['🎉🎉','7/14','https://example.invalid/live/123'].every(text=>mixed().includes(text))||!/開心|开心|愉快|快樂|快乐|有趣/u.test(mixed()))throw Error('多行留言遺失譯文或原本的表情、日期、網址');
  show(`通過：多行留言 → ${mixed()}`);
  if(attempts!==1)throw Error('前景重複送出已由背景處理的請求');
  show('已模擬背景重試用完；請按重試測試下方的「再試一次」。');
  const retryDeadline=Date.now()+120000;
  let recovered='';
  while(Date.now()<retryDeadline){
   recovered=document.querySelector('#retry .jtl-translation')?.textContent||'';
   if(attempts>=2&&!/翻譯中|重試|失敗|再試/.test(recovered))break;
   await wait(200);
  }
  if(!recovered.includes('まほろ')||!/不會|不来|不來/.test(recovered)||attempts!==2)throw Error('手動重試未恢復或遺失人名／否定');
  show(`通過：按一次恢復 → ${recovered}`);
  const draft=await request({type:'make-draft',direction:'zh-ja',text:'明天晚上八點開始直播。\n🎮\n10/26'});
  if(!/明日/.test(draft.draft)||!draft.draft.includes('🎮')||!draft.draft.includes('10/26')||!draft.mode.includes('本機'))throw Error('本機中翻日草稿不完整');
  show(`通過：本機中翻日草稿 → ${draft.draft}`);
  const after=await request({type:'health'});
  if(after.running!==before.running)throw Error('語音狀態被改變');
  show('全部通過：收音保持停止，未發送任何留言。');
 } catch(error){show(`失敗：${error.message}`);}
 finally {
  chrome.runtime.sendMessage=originalSend;
  if(changed){await chrome.storage.local.set(prior);await chrome.storage.local.remove(keys.filter(key=>!Object.hasOwn(prior,key)));show('原本的文字、語言與引擎設定已恢復。');}
  button.disabled=false;
 }
};
