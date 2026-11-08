(() => {
  const ownedSelector='[class*="jtl-"],[id^="jtl-"]';
  const elementOf=node=>node?.nodeType===1?node:node?.parentElement;
  const owned=node=>Boolean(elementOf(node)?.closest?.(ownedSelector));

  function candidates(records,selector){
    const roots=new Set();
    const inspect=node=>{
      const element=elementOf(node);
      if(!element||owned(element))return false;
      if(element.matches?.(selector)){roots.add(element);return true;}
      if(element.querySelector?.(selector)){roots.add(element);return true;}
      const match=element.closest?.(selector);
      if(match){roots.add(match.matches?.('[role="log"],[aria-live]')?element:match);return true;}
      return false;
    };
    for(const record of records){
      if(owned(record.target))continue;
      if(record.type!=='childList'){inspect(record.target);continue;}
      const changed=[...record.addedNodes,...record.removedNodes].filter(node=>!owned(node));
      if(!changed.length)continue;
      for(const node of record.addedNodes)inspect(node);
      // Removed matching content and in-place edits need their live parent.
      if(changed.some(node=>node.nodeType===3||!node.isConnected)&&!inspect(record.target)){
        if(changed.some(node=>node.matches?.(selector)||node.querySelector?.(selector)))roots.add(record.target);
      }
    }
    return roots;
  }

  function observe(document,selector,run,{delay=250,enabled=()=>true}={}){
    let timer=null,queued=new Set(),full=false,observing=false,disconnected=false;
    const observer=new MutationObserver(records=>{
      if(!enabled()||document.hidden)return;
      if(!records)full=true;
      else if(!full){
        for(const root of candidates(records,selector))queued.add(root);
        if(queued.size>24){queued.clear();full=true;}
      }
      if(timer!==null||(!queued.size&&!full))return;
      timer=setTimeout(()=>{
        timer=null;
        const roots=full?undefined:[...queued].filter(root=>root.isConnected!==false);
        queued=new Set();full=false;
        if(enabled()&&!document.hidden)run(roots);
      },delay);
    });
    const sync=()=>{
      const active=!disconnected&&enabled()&&!document.hidden;
      if(active===observing)return;
      observing=active;
      if(active)observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,
        attributes:true,attributeFilter:['contenteditable','aria-modal','role']});
      else{
        observer.disconnect();
        if(timer!==null)clearTimeout(timer);
        timer=null;queued.clear();full=false;
      }
    };
    document.addEventListener('visibilitychange',sync);
    sync();
    return {sync,disconnect:()=>{disconnected=true;sync();document.removeEventListener('visibilitychange',sync);}};
  }

  function query(document,selector,roots){
    if(!roots)return [...document.querySelectorAll(selector)];
    const result=new Set();
    for(const root of roots){
      if(root.matches?.(selector))result.add(root);
      for(const node of root.querySelectorAll?.(selector)||[])result.add(node);
    }
    return [...result];
  }
  globalThis.VocaLumeDomWork={observe,query};
})();
