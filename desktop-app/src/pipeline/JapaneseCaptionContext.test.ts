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
})
