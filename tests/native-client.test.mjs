import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeClient} from '../native-client.mjs';
test('native responses correlate by ID; disconnect rejects pending work',async()=>{
 let response,disconnected;const sent=[];
 const port={onMessage:{addListener:f=>response=f},onDisconnect:{addListener:f=>disconnected=f},postMessage:m=>sent.push(m),disconnect(){}};
 const runtime={connectNative:()=>port},client=new NativeClient(runtime);
 const a=client.request('decode'),b=client.request('translate');
 response({id:sent[0].id,event:'source',text:'日本語'});
 assert.equal(client.pending.size,2);
 response({id:sent[1].id,ok:true,result:{text:'中文'}});
 response({id:sent[0].id,ok:true,result:{text:'日本語'}});
 assert.equal((await a).text,'日本語');assert.equal((await b).text,'中文');
 const c=client.request('decode');const rejection=assert.rejects(c,/disconnected/);
 disconnected();await rejection;assert.equal(client.pending.size,0);
});
test('late caption events remain observable after a decode response',async()=>{
 let receive;const port={onMessage:{addListener:f=>receive=f},onDisconnect:{addListener(){}},postMessage(){},disconnect(){}};
 const client=new NativeClient({connectNative:()=>port});const events=[];client.onEvent=e=>events.push(e);
 const pending=client.request('decode');receive({id:1,ok:true,result:{text:'魚'}});await pending;
 receive({event:'caption',segment:'one',result:{text:'魚',translated:'魚'}});
 assert.equal(events.length,1);assert.equal(client.pending.size,0);client.close();
});

test('a text request retries once on a fresh host, but never retries a logical error',async()=>{
 const ports=[];
 const runtime={lastError:{message:'Native host has exited.'},connectNative(){
  const port={onMessage:{addListener:f=>port.receive=f},onDisconnect:{addListener:f=>port.died=f},disconnect(){},postMessage(m){port.sent=m;}};
  ports.push(port);return port;
 }};
 const client=new NativeClient(runtime),reply=client.request('translate',{text:'今日は',direction:'ja-zh'},2000);
 ports[0].died();
 await new Promise(resolve=>setTimeout(resolve,240));
 assert.equal(ports.length,2);
 ports[0].receive({id:ports[0].sent.id,ok:true,result:{text:'stale'}});
 ports[1].receive({id:ports[1].sent.id,ok:true,result:{text:'今天'}});
 assert.equal((await reply).text,'今天');
 const logical=client.request('translate');
 ports[1].receive({id:ports[1].sent.id,ok:false,error:'Invalid text'});
 await assert.rejects(logical,/Invalid text/);assert.equal(ports.length,2);client.close();
});
