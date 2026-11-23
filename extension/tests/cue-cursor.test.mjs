import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CueCursor, RollingCaptionBuffer} from '../cue-cursor.mjs';

test('a first multi-sentence decode and revisions retain every untranslated clause',()=>{
 const c=new CueCursor(), first='魚が逃げました。来てくれてありがとうございます。';
 assert.equal(c.select(first,1),first);
 assert.equal(c.select(first+'明日は休みます。',1),first+'明日は休みます。');
 // A translation that was never delivered must not advance the cursor.
 c.markDelivered(2,first,first);
 assert.equal(c.select(first+'明日は休みます。',1),first+'明日は休みます。');
});

test('only a delivered complete prefix can advance to new words',()=>{
 const c=new CueCursor(), first='皆さんこんにちは。魚が逃げてしまいました。';
 assert.equal(c.select(first,1),first);
 c.markDelivered(1,first,first);
 assert.equal(c.select(first+'来てく',1),first+'来てく');
 assert.equal(c.select('皆さんこんにちは魚が逃げてしまいました来てくれてありがとう',1),'来てくれてありがとう');
 const full=first+'来てくれてありがとう。';
 c.markDelivered(1,full,'来てくれてありがとう。');
 assert.equal(c.select(full+'明日は休みます。',1),'明日は休みます。');
 assert.equal(c.select('皆さんこんにちは魚が逃げませんでした来てくれてありがとう',1),'皆さんこんにちは魚が逃げませんでした来てくれてありがとう');
 assert.equal(c.select('別の発言です。',2),'別の発言です。');
});

test('incomplete and repeated phrases are kept instead of guessed away',()=>{
 const c=new CueCursor(),first='まだ行ける';
 c.select(first,1);c.markDelivered(1,first,first);
 assert.equal(c.select('まだ行けるつもりはありません。',1),'まだ行けるつもりはありません。');
 c.select('今日は配信する。',4);c.markDelivered(4,'今日は配信する。','今日は配信する。');
 assert.equal(c.select('今日は配信するつもりはありません。',4),'今日は配信するつもりはありません。');
 c.select('魚が逃げて。',5);c.markDelivered(5,'魚が逃げて。','魚が逃げて。');
 assert.equal(c.select('魚が逃げてしまいました。',5),'魚が逃げてしまいました。');
 assert.equal(c.select('待ってください待ってください',2),'待ってください待ってください');
 const long='私は絶対に'+ 'このゲームを'.repeat(10)+'やめません。';
 assert.equal(c.select(long,3),long);
});

test('rolling YouTube CC settles four snapshots in one translation and only submits a new complete tail',()=>{
 const buffer=new RollingCaptionBuffer();
 const snapshots=[
  '配信に',
  '配信に来て',
  '配信に来てくれて',
  '配信に来てくれてありがとう。'
 ];
 const emit=snapshots.flatMap((line,index)=>buffer.update(line,index*200,'ja'));
 assert.deepEqual(emit,['配信に来てくれてありがとう。']);
 assert.deepEqual(buffer.update('配信に来てくれてありがとう。',900,'ja'),[]);
 assert.deepEqual(buffer.update('配信に来てくれてありがとう',1000,'ja'),[]);
 assert.deepEqual(buffer.update('配信に来てくれてありがとう。 明日も配信します。',1200,'ja'),['明日も配信します。']);
 assert.deepEqual(buffer.update('配信に来てくれてありがとう。 明日も配信します。 ゲームで遊びます。',1400,'ja'),['ゲームで遊びます。']);
 assert.deepEqual(buffer.update('ゲームで遊びます。',1500,'ja'),[]);
 assert.deepEqual(buffer.update('ゲームで遊びます。 今日もよろしくお願いします。',1700,'ja'),['今日もよろしくお願いします。']);
});

test('YouTube CC buffers unpunctuated captions, preserves a revised ending, and discards pre-seek text',()=>{
 const buffer=new RollingCaptionBuffer();
 assert.deepEqual(buffer.update('今日の配信はやる',0,'ja'),[]);
 assert.deepEqual(buffer.update('今日の配信はやる',600,'ja'),['今日の配信はやる']);
 assert.deepEqual(buffer.update('今日の配信はやるつもりはありません。',700,'ja'),['今日の配信はやるつもりはありません。']);
 assert.deepEqual(buffer.update('まだ途中なので',900,'ja'),[]);
 buffer.reset();
 assert.deepEqual(buffer.update('別の動画を見ます。',1000,'ja'),['別の動画を見ます。']);
 assert.deepEqual(buffer.update('これは最後の字幕',1100,'ja'),[]);
 assert.deepEqual(buffer.update('',1200,'ja'),['これは最後の字幕']);
 assert.deepEqual(buffer.update('',1600,'ja'),[]);
});
