import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../streamer-vocabulary.mjs';
import {protectNames,alreadyTargetLanguage,shouldTranslateReading,isNonLinguisticText} from '../translation-guards.mjs';

test('literal-only lines bypass translation without hiding real language or Han-only words',()=>{
 for(const text of ['🎉🎉','7/14','123.45%','https://example.invalid/live/123','@kano_123 #Live','viewer@example.invalid','🐟 08:30 / 10:00'])assert.equal(isNonLinguisticText(text),true,text);
 for(const text of ['','無料','有料','好き','好開心','See you','https://example.invalid/live ありがとう','@kano 明日ね'])assert.equal(isNonLinguisticText(text),false,text);
});

test('names and honorifics survive translation without invented kanji or substring replacements',()=>{
 const protectedText=protectNames('まほろちゃんと鹿乃まほろ、Mahoroとマホロさん。まほろばとマホロア。');
 assert.equal(protectedText.text,'[NAME0]と[NAME1]、[NAME2]と[NAME3]。まほろばとマホロア。');
 assert.equal(protectedText.restore('[NAME0]和[NAME1]、[NAME2]和[NAME3]。'),'まほろちゃん和鹿乃まほろ、Mahoro和マホロさん。');
 assert.equal(protectNames('Mahorology').entries.length,0);
 assert.equal(protectNames('まほろは明日来ません。').text,'[NAME0]は明日来ません。');
 assert.equal(protectNames('鹿乃まほろ').entries.length,1);
});
test('user spelling wins, complex glossary compounds remain available and literal tokens do not collide',()=>{
 const p=protectNames('まほろちゃん、[NAME0]',[{source:'まほろ',target:'真幌'}]);
 assert.equal(p.text,'[VNAME0]、[NAME0]');
 assert.equal(p.restore('[VNAME0]、[NAME0]'),'真幌ちゃん、[NAME0]');
 assert.equal(protectNames('まほろの庭',[{source:'まほろの庭',target:'花園'}]).entries.length,0);
 assert.equal(protectNames('ひかりさん',[{source:'ひかり',target:'ひかり'}]).restore('[NAME0]'),'ひかりさん');
});
test('missing names fail explicitly and partial output never leaks markers',()=>{
 const p=protectNames('まほろと鹿乃まほろ');
 assert.throws(()=>p.restore('真弘和[NAME1]'),/遺漏人名/);
 assert.equal(p.restorePartial('先等[NA'),'先等');
 assert.equal(p.restorePartial('[NAME0]和[NAME'),'まほろ和');
 assert.equal(p.restore('［ name 0 ］和[NAME1]'),'まほろ和鹿乃まほろ');
});
test('Chinese with names is already Chinese, while Japanese clauses and deliberate Chinese-to-Japanese remain translatable',()=>{
 for(const text of ['まほろ今天直播辛苦了！','我很喜歡鹿乃まほろちゃん','まほろちゃん好可愛','這是中文。','这是中文。']) {
  assert.equal(shouldTranslateReading(text,'ja','zh'),false,text);
  assert.equal(alreadyTargetLanguage(text,'ja','zh'),true,text);
  assert.equal(alreadyTargetLanguage(text,'zh','ja'),false,text);
  assert.equal(shouldTranslateReading(text,'zh','ja'),true,text);
 }
 for(const text of ['まほろは明日来ません。','まほろの配信が好きです。','今日は配信ありがとう！','中文の勉強をしています。','「你好」と言いました。','まほろばに行きたい']) {
  assert.equal(alreadyTargetLanguage(text,'ja','zh'),false,text);
  assert.equal(shouldTranslateReading(text,'ja','zh'),true,text);
 }
 assert.equal(shouldTranslateReading('まほろ','ja','zh'),false);
 assert.equal(shouldTranslateReading('こんまほ','ja','zh'),true);
 assert.equal(alreadyTargetLanguage('無料','ja','zh'),false,'shared hanzi alone are not proof of Chinese');
 assert.equal(alreadyTargetLanguage('今日はありがとう','zh','ja'),true);
});
