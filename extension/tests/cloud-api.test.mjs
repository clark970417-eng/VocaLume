import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as api from '../cloud-api.mjs';
const messages = [{role:'system',content:'Translate Japanese into Traditional Chinese; return only the translation.'},{role:'user',content:'明日は配信を休みます。'}];
const profile = (id, overrides={}) => ({...api.apiProfile({},id), model:'test-model',apiKey:'test-secret',...overrides});
const complete = text => ({choices:[{finish_reason:'stop',message:{content:text}}]});

test('saved legacy keys migrate only to their own provider; fixed hosts cannot be overridden', () => {
 const saved={nvidiaKey:'legacy-nvidia',openrouterKey:'legacy-router'};
 assert.equal(api.selectedApi(saved),'auto');
 assert.equal(api.apiProfile(saved,'nvidia').apiKey,'legacy-nvidia');
 assert.equal(api.apiProfile(saved,'openrouter').apiKey,'legacy-router');
 assert.equal(api.apiProfile(saved,'openai').apiKey,'');
 const cloudTranslation=api.apiSettingsUpdate(saved,{provider:'nvidia',model:'a-model',apiKey:''});
 assert.equal(cloudTranslation.profiles.nvidia.apiKey,'legacy-nvidia');
 assert.equal(api.apiProfile({cloudTranslation:{profiles:{openai:{baseUrl:'https://wrong.example',apiKey:'own'}}}},'openai').baseUrl,'https://api.openai.com/v1');
 const removed=api.apiSettingsUpdate({cloudTranslation},{provider:'nvidia',model:'a-model',clearKey:true});
 assert.equal(api.apiProfile({...saved,cloudTranslation:removed},'nvidia').apiKey,'','empty replacement does not resurrect the old key');
});

test('custom endpoints pin existing credentials and only allow HTTPS or loopback HTTP', () => {
 const current={cloudTranslation:api.apiSettingsUpdate({}, {provider:'custom',model:'test',baseUrl:'https://one.example/v1/chat/completions',apiKey:'existing-key'})};
 assert.equal(api.apiProfile(current).baseUrl,'https://one.example/v1');
 assert.throws(()=>api.apiSettingsUpdate(current,{provider:'custom',model:'test',baseUrl:'https://two.example/v1'}),/重新輸入/);
 assert.equal(api.apiSettingsUpdate(current,{provider:'custom',model:'test',baseUrl:'https://two.example/v1',apiKey:'new-key'}).profiles.custom.apiKey,'new-key');
 for(const url of ['http://public.example/v1','https://u:p@one.example/v1','https://one.example/v1?key=secret','https://one.example/v1#secret','file:///tmp/a','javascript:alert(1)']) assert.throws(()=>api.apiEndpoint(url),url);
 assert.equal(api.apiEndpoint('http://127.0.0.1:1234/v1/').origin,'http://127.0.0.1/*');
 assert.equal(api.apiSettingsUpdate({}, {provider:'custom',model:'test',baseUrl:'http://localhost:1234/v1'}).profiles.custom.apiKey,'');
 assert.throws(()=>api.apiSettingsUpdate({}, {provider:'custom',model:'test',baseUrl:'https://public.example/v1'}),/API Key/);
});

for (const id of ['openai','nvidia','openrouter','custom']) test(`${id} sends the configured model through Chat Completions with isolated credentials`, async () => {
 const p=profile(id,id==='custom'?{baseUrl:'https://custom.example/v1'}:{});
 let observed;
 const output=await api.requestApi(p,messages,undefined,{permissions:{contains:async()=>true},fetchImpl:async(url,options)=>{observed={url,...options,body:JSON.parse(options.body)};return {ok:true,json:async()=>complete('明天不會直播。')};}});
 assert.equal(output,'明天不會直播。');
 assert.equal(observed.url,`${p.baseUrl}/chat/completions`);
 assert.equal(observed.body.model,'test-model');
 assert.deepEqual(observed.body.messages,messages);
 assert.equal(observed.headers.Authorization,'Bearer test-secret');
 assert.equal(observed.headers['x-goog-api-key'],undefined);
 assert.equal(observed.redirect,'manual');assert.equal(observed.credentials,'omit');
 assert.equal(id==='openai'?observed.body.max_completion_tokens:observed.body.max_tokens,2048);
 if(id==='openai'){assert.equal(observed.body.max_tokens,undefined);assert.equal(observed.body.temperature,undefined);assert.equal(observed.body.store,false);}
});

