import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('incremental DOM work ignores unrelated and extension updates and stops when disabled or hidden',()=>{
 let notify,observing=false,timer,enabled=true;
 const runs=[],events=new Map(),document={hidden:false,documentElement:{},
  addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),
  querySelectorAll(){throw Error('a scoped query must not scan the whole document');}};
 const api=vm.runInNewContext(readFileSync(new URL('../dom-work.js',import.meta.url),'utf8')+'\nVocaLumeDomWork',{
  MutationObserver:class{constructor(cb){notify=cb;}observe(){observing=true;}disconnect(){observing=false;}},
  setTimeout:cb=>{timer=cb;return 1;},clearTimeout:()=>{timer=undefined;}
 });
 const make=({match=false,owned=false,children=[]}={})=>({nodeType:1,isConnected:true,
  matches:selector=>match&&selector==='.message',
  closest:selector=>selector==='.message'?null:owned?{}:null,
  querySelector:()=>children[0]||null,querySelectorAll:()=>children});
 const container=make(),message=make({match:true}),wrapper=make({children:[message]});
 const work=api.observe(document,'.message',roots=>runs.push(roots),{enabled:()=>enabled});
 const add=node=>({type:'childList',target:container,addedNodes:[node],removedNodes:[]});
 assert.equal(observing,true);
 notify([add(make()),add(make({match:true,owned:true}))]);
 assert.equal(timer,undefined);
 notify([add(wrapper)]);timer();
 assert.deepEqual([...runs[0]],[wrapper]);
 assert.deepEqual([...api.query(document,'.message',runs[0])],[message]);
 notify([add(message)]);document.hidden=true;events.get('visibilitychange')();
 assert.equal(observing,false);assert.equal(timer,undefined);
 document.hidden=false;events.get('visibilitychange')();assert.equal(observing,true);
 enabled=false;work.sync();assert.equal(observing,false);
 work.disconnect();assert.equal(events.has('visibilitychange'),false);
});
