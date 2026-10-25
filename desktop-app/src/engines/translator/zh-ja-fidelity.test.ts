import { expect, it } from 'vitest'
import { finishZhJaTranslation as finish } from './zh-ja-fidelity'

it('keeps explicit current and future inability out of an invented past tense', () => {
  expect(finish('今天沒辦法看到最後，明天再來看！', '今日は最後を見ることができませんでしたが、明日また見に来ます！'))
    .toBe('今日は最後を見ることができませんが、明日また見に来ます！')
  expect(finish('明天沒辦法參加，下次再一起玩。', '明日は参加できなかった。次回一緒に遊ぼう。'))
    .toBe('明日は参加できない。次回一緒に遊ぼう。')
  expect(finish('現在不能看，等一下再來。', '今は見られませんでした。後で来ます。'))
    .toBe('今は見られません。後で来ます。')
})

it('preserves past events, quotations, questions, conditions and uncertain polarity', () => {
  for (const source of ['昨天沒辦法看到最後，今天再看。', '今天已經沒辦法來了，最後還是錯過了。',
    '他說「明天沒辦法來」。', '如果明天沒辦法來，我會告訴你。', '明天不一定沒辦法來。',
    '不是今天不能來，是昨天。', '今天沒辦法來嗎？', '今天不能不來。', '今天無法不來。',
    '今天我說昨天沒能參加。', '今天沒辦法看完，剛才已經結束了。']) {
    expect(finish(source, '今日は来られませんでした。')).toBe('今日は来られませんでした。')
  }
  for (const source of ['今天沒辦法來，去年也來不了。', '今天不能參加，上週也沒有參加。',
    '今天沒辦法過去，一小時前才離開。', '今天不能看完，明天不能來。']) {
    expect(finish(source, '今日は来られませんでした。')).toBe('今日は来られませんでした。')
  }
})

it('does not rewrite other completed actions or unanchored ambiguous source', () => {
  expect(finish('今天沒辦法來，謝謝你準備的禮物。', '今日は来られませんでした。プレゼント、ありがとうございました。'))
    .toBe('今日は来られません。プレゼント、ありがとうございました。')
  expect(finish('今天沒辦法來。', '今日は来られません。')).toBe('今日は来られません。')
  expect(finish('沒辦法看完。', '最後まで見られませんでした。')).toBe('最後まで見られませんでした。')
  expect(finish('今天已經看完直播了。', '今日は配信を見終えました。')).toBe('今日は配信を見終えました。')
  expect(finish('今天沒辦法來。', '今日は来られなかったら、知らせてください。')).toBe('今日は来られなかったら、知らせてください。')
})
