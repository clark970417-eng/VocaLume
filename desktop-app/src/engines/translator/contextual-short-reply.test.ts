import {it,expect} from 'vitest'
import {contextualShortReply as reply} from './contextual-short-reply'
it('distinguishes refusing more tea, reassurance and completed preparation without a model pass',()=>{
 expect(reply('もう大丈夫です。','ja','zh','もう一杯お茶はいかがですか？')).toBe('不用再加了。')
 expect(reply('大丈夫です。','ja','zh','怪我はありませんか？')).toBe('沒事。')
 expect(reply('できました。','ja','zh','準備はできましたか？')).toBe('準備好了。')
 expect(reply('好了。','zh','ja','準備好了嗎？')).toBe('準備できました。')
 expect(reply('不會。','zh','ja','你會操作這個按鈕嗎？')).toBe('できません。')
 expect(reply('まだです。','ja','zh','もう準備はできましたか？')).toBe('還沒準備好。')
 expect(reply('まだ。','ja','zh','終わりましたか？')).toBe('還沒結束。')
 expect(reply('還沒。','zh','ja','你準備好了嗎？')).toBe('まだ準備できていません。')
 expect(reply('还没有。','zh','ja','结束了吗？')).toBe('まだ終わっていません。')
})
it('leaves ambiguous offers, questions, quotations, third-party actions and topic changes to the ordinary model',()=>{
 for(const [text,previous] of [
  ['大丈夫です。','もう一杯お茶はいかがですか？'],
  ['もう大丈夫です。','もう一杯お茶はいりませんか？'],
  ['もう大丈夫ですか？','もう一杯お茶はいかがですか？'],
  ['「大丈夫」と言った。','怪我はありませんか？'],
  ['できました。','弟の準備はできましたか？'],
  ['ところで、大丈夫です。','怪我はありませんか？'],
  ['大丈夫です。','怪我はありません。']])expect(reply(text,'ja','zh',previous)).toBeUndefined()
 expect(reply('不會。','zh','ja','明天會下雨嗎？')).toBeUndefined()
 expect(reply('大丈夫です。','ja','zh')).toBeUndefined()
 for(const [text,previous,from,to] of [
  ['まだです。','弟の準備はできましたか？','ja','zh'],
  ['まだですか？','準備はできましたか？','ja','zh'],
  ['まだです。','昨日終わりましたか？','ja','zh'],
  ['還沒。','他準備好了嗎？','zh','ja'],
  ['還沒嗎？','準備好了嗎？','zh','ja'],
  ['還沒。','比賽明天結束了嗎？','zh','ja']
 ] as const)expect(reply(text,from,to,previous)).toBeUndefined()
})
