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

test('curated creator and platform names preserve the original spelling',()=>{
 const source='星街すいせい、甘狼このみと胡桃のあがYouTubeで配信します。';
 const p=protectNames(source);
 assert.deepEqual(p.entries.map(entry=>entry.source),['星街すいせい','甘狼このみ','胡桃のあ','YouTube']);
 assert.equal(p.restore(p.text),source);
 assert.equal(protectNames('VocaLumeX and Discordian').entries.length,0);
});

test('new names are inferred from names, handles and honorifics with clear context',()=>{
 const cases=[
  ['昨日は月守澪さんと会った。',['月守澪さん']],
  ['春白こはくさん、りつねちゃん、レヴィアさんと配信します。',['春白こはくさん','りつねちゃん','レヴィアさん']],
  ['お名前は「雪梨ころん」です。',['雪梨ころん']],
  ['「雪梨ころん」という名前を覚えました。',['雪梨ころん']],
  ['私の名前は星咲みとです。',['星咲みと']],
  ['私は雪梨ころんと申します。',['雪梨ころん']],
  ['はじめまして、山吹凪と申します。',['山吹凪']],
  ['我叫林雨澄，今天第一次來。',['林雨澄']],
  ['我的名字是「谷原理沙」。',['谷原理沙']],
  ['My name is Nessa O’Rian.',['Nessa O’Rian']],
  ['Nessa O’Rian replied to @blue_sora.',['Nessa O’Rian','@blue_sora']],
  ['김하늘 씨와 민서님께 인사했어요.',['김하늘 씨','민서님']],
  ['제 이름은 유서린입니다.',['유서린']]
 ];
 for(const [source,expected] of cases){
  const p=protectNames(source);
  assert.deepEqual(p.entries.map(entry=>entry.source),expected,source);
  assert.equal(p.restore(p.text),source);
 }
 const mapped=protectNames('月守澪さんと会った。',[{source:'月守澪',target:'Tsukimori Mio'}]);
 assert.equal(mapped.restore(mapped.text),'Tsukimori Mioさんと会った。');
 assert.equal(shouldTranslateReading('我很喜歡月守澪さん','ja','zh'),false);
 assert.equal(shouldTranslateReading('月守澪さんは配信します','ja','zh'),true);
});

test('common honorific forms, ordinary quotes, emails and URLs stay unmasked',()=>{
 for(const text of [
  '皆さん、たくさんのコメントありがとう！','お母さんとお父さんはねこちゃんを飼っています。',
  '配信者さんとお客さんが話しています。','「こんにちは」と言いました。','ゲームさんに会った。',
  '魚屋さんとパン屋さんに寄った。',
  '私の名前は秘密です。','名前はなんですか。','名前は読めないです。','こんにちはと申します。',
  'Great Stream Today!','我叫外送。','我叫他去。','선생님과 시청자님 모두 감사합니다.',
  'Write to someone@Discord.test or visit https://www.youtube.com/@blue_sora'
 ])assert.equal(protectNames(text).entries.length,0,text);
});

test('ambiguous unquoted introductions do not lock ordinary Chinese or Japanese words',()=>{
 for(const source of [
  '我叫大家等等。','我叫朋友過來。','我叫車過來。','我叫妈妈进来。',
  '我叫老師。','名前はまだです。','名前は大切です。','ハンドルネームは同じです。'
 ])assert.equal(protectNames(source).text,source,source);
 assert.deepEqual(protectNames('我叫林雨澄，今天第一次來。').entries.map(entry=>entry.source),['林雨澄']);
 assert.deepEqual(protectNames('名前は「大切」です。').entries.map(entry=>entry.source),['大切']);
 assert.deepEqual(protectNames('私の名前は星咲みとです。').entries.map(entry=>entry.source),['星咲みと']);
});

