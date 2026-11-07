import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {languageForCountry} from '../lib/site-language.mjs';
import handler from '../api/site-language.js';

test('country mapping and unknown location',()=>{
 for(const [code,lang] of Object.entries({KR:'ko',JP:'ja',TW:'zh-Hant',HK:'zh-Hant',MO:'zh-Hant',CN:'zh-Hans',SG:'zh-Hans',US:'en',DE:'en'}))assert.equal(languageForCountry(code),lang);
 assert.equal(languageForCountry(''),null);assert.equal(languageForCountry('invalid'),null);
});
test('endpoint only returns language and disables shared caching',()=>{
 const headers={};let body;
 const response={setHeader:(k,v)=>headers[k]=v,status(code){assert.equal(code,200);return this},json(value){body=value}};
 handler({headers:{'x-vercel-ip-country':'KR'}},response);
 assert.deepEqual(body,{language:'ko'});assert.equal(headers['Cache-Control'],'private, no-store');
});
const source=readFileSync(new URL('../dist/language.js',import.meta.url),'utf8');
async function run({saved,tab=new Map(),country='ko',path='/',current='zh-Hant',search='?test=1',click,fail=false,browser=['en-US'],messages=[]}={}){
 const callbacks={},redirects=[],historyUpdates=[];let stored=saved,requests=0;
 const items=['zh-Hant','zh-Hans','en','ja','ko'].map(lang=>({dataset:{language:lang},addEventListener:(event,cb)=>callbacks[lang]=cb,focus(){}}));
 const trigger={addEventListener(){},setAttribute(){},focus(){}};
 const menu={hidden:true,querySelectorAll:()=>items};
 const root={querySelector:selector=>selector==='button'?trigger:menu,addEventListener(){},contains:()=>true};
 const location={pathname:path,hash:'#demo',search,origin:'https://vocalume.vercel.app',replace:value=>redirects.push(value),assign:value=>redirects.push(value)};
 const history={state:null,replaceState:(_,__,value)=>historyUpdates.push(value)};
 const window={addEventListener:(name,cb)=>callbacks[name]=cb};window.top=window;
 const context={document:{documentElement:{lang:current},querySelector:()=>root,addEventListener(){}},navigator:{languages:browser},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},sessionStorage:{getItem:key=>tab.get(key),setItem:(key,value)=>tab.set(key,value)},location,history,window,URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:async()=>{requests++;if(fail)throw Error();return {ok:true,json:async()=>({language:country})}}};
 vm.runInNewContext(source,context);if(click)callbacks[click]();
 for(const {data,origin=location.origin,source=window} of messages)callbacks.message?.({data,origin,source});
 await new Promise(resolve=>setTimeout(resolve,5));
 return {redirects,stored,requests,historyUpdates};
}
const bridge=(locale,live=false)=>({data:{type:'VOCALUME_UI_LANGUAGE',locale,live}});
test('first root visit follows country and keeps query/hash',async()=>assert.deepEqual((await run()).redirects,['/ko.html?test=1#demo']));
test('saved and explicit page choices avoid geolocation',async()=>{
 const saved=await run({saved:'ja'});assert.equal(saved.requests,0);assert.deepEqual(saved.redirects,['/ja.html?test=1#demo']);
 const explicit=await run({path:'/en.html',current:'en',saved:'ja'});
 assert.equal(explicit.requests,0);assert.deepEqual(explicit.redirects,[]);
});
test('manual current-language selection wins a pending response',async()=>{
 const r=await run({click:'zh-Hant',messages:[bridge('ja')]});
 assert.equal(r.stored,'zh-Hant');assert.deepEqual(r.redirects,[]);
});
test('failed or missing geolocation falls back to browser language',async()=>{
 assert.deepEqual((await run({fail:true,browser:['ja-JP']})).redirects,['/ja.html?test=1#demo']);
 assert.deepEqual((await run({country:null,browser:['zh-CN']})).redirects,['/zh-CN.html?test=1#demo']);
});

test('app link overrides the saved locale and initial extension update on the same navigation',async()=>{
 const first=await run({path:'/en.html',current:'en',saved:'en',search:'?lang=ja&test=1',messages:[bridge('ko')]});
 assert.deepEqual(first.redirects,['/ja.html?test=1&lang=ja#demo']);
 assert.equal(first.stored,'ja');
 const landed=await run({path:'/ja.html',current:'ja',saved:first.stored,search:'?test=1&lang=ja',messages:[bridge('ko')]});
 assert.equal(landed.requests,0);
 assert.deepEqual(landed.redirects,[]);
 assert.deepEqual(landed.historyUpdates,['/ja.html?test=1#demo']);
 assert.equal(landed.stored,'ja');
});

test('a live extension language change can update an explicitly opened page',async()=>{
 const result=await run({path:'/ja.html',current:'ja',search:'?lang=ja&test=1',messages:[bridge('ko',true)]});
 assert.deepEqual(result.redirects,['/ko.html?test=1#demo']);
 assert.equal(result.stored,'ko');
});

test('an app locale survives navigation in the same tab until a live extension change',async()=>{
 const tab=new Map();
 await run({tab,path:'/ja.html',current:'ja',search:'?lang=ja&test=1',messages:[bridge('ko')]});
 const guide=await run({tab,path:'/download/ja.html',current:'ja',saved:'ko',messages:[bridge('ko')]});
 assert.deepEqual(guide.redirects,[]);
 const live=await run({tab,path:'/download/ja.html',current:'ja',messages:[bridge('en',true)]});
 assert.deepEqual(live.redirects,['/download/en.html?test=1#demo']);
 const home=await run({tab,path:'/en.html',current:'en',messages:[bridge('ko')]});
 assert.deepEqual(home.redirects,[]);
 const separateTab=await run({path:'/en.html',current:'en',messages:[bridge('ko')]});
 assert.deepEqual(separateTab.redirects,['/ko.html?test=1#demo']);
});

test('choosing the current site language keeps it when opening another route in the same tab',async()=>{
 const tab=new Map();
 await run({tab,path:'/ja.html',current:'ja',click:'ja'});
 const follow=await run({tab,path:'/download/',saved:'ko',messages:[bridge('ko')]});
 assert.deepEqual(follow.redirects,['/download/ja.html?test=1#demo']);
});

test('invalid and foreign locale messages are ignored',async()=>{
 const result=await run({path:'/en.html',current:'en',messages:[
  bridge('__proto__'),
  {...bridge('ja'),origin:'https://unrelated.example'},
  {...bridge('ja'),source:{}},
 ]});
 assert.deepEqual(result.redirects,[]);
 assert.equal(result.stored,undefined);
});

test('website and extension language changes retain the current page family',async()=>{
 const fromSite=await run({path:'/download/en.html',current:'en',click:'ko'});
 assert.deepEqual(fromSite.redirects,['/download/ko.html?test=1&lang=ko#demo']);
 const fromExtension=await run({path:'/download/ja.html',current:'ja',messages:[bridge('zh-Hans')]});
 assert.deepEqual(fromExtension.redirects,['/download/zh-CN.html?test=1#demo']);
 const sameLocale=await run({path:'/en.html',current:'en',messages:[bridge('en')]});
 assert.deepEqual(sameLocale.redirects,[]);
 assert.equal(sameLocale.stored,'en');
});
