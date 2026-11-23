import { expect, it } from 'vitest'
import { prepareJapaneseCloudText } from './prepare-japanese-cloud'
it('preserves the direction and decimal amounts of an explicit unemployment improvement', () => {
  expect(prepareJapaneseCloudText('失業率は四点一パーセントで、前の月から零点一ポイント改善しました。'))
    .toBe('失業率は4.1パーセントで、前月比0.1ポイント低下しました。')
})
it.each(['失業率は改善しました。', '支持率は0.1ポイント改善しました。', '失業率は4.1パーセントです。支持率は0.1ポイント改善しました。'])('does not infer a direction for %s', text => {
  expect(prepareJapaneseCloudText(text)).toBe(text)
})
it('disambiguates an explicitly scheduled broadcast without rewriting mail distribution', () => {
  expect(prepareJapaneseCloudText('今日の配信は午後8時から始まります電車は5分後に到着します'))
    .toBe('今日のライブ配信は午後8時から始まります。電車は5分後に到着します')
  expect(prepareJapaneseCloudText('メール配信は午後8時から始まります')).toBe('メール配信は午後8時から始まります')
})
it('separates the next news topic from a completed sentence without changing the stated subject', () => {
  expect(prepareJapaneseCloudText('3月5日息を引き取りました国内で唯一飼育されているこの水族館'))
    .toBe('3月5日息を引き取りました。国内で唯一飼育されているこの水族館')
  const quoted='「息を引き取りました国内で」と読みましたが続きがあります。'
  expect(prepareJapaneseCloudText(quoted)).toBe(quoted)
})
it('makes a statistical month-on-month comparison explicit without altering other uses of last month', () => {
  expect(prepareJapaneseCloudText('就業者数は前の月から十六万五千人増加し市場の予想を大きく'))
    .toContain('前月比')
  expect(prepareJapaneseCloudText('前の月から準備しています。')).toBe('前の月から準備しています。')
})