test('marker recovery accepts only an exact, unused literal for each missing name',async()=>{
 const p=protectNames('レヴィアさんとレヴィアさんが来た。');
 assert.equal(p.restore('［ＮＡＭＥ０］和レヴィアさん都來了。'),'レヴィアさん和レヴィアさん都來了。');
 assert.equal(p.restore('レヴィアさん和レヴィアさん都來了。'),'レヴィアさん和レヴィアさん都來了。');
 assert.throws(()=>p.restore('只有レヴィアさん來了。'),/遺漏人名/);
 assert.throws(()=>p.restore('[NAME0]和[NAME0]都來了。'),/重複了人名/);
 assert.throws(()=>p.restore('[NAME0]和[NAME9]都來了。'),/標記不完整/);
 assert.throws(()=>protectNames('Mahoro is live.').restore('Mahorology 正在直播。'),/遺漏人名/);
 const {validateTranslation}=await import('../translation-policy.mjs');
 const source='レヴィアさんは明日来ません。';
 const result=protectNames(source).restore('レヴィアさん明天不會來。');
 assert.equal(validateTranslation(result,'ja-zh',source),'レヴィアさん明天不會來。');
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

test('streamer chat skips the selected language and translates identifiable foreign messages', async () => {
  const {streamerChatDirection} = globalThis.VocaLumeTranslationGuards;
  const detectEnglish = async () => ({isReliable: true, languages: [{language: 'en', percentage: 99}]});
  assert.equal(await streamerChatDirection('こんばんは！', 'ja'), null);
  assert.equal(await streamerChatDirection('今天直播好好看！', 'ja'), 'zh-ja');
  assert.equal(await streamerChatDirection('안녕하세요!', 'ja'), 'ko-ja');
  assert.equal(await streamerChatDirection('Thanks for streaming!', 'ja', detectEnglish), 'en-ja');
  assert.equal(await streamerChatDirection('Thanks for streaming!', 'en', detectEnglish), null);
  assert.equal(await streamerChatDirection('https://example.invalid/abc 😄 草 www', 'ja', detectEnglish), null);
  assert.equal(await streamerChatDirection('Nice', 'ja', async () => ({isReliable: false})), null);
});

test('streamer chat recovers an English sentence misclassified by Chromium without guessing on short Latin messages', async () => {
  const {streamerChatDirection} = globalThis.VocaLumeTranslationGuards;
  const detectZulu = async () => ({isReliable: false, languages: [{language: 'zu', percentage: 100}]});
  const sentence = 'I really enjoyed your live broadcast!';
  assert.equal(await streamerChatDirection(sentence, 'ja', detectZulu), 'en-ja');
  assert.equal(await streamerChatDirection(sentence, 'en', detectZulu), null);
  assert.equal(await streamerChatDirection('Sawubona', 'ja', detectZulu), null);
  const detectFrench = async () => ({isReliable: true, languages: [{language: 'fr', percentage: 100}]});
  assert.equal(await streamerChatDirection('Merci beaucoup pour cette émission !', 'ja', detectFrench), 'fr-ja');
  assert.equal(await streamerChatDirection('Merci beaucoup pour cette émission !', 'fr', detectFrench), null);
});

test('livestream wording disambiguates broadcast vocabulary in English and both Chinese–Japanese directions', async () => {
  const {normalizeLivestreamChat} = await import('../translation-policy.mjs');
  assert.equal(normalizeLivestreamChat('Thank you for the wonderful stream!', 'en-ja'), 'Thank you for the wonderful live broadcast!');
  assert.equal(normalizeLivestreamChat('The stream flows through the forest.', 'en-ja'), 'The stream flows through the forest.');
  assert.equal(normalizeLivestreamChat('昨日の配信アーカイブを見ました。', 'ja-zh'), '昨日のライブ配信の録画を見ました。');
  assert.equal(normalizeLivestreamChat('我會看直播回放。', 'zh-ja'), '我會看直播的錄影。');
});

test('typed drafts preserve laughter without treating a web address as laughter', async () => {
 const {protectDraftText}=await import('../translation-policy.mjs');
 const draft=protectDraftText('好好笑ww，網址是 www.example.com','zh','ja');
 assert.deepEqual(draft.entries.filter(entry=>/^w+$/i.test(entry.source)).map(entry=>entry.source),['ww']);
 assert.equal(draft.restore(draft.text),'好好笑ww，網址是 www.example.com');
});
