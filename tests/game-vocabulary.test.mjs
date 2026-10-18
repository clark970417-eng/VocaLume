import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entries,gameTermTranslation,selectGameTerminology} from '../game-vocabulary.mjs';
import {phraseTranslation,gameTerminologyPrompt} from '../translation-policy.mjs';

test('unambiguous Pokemon names translate in both directions without inference',()=>{
 for(const term of entries.filter(e=>e.standalone)){
  assert.equal(gameTermTranslation(term.ja,'ja','zh'),term.zh);
  assert.equal(gameTermTranslation(term.zh,'zh','ja'),term.ja);
 }
 assert.equal(phraseTranslation('ピカチュウ','ja-zh'),'皮卡丘');
 assert.equal(phraseTranslation('噴火龍','zh-ja'),'リザードン');
 assert.equal(gameTermTranslation('ピカチュウじゃない','ja','zh'),undefined);
 assert.equal(gameTermTranslation('皮卡丘？','zh','ja'),undefined);
 assert.equal(gameTermTranslation('皮卡丘','zh','en'),undefined);
});

test('game-specific terms require matching context rather than unrelated everyday senses',()=>{
 assert.deepEqual(selectGameTerminology('色違いの服を買った','ja','zh'),[]);
 assert.deepEqual(selectGameTerminology('媽媽倒地後送醫','zh','ja'),[]);
 assert.deepEqual(selectGameTerminology('ファントムというオペラ','ja','zh'),[]);
 assert.deepEqual(selectGameTerminology('コダックのフィルムを買った','ja','zh'),[]);
 assert.equal(gameTermTranslation('コダック','ja','zh'),undefined);
 assert.deepEqual(selectGameTerminology('サンダース議員が演説した','ja','zh'),[]);
 assert.deepEqual(selectGameTerminology('車のブースターを交換した','ja','zh'),[]);
 assert.ok(selectGameTerminology('ポケモンのコダックが好き','ja','zh').some(e=>e.target==='可達鴨'));
 assert.ok(selectGameTerminology('色違いのイーブイを捕まえた','ja','zh').some(e=>e.source==='色違い'&&e.target==='異色'));
 assert.ok(selectGameTerminology('Apex裡隊友倒地了','zh','ja').some(e=>e.source==='倒地'&&e.target==='ダウン'));
 assert.ok(selectGameTerminology('VALORANTでスパイクを解除した','ja','zh').some(e=>e.target==='輻能核心'));
 assert.ok(selectGameTerminology('絕對武力 2 要帶彈藥','zh','ja').some(e=>e.target==='弾薬'));
 assert.equal(selectGameTerminology('Apexでスパイクの話をした','ja','zh').some(e=>e.source==='スパイク'),false);
 assert.equal(selectGameTerminology('Apexをダウンロードした','ja','zh').some(e=>e.source==='ダウン'),false);
 assert.deepEqual(selectGameTerminology('ポケモンを厳選する','ja','zh').filter(e=>e.source==='厳選'),[]);
 assert.ok(selectGameTerminology('ポケモンの色違い厳選をする','ja','zh').some(e=>e.target==='刷異色'));
});

test('compound terms win, personal terms override overlaps and hints stay bounded',()=>{
 const selected=selectGameTerminology('VALORANTのリコイル制御とエイムを練習','ja','zh');
 assert.ok(selected.some(e=>e.source==='リコイル制御'&&e.target==='壓槍'));
 assert.equal(selected.some(e=>e.source==='リコイル'),false);
 assert.deepEqual(selectGameTerminology('皮卡丘','zh','ja',[{source:'皮卡丘',target:'ピカちゃん'}]),[]);
 assert.equal(selectGameTerminology('VALORANTのリコイル制御','ja','zh',[{source:'リコイル',target:'自訂'}]).some(e=>e.source==='リコイル制御'),false);
 assert.equal(selectGameTerminology(entries.filter(e=>e.standalone).map(e=>e.ja).join('、'),'ja','zh').length,8);
});

test('Apex item compounds and Valorant weapon names use their own domains',()=>{
 const apex=selectGameTerminology('Apexのノックダウンシールドとシールドバッテリー','ja','zh');
 assert.deepEqual(apex.map(e=>e.target),['擊倒護盾','護盾電池']);
 const valo=selectGameTerminology('特戰英豪的暴徒和幻象，請練壓槍','zh','ja');
 for(const target of ['ヴァンダル','ファントム','リコイル制御'])assert.ok(valo.some(e=>e.target===target));
 const prompt=gameTerminologyPrompt('VALORANTでリコイル制御を練習','ja','zh');
 assert.match(prompt,/壓槍/);assert.doesNotMatch(prompt,/皮卡丘|護盾電池/);
 assert.equal(gameTerminologyPrompt('媽媽倒地送醫','zh','ja'),'');
});

test('evolution phrases keep the destination species and preserve negation outside the matched span',()=>{
 assert.ok(selectGameTerminology('リザードンに進化させたくない','ja','zh').some(e=>e.source==='リザードンに進化'&&e.target==='進化成噴火龍'));
 assert.ok(selectGameTerminology('不要進化成噴火龍','zh','ja').some(e=>e.source==='進化成噴火龍'&&e.target==='リザードンに進化'));
 const terms=selectGameTerminology('不要把伊布進化成仙子伊布','zh','ja');
 assert.ok(terms.some(e=>e.source==='伊布'&&e.target==='イーブイ'));
 assert.ok(terms.some(e=>e.source==='進化成仙子伊布'&&e.target==='ニンフィアに進化'));
 const evolutions=selectGameTerminology('伊布、雷伊布、火伊布、水伊布、太陽伊布、月亮伊布、葉伊布、冰伊布','zh','ja');
 for(const name of ['イーブイ','サンダース','ブースター','シャワーズ','エーフィ','ブラッキー','リーフィア','グレイシア'])assert.ok(evolutions.some(e=>e.target===name));
});
