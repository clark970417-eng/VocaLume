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
async function run({saved,country='ko',path='/',click,fail=false,browser=['en-US']}={}){
 const callbacks={},redirects=[];let stored=saved,requests=0;
 const items=['zh-Hant','zh-Hans','en','ja','ko'].map(lang=>({dataset:{language:lang},addEventListener:(event,cb)=>callbacks[lang]=cb,focus(){}}));
 const trigger={addEventListener(){},setAttribute(){},focus(){}};
 const menu={hidden:true,querySelectorAll:()=>items};
 const root={querySelector:selector=>selector==='button'?trigger:menu,addEventListener(){},contains:()=>true};
 const location={pathname:path,hash:'#demo',search:'?test=1',replace:value=>redirects.push(value),assign:value=>redirects.push(value)};
 const context={document:{documentElement:{lang:'zh-Hant'},querySelector:()=>root,addEventListener(){}},navigator:{languages:browser},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},location,AbortController,setTimeout,clearTimeout,fetch:async()=>{requests++;if(fail)throw Error();return {ok:true,json:async()=>({language:country})}}};
 vm.runInNewContext(source,context);if(click)callbacks[click]();
 await new Promise(resolve=>setTimeout(resolve,5));
 return {redirects,stored,requests};
}
test('first root visit follows country and keeps query/hash',async()=>assert.deepEqual((await run()).redirects,['ko.html?test=1#demo']));
test('saved and explicit page choices avoid geolocation',async()=>{
 const saved=await run({saved:'ja'});assert.equal(saved.requests,0);assert.deepEqual(saved.redirects,['ja.html#demo']);
 assert.equal((await run({path:'/en.html'})).requests,0);
});
test('manual current-language selection wins a pending response',async()=>{
 const r=await run({click:'zh-Hant'});assert.equal(r.stored,'zh-Hant');assert.deepEqual(r.redirects,[]);
});
test('failed or missing geolocation falls back to browser language',async()=>{
 assert.deepEqual((await run({fail:true,browser:['ja-JP']})).redirects,['ja.html?test=1#demo']);
 assert.deepEqual((await run({country:null,browser:['zh-CN']})).redirects,['zh-CN.html?test=1#demo']);
});
