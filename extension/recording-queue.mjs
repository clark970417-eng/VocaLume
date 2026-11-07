const needsTranslation=state=>['pending','working','streaming'].includes(state);
const requestResult=request=>new Promise((resolve,reject)=>{
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
});
const transactionDone=transaction=>{
 const done=new Promise((resolve,reject)=>{
  transaction.oncomplete=resolve;
  transaction.onabort=()=>reject(transaction.error||new Error('無法儲存字幕記錄'));
 });
 // A request can reject before its transaction abort event.
 done.catch(()=>{});
 return done;
};
const publicEntry=({_sequence,...entry})=>entry;

/** Store each cue separately. A transaction commits the original before its
 * translation begins, and updates leave the original export order intact. */
export class RecordingHistory {
 constructor(factory){
  this.factory=factory;
 }
 get opened(){
  if(this.database)return this.database;
  const request=this.factory.open('vocalume-recording-history',1);
  request.onupgradeneeded=()=>{
   const entries=request.result.createObjectStore('entries',{keyPath:'key'});
   entries.createIndex('sequence','_sequence',{unique:true});
   entries.createIndex('state','state');
   request.result.createObjectStore('meta');
  };
  return this.database=requestResult(request);
 }
 async restore(loadLegacy){
  const db=await this.opened;
  const marker=await requestResult(db.transaction('meta').objectStore('meta').get('migrated'));
  if(!marker){
   const legacy=await loadLegacy();
   const tx=db.transaction(['entries','meta'],'readwrite'),done=transactionDone(tx);
   const entries=tx.objectStore('entries'),meta=tx.objectStore('meta');
   // Check again in the write transaction so reopening cannot migrate twice.
   if(!await requestResult(meta.get('migrated'))){
    let sequence=0;
    for(const row of legacy){
     if(!row||typeof row!=='object')continue;
     const key=typeof row.key==='string'&&row.key?row.key:'legacy:'+(sequence+1);
     entries.put({...row,key,_sequence:++sequence});
    }
    meta.put(sequence,'sequence');
    meta.put(true,'migrated');
   }
   await done;
  }
  const index=db.transaction('entries').objectStore('entries').index('state');
  const [pending,working,streaming,failed]=await Promise.all([
   ...['pending','working','streaming'].map(state=>requestResult(index.getAll(state))),
   requestResult(index.count('failed'))
  ]);
  const entries=[...pending,...working,...streaming].sort((a,b)=>a._sequence-b._sequence).map(publicEntry);
  return {entries,failed};
 }
 async write(rows,{insertOnly=false}={}){
  const db=await this.opened;
  const tx=db.transaction(['entries','meta'],'readwrite'),done=transactionDone(tx);
  const entries=tx.objectStore('entries'),meta=tx.objectStore('meta');
  let sequence=await requestResult(meta.get('sequence'))||0;
  let written=0;
  for(const row of rows){
   const previous=await requestResult(entries.get(row.key));
   if(previous&&insertOnly)continue;
   entries.put({...row,_sequence:previous?._sequence??++sequence});
   written++;
  }
  meta.put(sequence,'sequence');
  await done;
  return written;
 }
 async export(){
  const db=await this.opened;
  return (await requestResult(db.transaction('entries').objectStore('entries').index('sequence').getAll())).map(publicEntry);
 }
 async failedEntries(){
  const db=await this.opened;
  return (await requestResult(db.transaction('entries').objectStore('entries').index('state').getAll('failed')))
   .sort((a,b)=>a._sequence-b._sequence).map(publicEntry);
 }
}

