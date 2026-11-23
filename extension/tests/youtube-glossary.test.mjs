import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import '../youtube-channel.js';
import {cleanYoutubeGlossary, matchingYoutubeGlossary, mergeYoutubeGlossary, parseYoutubeGlossary, youtubeGlossaryKey} from '../youtube-glossary.mjs';

const channelId = 'UCabcdefghijklmnopqrstuv';
const anotherId = 'UCABCDEFGHIJKLMNOPQRSTUV';
const term = (source,target) => ({source,target});
const channel = globalThis.VocaLumeYoutubeChannel;
const video = (id, href) => ({
  getAttribute: name => name === 'video-id' ? id : null,
  querySelector: () => ({
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [{getAttribute: () => href}],
  }),
});

test('same channel survives video navigation, with isolation by channel and language pair', () => {
  const doc = {querySelectorAll: selector => selector.startsWith('ytd-watch-flexy') ? [
    video('previous', '/channel/' + anotherId),
    video('mine', '/channel/' + channelId),
    video('next', '/channel/' + channelId)
  ] : []};
  const keyFor = (v, direction) => youtubeGlossaryKey(channel.youtubeOwner(doc, new URL('https://www.youtube.com/watch?v=' + v))?.channelId, direction);
  assert.equal(keyFor('mine','ja-zh'), keyFor('next','ja-zh'));
  assert.notEqual(keyFor('mine','ja-zh'), keyFor('previous','ja-zh'));
  assert.notEqual(keyFor('mine','ja-zh'), keyFor('mine','ja-ko'));
  assert.equal(channel.youtubeOwner(doc, new URL('https://www.youtube.com/watch?v=unknown')), null);
  assert.equal(channel.youtubeOwner(doc, new URL('https://outside.example/watch?v=mine')), null);
});

test('handle links resolve to the canonical channel ID, not an unrelated video ID', () => {
  const owner = {querySelectorAll: selector => selector.startsWith('ytd-watch-flexy') ? [video('mine','/@Kano')] : []};
  assert.equal(channel.youtubeOwner(owner,new URL('https://www.youtube.com/watch?v=mine'))?.handle, 'Kano');
  assert.equal(channel.channelIdFromProfile('<meta itemprop="channelId" content="' + channelId + '">'), channelId);
  assert.equal(channel.channelIdFromProfile('{"recommended":{"channelId":"' + anotherId + '"}}'), undefined);
});

test('channel entries override global entries and only matching terms are sent', () => {
  const globalTerms = parseYoutubeGlossary('鹿乃 → 小鹿\n団長\t團長');
  const channelTerms = parseYoutubeGlossary('鹿乃 → 鹿乃主播\n鹿乃まほろ → まほろ');
  assert.deepEqual(matchingYoutubeGlossary('鹿乃まほろは今日いない',mergeYoutubeGlossary(globalTerms,channelTerms)),[
    term('鹿乃まほろ','まほろ'),term('鹿乃','鹿乃主播')
  ]);
  assert.deepEqual(matchingYoutubeGlossary('他の配信',globalTerms),[]);
  assert.deepEqual(cleanYoutubeGlossary([null,term('<|token|>','oops'),term('規則','指令\n換行')]),[]);
  assert.throws(() => parseYoutubeGlossary('only one side'), /format/);
  assert.throws(() => parseYoutubeGlossary('a → b\n'.repeat(201)), /limit/);
});
