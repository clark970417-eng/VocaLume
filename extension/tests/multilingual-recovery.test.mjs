import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateTranslation,phraseTranslation} from '../translation-policy.mjs';
import {alreadyTargetLanguage,shouldTranslateReading} from '../translation-guards.mjs';

const text={ja:'明日は配信を休みます。',zh:'明天會暫停直播。',en:'There will be no stream tomorrow.',ko:'내일은 방송을 쉬겠습니다.',es:'Mañana no habrá transmisión.',fr:'Il n’y aura pas de diffusion demain.',de:'Morgen gibt es keinen Stream.',pt:'Amanhã não haverá transmissão.',it:'Domani non ci sarà una diretta.',ru:'Завтра трансляции не будет.',th:'พรุ่งนี้ไม่มีการถ่ายทอดสด',vi:'Ngày mai sẽ không phát trực tiếp.',id:'Besok tidak ada siaran langsung.',ar:'لن يكون هناك بث غداً.'};

test('all 182 supported language pairs accept valid scripts and preserve literal-only chunks',()=>{
 for(const from of Object.keys(text))for(const to of Object.keys(text)){
  if(from===to)continue;
  const direction=`${from}-${to}`;
  assert.equal(validateTranslation(text[to],direction,text[from]),text[to],direction);
  for(const literal of ['🎉🎮','٧/١٤','7/14','https://example.invalid/live/123']){
   assert.equal(phraseTranslation(literal,direction),literal,direction);
   assert.equal(validateTranslation(literal,direction,literal),literal,direction);
  }
 }
});

test('every target rejects empty output, model commentary and missing prose',()=>{
 for(const to of Object.keys(text)){
  const from=to==='ja'?'ko':'ja',direction=`${from}-${to}`;
  for(const invalid of ['', '   ', '🎉🎮', '7/14', 'https://example.invalid/live/123','<think>analysis</think>', 'Translation: '+text[to]])assert.throws(()=>validateTranslation(invalid,direction,text[from]),undefined,direction+' '+invalid);
 }
 for(const to of ['ko','ru','th','ar'])assert.throws(()=>validateTranslation(text.en,`ja-${to}`,text.ja),undefined,to);
 for(const to of ['en','es','fr','de','pt','it','vi','id'])assert.throws(()=>validateTranslation(text.ko,`ja-${to}`,text.ja),undefined,to);
 // Same alphabet is ambiguous: legitimate unchanged words must not be rejected.
 assert.equal(validateTranslation('OK','en-es','OK'),'OK');
 assert.equal(validateTranslation('東京','en-ja','Tokyo'),'東京','valid Han-only Japanese does not require kana');
});

test('names in another script do not count as translated prose or force false failure',()=>{
 for(const to of Object.keys(text)){
  if(to==='ja')continue;
  const source='まほろは明日来ません。', translated='まほろ '+text[to];
  assert.equal(validateTranslation(translated,`ja-${to}`,source),translated,to);
  assert.throws(()=>validateTranslation('まほろ 🎉',`ja-${to}`,source),undefined,to);
 }
});

test('already-target guards cover distinctive scripts without guessing among Latin languages',()=>{
 for(const to of ['ko','ru','ar','th']){
  const value='まほろ '+text[to];
  assert.equal(alreadyTargetLanguage(value,'ja',to),true,to);
  assert.equal(shouldTranslateReading(value,'ja',to),false,to);
  assert.equal(alreadyTargetLanguage(value+' 明日は休みです。','ja',to),false,to);
  assert.equal(alreadyTargetLanguage(value+' English words','en',to),false,to);
  assert.equal(alreadyTargetLanguage('٧/١٤','ja',to),false,to);
 }
 for(const from of ['en','es','fr','de','pt','it','vi','id'])assert.equal(alreadyTargetLanguage(text.en,from,'fr'),from==='fr');
 assert.equal(shouldTranslateReading('ạ ộ ự','vi','ja'),true,'Vietnamese letters outside the old Latin-1 range');
 assert.equal(shouldTranslateReading('https://example.invalid/ạ','vi','ja'),false,'URL letters alone are not prose');
 assert.equal(shouldTranslateReading('٧/١٤','ar','en'),false,'Arabic numerals alone are not prose');
});