export class RecordingQueue {
 constructor({save,translate,onChange=()=>{},onError=()=>{},timeoutMs=15000,factory,history}){
  this.timeoutMs=timeoutMs;this.save=save;this.translate=translate;this.onChange=onChange;this.onError=onError;
  this.history=history||(factory?new RecordingHistory(factory):null);
  this.byKey=new Map();this.waiting=new Set();this.views=new Map();
  this.pendingCount=0;this.failureCount=0;this.viewOrder=0;
  this.busy=false;this.writes=Promise.resolve();
 }
 get entries(){return [...this.byKey.values()];}
 get pending(){return this.pendingCount;}
 get failed(){return this.failureCount;}
 beginSession(session){
  if(!this.history)return;
  this.visibleSession=session;
  for(const [key,entry] of this.byKey)if(!needsTranslation(entry.state)&&entry.session!==session)this.byKey.delete(key);
  for(const key of this.views.keys())if(key!==session)this.views.delete(key);
 }
 updateView(entry){
  if(this.history&&entry.session!==this.visibleSession)return;
  let groups=this.views.get(entry.session);
  if(!groups){groups=new Map();this.views.set(entry.session,groups);}
  let group=groups.get(entry.group);
  if(!group){
   const order=entry.createdAt??++this.viewOrder;
   if(groups.size===4){
    const oldest=[...groups.values()].reduce((a,b)=>a.order<=b.order?a:b);
    if(order<oldest.order)return; // An old correction is exported, not brought back on screen.
    groups.delete(oldest.id);
   }
   group={id:entry.group,order,entries:new Map()};groups.set(entry.group,group);
  }
  group.entries.set(entry.key,entry);
 }
 changeState(entry,state,countPrevious=true){
  if(countPrevious){
   if(needsTranslation(entry.state))this.pendingCount--;
   if(entry.state==='failed')this.failureCount--;
  }
  entry.state=state;
  if(needsTranslation(state))this.pendingCount++;
  if(state==='failed')this.failureCount++;
  if(state==='pending')this.waiting.add(entry.key);else this.waiting.delete(entry.key);
  this.updateView(entry);
 }
 async restore(entries=[]){
  const loadLegacy=typeof entries==='function'?entries:async()=>entries;
  const stored=this.history?await this.history.restore(loadLegacy):{entries:await loadLegacy(),failed:0};
  this.byKey.clear();this.waiting.clear();this.views.clear();this.pendingCount=0;
  this.failureCount=stored.failed;
  const recovered=[];
  for(const raw of stored.entries){
   const entry={...raw};
   const state=entry.state==='working'?'pending':entry.state==='streaming'?'failed':entry.state;
   this.byKey.set(entry.key,entry);this.changeState(entry,state,false);
   if(state!==raw.state)recovered.push(entry);
  }
  if(this.history&&recovered.length)await this.persist(recovered);
  this.onChange();this.pump();
 }
 persist(changed,{insertOnly=false}={}){
  const snapshot=this.history?changed.map(e=>({...e})):this.entries.map(e=>({...e}));
  const operation=this.writes.catch(()=>{}).then(()=>this.history?this.history.write(snapshot,{insertOnly}):this.save(snapshot));
  this.writes=operation;return operation;
 }
 compact(entry){
  if(!this.history||entry.state!=='done')return;
  // Preserve visible groups and a small recent identity window for revisions.
  if(this.byKey.size<=80)return;
  for(const [key,old] of this.byKey){
   if(this.byKey.size<=80)break;
   if(old.state==='done'&&!this.views.get(old.session)?.has(old.group))this.byKey.delete(key);
  }
 }
 async add(row){
  if(this.byKey.has(row.key))return;
  const entry={...row,translated:''};this.byKey.set(entry.key,entry);
  // Queue eligibility begins only after the original has been committed.
  entry.state='saving';
  try{
   if(this.history){
    const written=await this.persist([{...entry,state:'pending'}],{insertOnly:true});
    if(!written){this.byKey.delete(entry.key);return;}
    this.changeState(entry,'pending');
   }else{
    this.changeState(entry,'pending');
    // The previous cue may complete while this write is in progress.
    this.waiting.delete(entry.key);
    await this.persist([entry]);this.waiting.add(entry.key);
   }
  }catch(error){this.byKey.delete(entry.key);this.waiting.delete(entry.key);this.onError(error);throw error;}
  this.onChange();this.pump();
 }
 async updateExternal(row){
  let entry=this.byKey.get(row.key);
  const existed=Boolean(entry);
  if(!entry){entry={key:row.key};this.byKey.set(row.key,entry);}
  const previous=entry.state;
  Object.assign(entry,row);entry.state=previous;
  this.changeState(entry,row.state,existed);this.onChange();
  try{await this.persist([entry]);this.compact(entry);}
  catch(error){this.onError(error);throw error;}
 }
 async pump(){
  if(this.busy)return;this.busy=true;
  try{
   for(;;){
    const key=this.waiting.values().next().value;
    if(key===undefined)break;
    const entry=this.byKey.get(key);this.waiting.delete(key);
    if(!entry||entry.state!=='pending')continue;
    this.changeState(entry,'working');this.onChange();
    let timer;
    try{
     entry.translated=await Promise.race([this.translate(entry.original),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('翻譯逾時，可重試')),this.timeoutMs);})]);
     delete entry.error;this.changeState(entry,'done');
    }catch(error){entry.error=String(error.message||error);this.changeState(entry,'failed');}
    finally{clearTimeout(timer);}
    try{await this.persist([entry]);this.compact(entry);}catch(error){this.onError(error);break;}
    this.onChange();
   }
  }finally{this.busy=false;}
 }
 async retry(){
  const failed=this.history?await this.history.failedEntries():this.entries.filter(entry=>entry.state==='failed');
  const changed=[];
  for(const row of failed){
   let entry=this.byKey.get(row.key);
   if(!entry){entry={...row};this.byKey.set(row.key,entry);}
   if(entry.state!=='failed')continue;
   this.changeState(entry,'pending');changed.push(entry);
  }
  if(changed.length)await this.persist(changed);
  this.pump();
 }
 async export(){
  await this.writes;
  return this.history?this.history.export():this.entries;
 }
 rows(session){
  const groups=this.views.get(session);
  if(!groups)return [];
  return [...groups.values()].sort((a,b)=>a.order-b.order).map(group=>{
   const row={id:group.id,original:'',translated:'',pending:0,failed:0,error:''};
   for(const entry of group.entries.values()){
    row.original+=(row.original?' ':'')+entry.original;
    row.translated+=(row.translated&&entry.translated?' ':'')+entry.translated;
    if(entry.state==='failed'){row.failed++;row.error=entry.error||'翻譯未完成';}
    else if(entry.state!=='done')row.pending++;
   }
   return row;
  });
 }
}
