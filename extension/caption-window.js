(() => {
 if(window.JtlCaptionWindow)return;
 const HIDE_DISTANCE=12,RESTORE_DISTANCE=18;
 // Display-only compression: keep stored transcripts and translation input intact.
 window.jtlCompactCaption=text=>String(text||'').replace(/\s+/g,' ').trim()
  .replace(/([あアぁァ啊呀哇])(?:[あアぁァ啊呀哇ー〜～]*\1){2,}[ー〜～]*[!！]*/gu,'$1～！')
  .replace(/([\p{L}]{2,16}?)(?:[、,，\s]*\1){2,}[、,，]*/gu,'$1…');
 window.JtlCaptionWindow=class {
  constructor(root,key){
   this.root=root;this.key=key;root.classList.add('jtl-caption-window');
   root.replaceChildren();this.lines=document.createElement('div');this.lines.className='jtl-lines';root.append(this.lines);this.rows=[];
   for(const side of ['n','s','e','w','ne','nw','se','sw']){const handle=document.createElement('div');handle.className='jtl-resize jtl-'+side;handle.dataset.side=side;root.append(handle);}
   root.addEventListener('pointerdown',e=>this.begin(e));
   root.addEventListener('click',e=>e.stopPropagation());
   root.addEventListener('dblclick',e=>e.stopPropagation());
   chrome.storage.local.get(['subtitleSettings','captionStyleV34',key]).then(s=>{let prefs=s.subtitleSettings||{};if(!s.captionStyleV34){prefs={...prefs,fontSize:22,japaneseColor:'#ffffff',chineseColor:'#ffffff',outlineWidth:1,backgroundColor:'#000000',backgroundOpacity:60};chrome.storage.local.set({subtitleSettings:prefs,captionStyleV34:true});}this.apply(prefs);if(s[key])this.place(s[key]);});
  }
  place(rect){const r=this.root;r.style.left=(rect.x*100)+'%';r.style.top=(rect.y*100)+'%';r.style.width=(rect.w*100)+'%';r.style.height=(rect.h*100)+'%';r.style.right='auto';r.style.bottom='auto';r.style.transform='none';this.pointerTracking?.refresh();}
  apply(raw={}){const s={fontSize:22,captionOpacity:100,showOutline:true,outlineColor:'#000000',backgroundColor:'#000000',backgroundOpacity:60,japaneseColor:'#ffffff',chineseColor:'#ffffff',outlineWidth:1,...raw};const width=Math.max(0,Number(s.outlineWidth)||0),outline=s.showOutline===true&&width>0,color=/^#[0-9a-f]{6}$/i.test(s.outlineColor)?s.outlineColor:'#000000';this.root.classList?.toggle?.('jtl-has-outline',outline);this.root.style.setProperty('opacity',String(Math.max(0,Math.min(100,Number(s.captionOpacity)))/100));this.root.style.setProperty('--jtl-size',s.fontSize+'px');this.root.style.setProperty('--jtl-ja',s.japaneseColor);this.root.style.setProperty('--jtl-zh',s.chineseColor);this.root.style.setProperty('--jtl-outline',outline?width+'px':'0px');this.root.style.setProperty('--jtl-stroke',outline?'.4px':'0px');this.root.style.setProperty('--jtl-outline-color',outline?color:'transparent');const hex=/^#[0-9a-f]{6}$/i.test(s.backgroundColor)?s.backgroundColor:'#000000';const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));this.root.style.setProperty('--jtl-bg',`rgba(${rgb.join(',')},${Math.max(0,Math.min(100,Number(s.backgroundOpacity)))/100})`);
   this.hideOnHover=raw?.hideOnHover===true;
   this.syncPointerTracking();
  }
  render(rows){
   const visible=rows.length>0;
   if(visible!==this.visible){
    this.root.style.setProperty('visibility',visible?'visible':'hidden','important');
    this.visible=visible;
    this.syncPointerTracking();
   }
   const desired=rows.slice(-4).map(row=>{
    const original=String(row.original||''),translated=String(row.translated||'');
    const message=row.failed?'翻譯未完成 · 可在「字幕記錄」重試':row.error?'翻譯未完成':!row.translated&&row.pending?'正在聆聽／翻譯…':'';
    return {original,translated,message,key:JSON.stringify([original,translated,message])};
   });
   if(desired.length===this.rows.length&&desired.every((row,i)=>row.key===this.rows[i].key))return;
   const unused=new Set(this.rows);
   const next=desired.map((row,i)=>{
    const same=this.rows[i];
    const match=same?.key===row.key&&unused.has(same)?same:[...unused].find(item=>item.key===row.key);
    if(match)unused.delete(match);
    return match;
   });
   for(const [i,row] of desired.entries()){
    if(next[i])continue;
    const previous=this.rows[i];
    if(unused.delete(previous))next[i]=previous;
    else next[i]=this.createRow();
    this.updateRow(next[i],row);
   }
   for(const row of unused)this.lines.removeChild(row.pair);
   for(const [i,row] of next.entries()){
    const existing=this.lines.children[i];
    if(existing!==row.pair)this.lines.insertBefore(row.pair,existing||null);
   }
   this.rows=next;
   this.lines.scrollTop=this.lines.scrollHeight;
  }
  syncPointerTracking(){
   const root=this.root;
   if(!this.hideOnHover||!this.visible||!root.isConnected){this.stopPointerTracking();return;}
   if(this.pointerTracking){this.pointerTracking.refresh();return;}
   const controller=new AbortController();
   const options={capture:true,passive:true,signal:controller.signal};
   let point,bounds,frame,hidden=false,alt=false,ancestors=[];
   const setHidden=value=>{
    if(value===hidden)return;
    hidden=value;root.classList.toggle('jtl-pointer-hidden',hidden);
   };
   const update=()=>{
    if(alt||this.adjusting||!bounds?.width||!bounds.height){setHidden(false);return;}
    if(!point){
     if(!hidden&&root.matches(':hover'))setHidden(true);
     return;
    }
    // Hiding keeps the box in place. A wider exit region prevents flicker at the edge.
    const distance=hidden?RESTORE_DISTANCE:HIDE_DISTANCE;
    setHidden(point.x>=bounds.left-distance&&point.x<=bounds.right+distance&&
      point.y>=bounds.top-distance&&point.y<=bounds.bottom+distance);
   };
   const refresh=()=>{
    bounds=undefined;
    if(frame!==undefined)return;
    frame=window.requestAnimationFrame(()=>{
     frame=undefined;
     if(!root.isConnected){this.stopPointerTracking();return;}
     bounds=root.getBoundingClientRect();update();
    });
   };
   window.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch')return;
    point={x:event.clientX,y:event.clientY};
    alt=event.altKey;
    bounds??=root.getBoundingClientRect();
    update();
   },options);
   const modifier=event=>{if(event.key==='Alt'){alt=event.altKey;update();}};
   window.addEventListener('keydown',modifier,options);
   window.addEventListener('keyup',modifier,options);
   const leave=()=>{point=undefined;alt=false;setHidden(false);};
   window.addEventListener('pointerout',event=>{if(!event.relatedTarget&&event.pointerType!=='touch')leave();},options);
   window.addEventListener('blur',leave,options);
   window.addEventListener('scroll',refresh,options);
   window.addEventListener('resize',refresh,options);
   document.addEventListener('fullscreenchange',refresh,options);
   const resize=new ResizeObserver(refresh);
   resize.observe(root);
   const removal=new MutationObserver(()=>{
    if(!root.isConnected){this.stopPointerTracking();return;}
    watchAncestors();
   });
   const watchAncestors=()=>{
    const parents=[];
    for(let node=root.parentNode;node;node=node.parentNode)parents.push(node);
    if(parents.length===ancestors.length&&parents.every((node,index)=>node===ancestors[index]))return;
    ancestors=parents;removal.disconnect();
    for(const parent of parents)removal.observe(parent,{childList:true});
    refresh();
   };
   this.pointerTracking={refresh,stop:()=>{
    controller.abort();resize.disconnect();removal.disconnect();
    if(frame!==undefined)window.cancelAnimationFrame(frame);
    setHidden(false);
   }};
   watchAncestors();
  }
  stopPointerTracking(){
   this.pointerTracking?.stop();
   this.pointerTracking=undefined;
  }
  createRow(){
   const pair=document.createElement('div');pair.className='jtl-pair';
   const original=document.createElement('div'),translated=document.createElement('div');
   original.className='jtl-spoken';translated.className='jtl-chinese';
   pair.append(original,translated);
   return {pair,original,translated,key:'',message:''};
  }
  updateRow(item,row){
   for(const field of ['original','translated']){
    if(item[field+'Raw']===row[field])continue;
    item[field+'Raw']=row[field];
    const value=window.jtlCompactCaption(row[field]);
    const line=item[field],backing=line.children[0];
    if(value){
     const text=backing||document.createElement('span');
     if(text.textContent!==value)text.textContent=value;
     if(!backing)line.append(text);
    }else if(backing)line.removeChild(backing);
   }
   if(item.message!==row.message){
    // Status stays separate from text, transcripts and exports.
    if(item.status)item.pair.removeChild(item.status);
    item.status=null;
    if(row.message){
     const status=document.createElement('div');status.className='jtl-caption-status';
     if(globalThis.VocaLumePageLanguage)globalThis.VocaLumePageLanguage.bind(status,row.message);
     else status.textContent=row.message;
     item.status=status;item.pair.append(status);
    }
    item.message=row.message;
   }
   item.key=row.key;
  }
  begin(event){
   if(event.button!==0||this.adjusting)return;
   const root=this.root,parent=root.parentElement;if(!parent)return;
   event.preventDefault();event.stopPropagation();
   const box=root.getBoundingClientRect(),host={left:0,top:0,width:window.innerWidth,height:window.innerHeight},side=event.target.dataset.side||'';
   const start={x:box.left-host.left,y:box.top-host.top,w:box.width,h:box.height,px:event.clientX,py:event.clientY};
   root.setPointerCapture(event.pointerId);
   this.adjusting=true;
   const move=e=>{
    const dx=e.clientX-start.px,dy=e.clientY-start.py;let{x,y,w,h}=start;
    if(!side){x+=dx;y+=dy;}else{if(side.includes('e'))w+=dx;if(side.includes('s'))h+=dy;if(side.includes('w')){x+=dx;w-=dx;}if(side.includes('n')){y+=dy;h-=dy;}}
    w=Math.min(host.width,Math.max(Math.min(180,host.width),w));h=Math.min(host.height,Math.max(Math.min(60,host.height),h));x=Math.max(0,Math.min(host.width-w,x));y=Math.max(0,Math.min(host.height-h,y));
    this.rect={x:x/host.width,y:y/host.height,w:w/host.width,h:h/host.height};this.place(this.rect);
   };
   const end=()=>{this.adjusting=false;root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',end);root.removeEventListener('pointercancel',end);root.removeEventListener('lostpointercapture',end);this.pointerTracking?.refresh();if(this.rect)chrome.storage.local.set({[this.key]:this.rect});};
   root.addEventListener('pointermove',move);root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end);
  }
 };
})();
