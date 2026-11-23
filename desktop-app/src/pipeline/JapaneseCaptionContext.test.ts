import { describe, it, expect, vi } from 'vitest'
import { JapaneseCaptionContext, joinJapaneseCaption } from './JapaneseCaptionContext'

describe('Japanese caption continuation', () => {
  it.each([
    ['皆さんこんにちは。魚が逃げて。', 'しまいました。来てくれてありがとうございます。', '魚が逃げてしまいました。来てくれてありがとうございます。'],
    ['今日は配信する。', 'つもりはありません。明日はやります。', '今日は配信するつもりはありません。明日はやります。'],
    ['昨日で終わったと。', '言ったわけじゃないです。', '昨日で終わったと言ったわけじゃないです。'],
    ['少し待って。', 'ください。準備をしています。', '少し待ってください。準備をしています。'],
    ['今日は時間がないので。', '短めにします。', '今日は時間がないので短めにします。'],
    ['セーブを消して。', 'しまった。もう戻せない。', 'セーブを消してしまった。もう戻せない。'],
    ['怖いという。', 'わけではないです。', '怖いというわけではないです。'],
    ['勝てるかも。', 'しれません。', '勝てるかもしれません。'],
    ['買わない。', 'わけじゃないです。', '買わないわけじゃないです。']
  ])('recovers grammar from %s / %s without repeating earlier sentences', (prior, next, expected) => {
    expect(joinJapaneseCaption(prior, next)).toBe(expected)
  })

  it.each(['はい。', 'いいえ。', 'まだ。', '今日は晴れです。', 'ところで次のゲームは？', 'しまった、鍵を忘れた！'])('does not borrow a finished prior sentence for %s', next => {
    expect(joinJapaneseCaption('魚が逃げました。', next)).toBe(next)
  })

  it('does not duplicate overlap, cut long reference text, or join a closed quotation', () => {
    expect(joinJapaneseCaption('魚が逃げて。', '魚が逃げてしまいました。')).toBe('魚が逃げてしまいました。')
    expect(joinJapaneseCaption('あ'.repeat(121)+'て', 'しまいました。')).toBe('しまいました。')
    expect(joinJapaneseCaption('「少し待って」。', 'ください。')).toBe('ください。')
    expect(joinJapaneseCaption('時間がないので。', 'ところで、明日は？')).toBe('ところで、明日は？')
    expect(joinJapaneseCaption('魚が逃げて。', 'しまいました来てくれてありがとうございます')).toBe('魚が逃げてしまいました。来てくれてありがとうございます')
    expect(joinJapaneseCaption('まだ食べて。', 'いませんが、もうすぐ食べます。')).toBe('まだ食べていませんが、もうすぐ食べます。')
    expect(joinJapaneseCaption('勝てるかも。', 'しれません明日も頑張ります')).toBe('勝てるかもしれません。明日も頑張ります')
  })

  it('uses capture adjacency despite inference lag, but rejects pauses, seeks, language/speaker changes and same-cue revisions', () => {
    vi.useFakeTimers()
    try {
      const context = new JapaneseCaptionContext()
      context.remember('魚が逃げて。', 'ja', 'zh', {speechSeconds:7,segment:'a',captureStartSample:0,captureEndSample:128000}, 0)
      vi.advanceTimersByTime(30_000)
      const next = {speechSeconds:2,segment:'b',captureStartSample:128000,captureEndSample:160000}
      expect(context.resolve('しまいました。','ja','zh',next,0)).toBe('魚が逃げてしまいました。')
      expect(context.resolve('しまいました。','ja','zh',{...next,segment:'a'},0)).toBe('しまいました。')
      for (const captureStartSample of [0,161000]) expect(context.resolve('しまいました。','ja','zh',{...next,captureStartSample},0)).toBe('しまいました。')
      expect(context.resolve('しまいました。','ja','zh',next,1)).toBe('しまいました。')
      expect(context.resolve('しまいました。','ja','en',next,0)).toBe('しまいました。')
      expect(context.resolve('しまいました。','ja','zh')).toBe('しまいました。')
      context.reset()
      expect(context.resolve('しまいました。','ja','zh',next,0)).toBe('しまいました。')
    } finally { vi.useRealTimers() }
  })

  it('never recycles generated output or grows an accumulating history', () => {
    const context = new JapaneseCaptionContext()
    context.remember('魚が逃げて。', 'ja', 'zh')
    expect(context.resolve('しまいました。','ja','zh')).toBe('魚が逃げてしまいました。')
    context.remember('しまいました。','ja','zh')
    expect(context.resolve('来てくれてありがとうございます。','ja','zh')).toBe('来てくれてありがとうございます。')
  })

  it('references only an adjacent question for an ambiguous spoken reply', () => {
    const context=new JapaneseCaptionContext()
    const prior={segment:'a',speechSeconds:1,captureStartSample:0,captureEndSample:16000}
    const current={segment:'b',speechSeconds:1,captureStartSample:16000,captureEndSample:32000}
    context.remember('もう一杯お茶はいかがですか？','ja','zh',prior,0)
    expect(context.referenceFor('もう大丈夫です。','ja','zh',current,0)).toBe('もう一杯お茶はいかがですか？')
    for(const text of ['ところで、大丈夫です。','「大丈夫」と言った。','大丈夫ですか？','明日は休みます。'])
      expect(context.referenceFor(text,'ja','zh',current,0)).toBeUndefined()
    expect(context.referenceFor('大丈夫です。','ja','zh',current,1)).toBeUndefined()
    expect(context.referenceFor('大丈夫です。','ja','zh',{...current,captureStartSample:50000},0)).toBeUndefined()
    expect(context.referenceFor('大丈夫です。','ja','zh')).toBeUndefined()
    context.remember('準備好了嗎？','zh','ja',prior)
    expect(context.referenceFor('好了。','zh','ja',current)).toBe('準備好了嗎？')
    context.remember('準備好了嗎？','zh','ja',{...prior,continuationExpected:true})
    expect(context.referenceFor('好了。','zh','ja',current)).toBeUndefined()
    context.reset();expect(context.referenceFor('好了。','zh','ja',current)).toBeUndefined()
  })

  it('passes one nearby original referent only to capable engines and drops it on a pause or speaker change', () => {
    const context = new JapaneseCaptionContext()
    const prior = {segment:'previous',speechSeconds:1,captureStartSample:96000,captureEndSample:112000,speechEndSample:14400}
    const next = {segment:'next',speechSeconds:1,captureStartSample:113000,captureEndSample:129000}
    const source = '会場には臨時の入口があります。'
    context.remember(source, 'ja', 'zh', prior, 0)
    expect(context.referenceFor('それは夜も使えます。','ja','zh',next,0,true)).toBe(source)
    expect(context.referenceFor('それは夜も使えます。','ja','zh',next,0)).toBeUndefined()
    expect(context.referenceFor('夜も使えます。','ja','zh',next,0,true)).toBeUndefined()
    expect(context.referenceFor('それは夜も使えます。','ja','zh',next,1,true)).toBeUndefined()
    expect(context.referenceFor('それは夜も使えます。','ja','zh',{...next,captureStartSample:128000},0,true)).toBeUndefined()
    context.remember('別件です。'+source, 'ja', 'zh', prior, 0)
    expect(context.referenceFor('それは夜も使えます。','ja','zh',next,0,true)).toBeUndefined()
  })

  it('recovers only the spoken object of a hard-cut comparison', () => {
    const prior='就業者数は前の月から十六万五千人増加し市場の予想を大きく'
    expect(joinJapaneseCaption(prior,'上回りました',true)).toBe('市場の予想を大きく上回りました')
    expect(joinJapaneseCaption(prior,'下回りました。',true)).toBe('市場の予想を大きく下回りました。')
    expect(joinJapaneseCaption(prior.slice(0, -1),'上回りました',true)).toBe('市場の予想を大きく上回りました')
    expect(joinJapaneseCaption(prior.slice(0, -1),'く上回りました',true)).toBe('市場の予想を大きく上回りました')
    expect(joinJapaneseCaption(prior,'上回りました',false)).toBe('上回りました')
  })

  it('joins a bare verb ending only at a proven, adjacent capture cut', () => {
    const context = new JapaneseCaptionContext()
    context.remember('薬は飲み', 'ja', 'zh', {speechSeconds:7,segment:'a',captureStartSample:0,captureEndSample:128000,continuationExpected:true})
    const next={speechSeconds:2,segment:'b',captureStartSample:128000,captureEndSample:160000}
    expect(context.resolve('ません。','ja','zh',next)).toBe('薬は飲みません。')
    expect(context.resolve('ません。','ja','zh',{...next,captureStartSample:132000})).toBe('ません。')
    expect(joinJapaneseCaption('薬は飲み','ません。')).toBe('ません。')
    expect(joinJapaneseCaption('駅に','ません。')).toBe('ません。')
    expect(joinJapaneseCaption('歌い','ました。',true)).toBe('歌いました。')
  })

  it.each([
    ['まだ食べて', 'ないです。', 'まだ食べてないです。'],
    ['セーブを消しちゃ', 'った。', 'セーブを消しちゃった。'],
    ['もう買っ', 'ちゃった。', 'もう買っちゃった。'],
    ['本を読ん', 'じゃった。', '本を読んじゃった。'],
    ['買うつもり', 'はありません。', '買うつもりはありません。'],
    ['今日は来ないって', '言っていました。', '今日は来ないって言っていました。'],
    ['そんなに難しく', 'ないです。', 'そんなに難しくないです。'],
    ['まだ終わって', 'ません。', 'まだ終わってません。']
  ])('recovers an already captured colloquial/negative continuation without waiting: %s / %s', (prior, next, expected) => {
    expect(joinJapaneseCaption(prior, next, true)).toBe(expected)
    expect(joinJapaneseCaption(prior, next)).toBe(next)
  })

  it('guards completed thoughts, invalid morphology and explicitly unrelated replies', () => {
    expect(joinJapaneseCaption('怖いわけでは。', 'ないです。')).toBe('怖いわけではないです。')
    for (const prior of ['明日から', '本当に', '駅へ行く', '楽しい', '買いました']) {
      expect(joinJapaneseCaption(prior, 'ないです。', true)).toBe('ないです。')
    }
    expect(joinJapaneseCaption('今日は来ないって', 'こんにちは。', true)).toBe('こんにちは。')
    expect(joinJapaneseCaption('魚が逃げました。', '明日は？', true)).toBe('明日は？')
    expect(joinJapaneseCaption('「もう来ない」', 'って言ってました。', true)).toBe('って言ってました。')
  })
})
