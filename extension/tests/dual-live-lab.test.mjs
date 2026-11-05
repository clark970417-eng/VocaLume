import {phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames} from '../translation-policy.mjs';
import * as cloudApi from '../cloud-api.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
test('two isolated browser profiles keep captions and stop independent', async () => {
 const source = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
 function profile(name) {
  let listener, session;
  const chrome = {
   storage: {local: {get: async () => ({speechMode:'browser', subtitleSettings:{captionMode:'realtime'}}), set: async () => {}}},
   tabs: {sendMessage: async () => {}, onRemoved: {addListener(){}}},
   offscreen: {hasDocument: async () => true},
   tabCapture: {getMediaStreamId: async () => name},
   runtime: {getURL: path => 'chrome-extension://' + name + '/' + path, onMessage: {addListener: fn => listener = fn},
    sendMessage: async message => {if (message.type === 'offscreen-start') session = message.session; return {ok:true};}}
  };
  vm.runInNewContext(source, {...cloudApi,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,splitTranslationText,TranslationMemo,firstTranslation,polishChinese,normalizeGreetingSource,gameTerminologyPrompt,protectNames,URLSearchParams,AbortSignal,AbortController,Date,console});
  return {
   call: (message, sender = {}) => new Promise(resolve => listener(message,sender,resolve)),
   result: text => listener({type:'speech-result',session,id:1,text},{url:chrome.runtime.getURL('offscreen.html')},()=>{})
  };
 }
 const first = profile('first'), second = profile('second');
 const start = {type:'subtitle-control',action:'start',tabId:7};
 const started = await Promise.all([first.call(start),second.call(start)]);
 assert(started.every(result => result.ok));
 first.result('こんにちは');
 second.result('こんまほ');
 const subtitles = profile => profile.call({type:'subtitles'},{tab:{id:7}});
 await new Promise(resolve => setImmediate(resolve));
 assert.equal((await subtitles(first)).text.items[0].original,'こんにちは');
 assert.equal((await subtitles(second)).text.items[0].original,'こんまほ');
 await first.call({type:'subtitle-control',action:'stop'});
 assert.equal((await subtitles(first)).text.items.length,0);
 assert.equal((await subtitles(second)).text.items[0].translated,'你好！');
 await second.call({type:'subtitle-control',action:'stop'});
});
