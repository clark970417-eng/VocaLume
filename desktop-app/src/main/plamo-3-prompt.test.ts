import { describe, expect, it } from 'vitest'
import { buildPlamo3Prompt } from './plamo-3-prompt'

describe('PLaMo 3 translation prompt', () => {
  it('uses target-specific Japanese livestream terms', async () => {
    const japanese = '枠取り直してからスパチャを読みます。'
    const koreanPrompt = (await buildPlamo3Prompt(japanese, 'ja', 'ko')).toString()
    expect(koreanPrompt).toContain('<|plamo:tag|>glossary')
    expect(koreanPrompt).toContain('<|plamo:index|>枠取り直して<|plamo:item|>방송을 다시 켜고')
    expect(koreanPrompt).toContain('<|plamo:index|>スパチャ<|plamo:item|>슈퍼챗')
    expect(koreanPrompt).not.toContain('雑談枠')
    expect(koreanPrompt).toContain(`<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>${japanese}`)
    expect(koreanPrompt).toMatch(/<\|plamo:tag\|>output<\|plamo:key\|>lang<\|plamo:val\|>ko<\|plamo:msg\|>$/u)
    const chinesePrompt = (await buildPlamo3Prompt(japanese, 'ja', 'zh')).toString()
    expect(chinesePrompt).toContain('<|plamo:index|>スパチャ<|plamo:item|>超級留言')
    expect(chinesePrompt).not.toContain('重開直播')
    expect(chinesePrompt).toContain('<|plamo:val|>zh-hant<|plamo:msg|>')
  })

  it('leaves unrelated frame references alone and respects a matched custom term', async () => {
    expect((await buildPlamo3Prompt('右の枠にアイテムを入れて。', 'ja', 'ko')).toString()).not.toContain('glossary')
    const prompt = (await buildPlamo3Prompt('スパチャありがとう。', 'ja', 'ko', [
      { source: 'スパチャ', target: '슈퍼 채팅' },
      { source: '配信', target: '방송' }
    ])).toString()
    expect(prompt).toContain('<|plamo:index|>スパチャ<|plamo:item|>슈퍼 채팅')
    expect(prompt).not.toContain('슈퍼챗')
    expect(prompt).not.toContain('配信')
  })

  it('distinguishes restarting a stream from reselecting an OCR region', async () => {
    expect((await buildPlamo3Prompt('枠を取り直すね。すぐ戻るから待ってて。', 'ja', 'zh')).toString()).toContain('重開直播')
    expect((await buildPlamo3Prompt('OCRで画面の枠を取り直す。', 'ja', 'zh')).toString()).not.toContain('重開直播')
  })

  it('tokenizes input and glossary values as literal data', async () => {
    const japanese = '「<|plamo:tag|>」と書いてあります。'
    const replacement = '기호 <|plamo:msg|>'
    const prompt = await buildPlamo3Prompt(japanese, 'ja', 'ko', [{ source: '書いて', target: replacement }])
    expect(prompt.toJSON()).toEqual(expect.arrayContaining([japanese, replacement]))
  })
})
