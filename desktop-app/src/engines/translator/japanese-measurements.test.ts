import { expect, it } from 'vitest'
import { normalizeJapaneseMeasurements } from './japanese-measurements'

it.each([
  ['失業率は四点一パーセントです', '失業率は4.1パーセントです'],
  ['零点一ポイント改善しました', '0.1ポイント改善しました'],
  ['二十四点〇五％', '24.05％'],
  ['１００点０１ポイント', '100.01ポイント'],
  ['三百二十点五パーセント', '320.5パーセント'],
  ['4.1パーセント', '4.1パーセント'],
  ['第十三点について', '第十三点について'],
  ['一万四点一パーセント', '一万四点一パーセント'],
  ['十百点一パーセント', '十百点一パーセント']
])('preserves measurement values in %s', (source, expected) => {
  expect(normalizeJapaneseMeasurements(source)).toBe(expected)
})
