import { expect, it } from 'vitest'
import { shortJaZhTranslation } from './ja-zh-short'

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
  'ありがとうございます\nでも待って。', 'constructor', 'toString', '__proto__', ''
])('keeps names, ambiguous replies and longer/quoted input on the model path: %s', source => {
  expect(shortJaZhTranslation(source)).toBeUndefined()
})
