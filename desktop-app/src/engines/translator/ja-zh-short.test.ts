import { expect, it } from 'vitest'
import { shortJaZhTranslation, expandJapaneseContractions } from './ja-zh-short'

it.each([
  ['それ取っといて。まだ使わないから。','それ取っておいて。まだ使わないから。'],
  ['受け取っといてください。','受け取っておいてください。'],
  ['明日のために残しといて。','明日のために残しておいて。'],
  ['保存しといて。','保存しておいて。'],
  ['写真を撮っといて。','写真を撮っておいて。'],
  ['今は放っといて。','今は放っておいて。'],
  ['とっといて。','とっといて。']
])('expands an explicit verb without guessing a homophone: %s',(source,expected)=>{
  expect(expandJapaneseContractions(source)).toBe(expected)
})

it.each([
  ['本当に？', '真的？'], ['本当に!!', '真的！！'],
  ['ありがとうございます！', '謝謝您！'], ['ありがとうございました。', '謝謝您。'],
  ['こんばんは。', '晚上好。'], ['おやすみなさい。', '晚安。'],
  ['ちょっと待って！', '等一下！'], ['待ってください。', '請等一下。'],
  ['ごめんなさい。', '對不起。'], ['え？', '咦？'], ['どこ？', '哪裡？'],
  ['  ありがとう……  ', '謝謝……'], ['ありがとう...', '謝謝……']
])('returns only the meaning and punctuation of the complete short reply %s', (source, result) => {
  expect(shortJaZhTranslation(source)).toBe(result)
})

it.each([
  ['ご視聴ありがとうございました。', '感謝收看。'],
  ['チャンネル登録よろしくお願いします！', '請訂閱頻道！'],
  ['まもなくライブ配信が始まります', '直播即將開始'],
  ['ライブ配信は十五分後に始まります。', '直播將在十五分鐘後開始。'],
  ['電車は５分後に到着します。', '電車將在5分鐘後到達。']
])('translates complete standalone livestream and timing captions: %s', (source, result) => {
  expect(shortJaZhTranslation(source)).toBe(result)
})

it.each([
  ['明日は？', '明天呢？'], ['ところで、明日は？', '對了，明天呢？'],
  ['来週は？', '下週呢？'], ['今夜は?', '今晚呢？'],
  ['それはちょっと。', '那個有點……'], ['ません。', '不……']
])('keeps the missing predicate open instead of inventing one for %s', (source, result) => {
  expect(shortJaZhTranslation(source)).toBe(result)
})

it.each([
  'やばい。', '大丈夫。', 'いいです。', 'はい。', 'いいえ。', 'まだ。', '別に。',
  '本当にいいの？', '本当に', '明日は何曜日？', '明日は晴れですか？',
  '「ありがとう」の意味は？', 'ありがとうさんが来ました。', 'ありがとう、でもまだです。',
  'それはちょっと難しい。', '今日は行きません。', '魚が逃げてしまいました。',
  'ライブ配信は五、六分後に始まります。', 'ライブ配信は五分後に始まりますか？',
  'ライブ配信は五分後に始まりません。', 'ライブ配信は約五分後に始まります。',
  '電車は五分後に到着しますが、バスは遅れます。',
  'ありがとうございます\nでも待って。', 'constructor', 'toString', '__proto__', ''
])('keeps names, ambiguous replies and longer/quoted input on the model path: %s', source => {
  expect(shortJaZhTranslation(source)).toBeUndefined()
})
