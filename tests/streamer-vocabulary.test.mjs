import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {entries,greetingTranslation,normalizeGreetingSource,isStandaloneGreeting} from '../streamer-vocabulary.mjs';
import {phraseTranslation,validateTranslation} from '../translation-policy.mjs';

test('creator greetings share Japanese, romaji, case and width variants',()=>{
 for(const [source,target] of [['こんまほ','你好！'],['KonMaho','你好！'],['ＫＯＮＭＡＨＯ','你好！'],['コンマホ','你好！'],['ｺﾝﾏﾎ','你好！'],['otsukano','辛苦了！'],['おつかのでした','辛苦了！'],['こんぺこ','你好！'],['おはぺこ','早安！'],['おやすみぺこ','晚安！'],['おつこよ','辛苦了！']]){
  assert.equal(greetingTranslation(source),target,source);
  assert.equal(phraseTranslation(source,'ja-zh'),target,source);
 }
 assert.equal(greetingTranslation('🌙こんまほ〜！👋'),'🌙你好～!👋');
 assert.equal(greetingTranslation('おつかの🐾'),'辛苦了！🐾');
 assert.equal(greetingTranslation('おつぺこー'),'辛苦了～');
 assert.equal(entries.length,8);
});

test('unknown names, questions, ordinary words and quoted catchphrases stay with the model',()=>{
 for(const text of ['こんなこと','こんたろう','紺真帆','konmahogany','おつかのじゃない','こんまほ？','「こんまほ」','otsukano is a greeting','#konmaho','おつかのまほろ']){
  assert.equal(greetingTranslation(text),undefined,text);
  assert.equal(isStandaloneGreeting(text),false,text);
 }
 assert.equal(phraseTranslation('晚上好','zh-ja'),undefined);
 assert.equal(phraseTranslation('辛苦了','zh-ja'),undefined);
});

test('longer opening greetings normalize only the salutation and retain all remaining text',()=>{
 for(const [source,target] of [
  ['こんまほ、鹿乃まほろです！今日はゲームしないよ。','こんにちは、鹿乃まほろです！今日はゲームしないよ。'],
  ['👋Konmaho! まほろちゃん、ありがとう。','👋こんにちは! まほろちゃん、ありがとう。'],
  ['おつかの～！また明日ね。','お疲れさまでした！また明日ね。'],
  ['おつぺこでした。今日は楽しかった。','お疲れさまでした。今日は楽しかった。'],
  ['コンコヨ、博衣こよりだよ！','こんにちは、博衣こよりだよ！']
 ])assert.equal(normalizeGreetingSource(source),target);
 for(const text of ['こんな感じ','こんまほ学園','「こんまほ」は挨拶です','こんまほ？','Konmahogany wood','鹿乃まほろちゃん'])assert.equal(normalizeGreetingSource(text),text);
 assert.equal(validateTranslation('兎田ぺこら今天辛苦了。','ja-zh','おつぺこ、兎田ぺこらさんありがとう。'),'兎田ぺこら今天辛苦了。');
 assert.throws(()=>validateTranslation('這是こんにちは。','ja-zh','こんまほ'));
});

test('packaged content scripts load the same catalogue before scanning and both releases include it',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 for(const group of manifest.content_scripts){
  assert.equal(group.js[0],'streamer-vocabulary.js');
  for(const script of group.js)assert.ok(fs.existsSync(new URL('../'+script,import.meta.url)));
 }
 const workflow=fs.readFileSync(new URL('../.github/workflows/beta.yml',import.meta.url),'utf8');
 assert.match(workflow,/streamer-vocabulary\.js streamer-vocabulary\.mjs/);
});
