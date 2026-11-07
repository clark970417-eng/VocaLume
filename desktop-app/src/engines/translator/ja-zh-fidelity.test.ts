import { describe, expect, it } from 'vitest'
import { buildJaZhFidelityGuidance, finishJaZhTranslation } from './ja-zh-fidelity'

describe('Japanese to Traditional Chinese fidelity', () => {
  it('retains statistical terminology without relabeling a separate dataset', () => {
    expect(finishJaZhTranslation('10月の雇用統計が6日に発表され', '10月就業資料6日公佈。')).toBe('10月就業統計6日公佈。')
    const mixed = '看了就業統計和去年的就業資料。'
    expect(finishJaZhTranslation('雇用統計と昨年の雇用データを見ました。', mixed)).toBe(mixed)
  })
  it('does not guess whether a clipped market comparison goes above or below the forecast', () => {
    const source='就業者数は前の月から十六万五千人増加し市場の予想を大きく'
    expect(finishJaZhTranslation(source, '就業人數較上月增加16.5萬人，大幅超出市場預期。'))
      .toBe('就業人數較上月增加16.5萬人，與市場預期相比……')
    expect(finishJaZhTranslation(source.slice(0, -1), '就業人數較上月增加16.5萬人，大大超出市場預期。'))
      .toBe('就業人數較上月增加16.5萬人，與市場預期相比……')
    expect(finishJaZhTranslation(source+'下回りました', '就業人數較上月增加16.5萬人，大幅低於市場預期。'))
      .toBe('就業人數較上月增加16.5萬人，大幅低於市場預期。')
  })
  it('keeps an explicit future arrival distinct from a deadline', () => {
    expect(finishJaZhTranslation('電車は5分後に到着します', '火車將在 5 分鐘內到達'))
      .toBe('火車將在 5分鐘後到達')
    expect(finishJaZhTranslation('電車は1.5分後に到着します', '火車將在1.5分鐘以內到達'))
      .toBe('火車將在1.5分鐘後到達')
    expect(finishJaZhTranslation('5分以内に来てください', '請在5分鐘內到達'))
      .toBe('請在5分鐘內到達')
    expect(finishJaZhTranslation('5分後に到着して10分後に出発します', '5分鐘內到達，10分鐘內出發'))
      .toBe('5分鐘內到達，10分鐘內出發')
  })
  it('repairs only the aligned arrival when the same duration is also a deadline', () => {
    expect(finishJaZhTranslation('5分後に到着、5分以内に連絡します。', '5分鐘內到達，5分鐘內聯絡。'))
      .toBe('5分鐘後到達，5分鐘內聯絡。')
    expect(finishJaZhTranslation('5分後に到着して5分以内に連絡します。', '5分鐘內到達，5分鐘內聯絡。'))
      .toBe('5分鐘內到達，5分鐘內聯絡。')
    expect(finishJaZhTranslation('5分後に到着、5分以内に出発します。', '5分鐘內出發，5分鐘後到達。'))
      .toBe('5分鐘內出發，5分鐘後到達。')
  })
  it('preserves double negation across casual and formal connective forms', () => {
    for (const source of ['参加できないわけじゃないけど、少し遅れます。', '参加できないわけではないですが、少し遅れます。']) {
      expect(buildJaZhFidelityGuidance(source)).toContain('也不是不能參加')
    }
    expect(buildJaZhFidelityGuidance('今日は参加できない。')).not.toContain('雙重否定')
  })
  it('repairs demonstrated participation polarity without rewriting quotes, retractions or plain negatives', () => {
    expect(finishJaZhTranslation('参加できないわけじゃないけど、少し遅れます。','雖然不能參加，但會稍微遲一些。')).toBe('雖然也不是不能參加，但會稍微遲一些。')
    expect(finishJaZhTranslation('私は参加できないわけではないですが、準備が必要です。','不能參加，但需要準備。')).toBe('也不是不能參加，但需要準備。')
    expect(finishJaZhTranslation('今日は参加できない。','不能參加。')).toBe('不能參加。')
    expect(finishJaZhTranslation('「参加できないわけじゃない」と言った。','不能參加。')).toBe('不能參加。')
    expect(finishJaZhTranslation('参加できないわけじゃないけど、明日は参加できない。','不能參加。')).toBe('不能參加。')
    expect(finishJaZhTranslation('参加できないわけじゃないけど、少し遅れます。','也不是不能參加，不過會晚到。')).toBe('也不是不能參加，不過會晚到。')
  })
  it('only adds guidance for properties present in the source', () => {
    expect(buildJaZhFidelityGuidance('今日は晴れです。')).toBe('')
    expect(buildJaZhFidelityGuidance('リスポーン地点を変えるらしい。')).toContain('重生點')
    expect(buildJaZhFidelityGuidance('リスポーン地点を変えるらしい。')).toContain('聽說')
  })

  it('repairs stream and game terms without changing unrelated output', () => {
    expect(finishJaZhTranslation('リスポーン地点を変えます。', '改變回程的地点。')).toBe('改變重生點。')
    expect(finishJaZhTranslation('リスポーン地点を変えます。', '改變重生的地點。')).toBe('改變重生點。')
    expect(finishJaZhTranslation('昨日のアーカイブです。', '這是昨天的檔案。')).toBe('這是昨天的直播存檔。')
    expect(finishJaZhTranslation('今日は晴れです。', '今天天氣晴朗。')).toBe('今天天氣晴朗。')
    expect(finishJaZhTranslation('リスポーン地点へ戻ります。', '回到リスポーン點。')).toBe('回到重生點。')
    expect(finishJaZhTranslation('切り抜きはアーカイブ公開後にお願いします。', '請在資源公開之後再進行切斷處理。')).toBe('請在直播存檔公開後再進行剪輯。')
    expect(finishJaZhTranslation('切り抜きはアーカイブ公開後にお願いします。', '請在「直播存檔公開後」進行切り抜き處理。')).toBe('請在「直播存檔公開後」進行剪輯。')
    expect(finishJaZhTranslation('課金しなくても楽しめます。', '不付課金也能享受。')).toBe('不課金也能享受。')
    expect(finishJaZhTranslation('無理なら先に帰っていいよ。', '如果不行，那麼就先回去吧。')).toBe('如果不行，可以先回去喔。')
  })

  it('retains source-proven hearsay and does not add it to assertions', () => {
    expect(finishJaZhTranslation('弱体化されるらしい。', '似乎真的會被削弱。')).toBe('聽說會被削弱。')
    expect(finishJaZhTranslation('次の更新で弱体化されるらしい。', '在下次更新中，它似乎會被削弱。')).toBe('聽說在下次更新中，它會被削弱。')
    expect(finishJaZhTranslation('弱体化されます。', '會被削弱。')).toBe('會被削弱。')
    expect(buildJaZhFidelityGuidance('雨が降りそうです。')).not.toContain('聽說')
    expect(finishJaZhTranslation('美味しそうです。', '看起來很好吃。')).toBe('看起來很好吃。')
    expect(finishJaZhTranslation('素晴らしい。', '太精彩了。')).toBe('太精彩了。')
    expect(finishJaZhTranslation('昨日は晴れでした。明日は雨が降るそうです。', '昨天天氣晴朗。明天會下雨。'))
      .toBe('昨天天氣晴朗。聽說明天會下雨。')
    expect(finishJaZhTranslation('昨日は晴れでした。明日は雨が降るそうです。', '昨天放晴，明天會下雨。'))
      .toBe('昨天放晴，明天會下雨。')
    expect(finishJaZhTranslation('昨日は晴れでした。明日は雨が降るそうです。', '明天據說會下雨。昨天放晴。'))
      .toBe('明天據說會下雨。昨天放晴。')
  })

  it('repairs the common ended/spoke ambiguity and trailing action invention', () => {
    expect(finishJaZhTranslation('それはちょっと。', '那個有點誇張了。')).toBe('那個有點……')
    expect(finishJaZhTranslation('それはちょっと難しい。', '那個有點困難。')).toBe('那個有點困難。')
    expect(finishJaZhTranslation('まだ終わったとは言ってないよ。', '還沒有說完呢。')).toBe('我還沒說已經結束了喔。')
    expect(finishJaZhTranslation('このあと予定があるから、そろそろ', '等等有安排，所以差不多該走了吧。')).toBe('等等有安排，所以差不多該……')
    expect(finishJaZhTranslation('いや、それはちょっと違うというか', '不，那有點不一樣吧。')).toBe('不，那有點不一樣，該怎麼說……')
  })
})