test('Gemini separates system/user content, excludes thought text and keeps the key out of the URL', async () => {
 let observed;
 const value=await api.requestApi(profile('gemini'),messages,undefined,{fetchImpl:async(url,options)=>{observed={url,...options,body:JSON.parse(options.body)};return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'internal reasoning',thought:true},{text:'明天不會直播。'}]}}]})};}});
 assert.equal(value,'明天不會直播。');
 assert.equal(observed.url,'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
 assert(!observed.url.includes('secret'));assert.equal(observed.headers['x-goog-api-key'],'test-secret');
 assert.equal(observed.headers.Authorization,undefined);assert.equal(observed.body.systemInstruction.parts[0].text,messages[0].content);
 assert.deepEqual(observed.body.contents,[{role:'user',parts:[{text:messages[1].content}]}]);
});

test('Claude uses the Messages protocol and text blocks rather than reasoning blocks', async () => {
 let observed;
 const value=await api.requestApi(profile('anthropic'),messages,undefined,{fetchImpl:async(url,options)=>{observed={url,...options,body:JSON.parse(options.body)};return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'thinking',thinking:'internal reasoning'},{type:'text',text:'明天不會直播。'}]})};}});
 assert.equal(value,'明天不會直播。');assert.equal(observed.url,'https://api.anthropic.com/v1/messages');
 assert.equal(observed.headers['x-api-key'],'test-secret');assert.equal(observed.headers['anthropic-version'],'2026-10-21');
 assert.equal(observed.body.system,messages[0].content);assert.deepEqual(observed.body.messages,[messages[1]]);
});

test('truncation, refusal and empty output cannot be accepted as a translation', () => {
 for(const [data,format] of [[{choices:[{finish_reason:'length',message:{content:'partial'}}]},'openai'],[{choices:[{finish_reason:'content_filter'}]},'compatible'],[{choices:[{finish_reason:'stop',message:{content:''}}]},'compatible'],[{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]},'gemini'],[{stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]},'anthropic']]) assert.throws(()=>api.apiResponse(data,format));
});

test('permission denial, provider errors, malformed JSON, cancellation and redirects are bounded without leaking credentials', async () => {
 let calls=0;const fetchImpl=async()=>{calls++;return {ok:false,status:401,json:async()=>({error:'echo test-secret'})};};
 await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl,permissions:{contains:async()=>false}}),/允許連線/);assert.equal(calls,0);
 await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl}),error=>/401/.test(error.message)&&!error.message.includes('test-secret'));
 for(const status of [429,404,500]) await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl:async()=>({ok:false,status})}),new RegExp(String(status)));
 await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl:async()=>({ok:true,json:async()=>{throw Error('test-secret echoed by JSON parser');}})}),error=>/格式不正確/.test(error.message)&&!error.message.includes('test-secret'));
 const controller=new AbortController();controller.abort();
 await assert.rejects(api.requestApi(profile('openai'),messages,controller.signal,{fetchImpl:async()=>{throw Error('abort');}}),/取消/);
 await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl:async()=>{throw Error('redirect includes test-secret');}}),error=>/無法連線/.test(error.message)&&!error.message.includes('test-secret'));
});

test('model and credential changes invalidate cached translation identities without embedding the secret', () => {
 const first={cloudTranslation:api.apiSettingsUpdate({}, {provider:'openai',model:'a',apiKey:'one'})};
 const second={cloudTranslation:api.apiSettingsUpdate(first,{provider:'openai',model:'b',apiKey:'two'})};
 assert.notEqual(api.apiCacheScope(first),api.apiCacheScope(second));assert(!api.apiCacheScope(first).includes('one'));
});

test('real loopback HTTP transport translates through a custom server and refuses a credential-bearing redirect', async t => {
 const received=[];
 const server=http.createServer((req,res)=>{
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
   received.push({url:req.url,key:req.headers.authorization,body:JSON.parse(body)});
   if(req.url.startsWith('/redirect/')){res.writeHead(302,{Location:'/stolen'});res.end();return;}
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(complete('明天不會直播。')));
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal(await api.requestApi(profile('custom',{baseUrl:base+'/v1',apiKey:''}),messages),'明天不會直播。');
 assert.equal(received[0].url,'/v1/chat/completions');assert.equal(received[0].key,undefined);
 await assert.rejects(api.requestApi(profile('custom',{baseUrl:base+'/redirect',apiKey:'local-secret'}),messages),/無法連線/);
 assert.deepEqual(received.map(r=>r.url),['/v1/chat/completions','/redirect/chat/completions']);
});

test('a long rate-limit wait or cancellation never replays a selected-provider request',async()=>{
 let attempts=0;
 await assert.rejects(api.requestApi(profile('openai'),messages,undefined,{fetchImpl:async()=>{
  attempts++;
  return {ok:false,status:429,headers:new Headers({'Retry-After':'60'})};
 }}),/429/);
 assert.equal(attempts,1);

 const controller=new AbortController();
 const request=api.requestApi(profile('openai'),messages,controller.signal,{fetchImpl:async()=>{
  attempts++;
  return {ok:false,status:503};
 }});
 await new Promise(resolve=>setTimeout(resolve,0));
 controller.abort();
 await assert.rejects(request,/取消/);
 assert.equal(attempts,2);
});