// Page reading also handles ordinary archives and physical paper clippings.
it('does not force explicit document contexts into livestream terminology', () => {
  expect(buildJaZhFidelityGuidance('図書館のアーカイブを調べます。')).not.toContain('直播存檔')
  expect(finishJaZhTranslation('図書館のアーカイブを調べます。', '我會查閱圖書館的檔案。')).toBe('我會查閱圖書館的檔案。')
  expect(finishJaZhTranslation('新聞の切り抜きです。', '這是報紙的剪報。')).toBe('這是報紙的剪報。')
})
it('keeps a separate file distinct from a broadcast archive', () => {
  const output = '我會傳送直播存檔和另一個檔案。'
  expect(finishJaZhTranslation('配信のアーカイブと別のファイルを送ります。', output)).toBe(output)
  expect(finishJaZhTranslation('昨日のアーカイブを送ります。別のファイルも送ります。', '我會傳送昨天的檔案。我也會傳送另一個檔案。'))
    .toBe('我會傳送昨天的直播存檔。我也會傳送另一個檔案。')
  expect(finishJaZhTranslation('昨日のアーカイブを送ります。別のファイルも送ります。', '我會傳送另一個檔案。我也會傳送昨天的直播存檔。'))
    .toBe('我會傳送另一個檔案。我也會傳送昨天的直播存檔。')
})
it('does not invent help in a welcome, but keeps explicitly spoken help', () => {
  expect(finishJaZhTranslation('来てくれてありがとうございます。', '謝謝您能過來幫忙。')).toBe('謝謝您來。')
  expect(buildJaZhFidelityGuidance('しまいました来てくれてありがとうございます')).toBe('')
  expect(finishJaZhTranslation('手伝いに来てくれてありがとうございます。', '謝謝您能過來幫忙。')).toBe('謝謝您能過來幫忙。')
})
