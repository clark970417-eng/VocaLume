import { normalizeJapaneseMeasurements } from './japanese-measurements'
import { addJapaneseCaptionBoundaries } from './japanese-caption-boundaries'

/** Preserve numerical meaning without inventing context for ambiguous fragments. */
export function prepareJapaneseCloudText(source: string): string {
  return normalizeJapaneseMeasurements(addJapaneseCaptionBoundaries(source))
    .replace(/((?:今日|明日|今夜)の)配信(?=は(?:午前|午後)?[\d〇零一二三四五六七八九十]+時から(?:始|開始))/gu, '$1ライブ配信')
    // Improving unemployment means a lower rate. Public MT sometimes reverses
    // this particular statistical expression. Match only its explicit subject
    // and numerical clause, never an unrelated metric in the next sentence.
    .replace(/(失業率[はが](?:\d+(?:\.\d+)?(?:パーセント|[%％])(?:で|と)?[、,\s]*)?(?:(?:前の月|前月)(?:と比べて|に比べて|から|比)[、,\s]*)?\d+(?:\.\d+)?ポイント)改善/gu, '$1低下')
    // A numerical rise/fall from the previous month is month-on-month,
    // not quarter-on-quarter or a change that began last month.
    .replace(/前の月から(?=[、,\s]*[\d〇零一二三四五六七八九十百千万億.,，点]+(?:ポイント|パーセント|[%％]|人|件|円)[、,\s]*(?:増加|減少|増え|減っ|上昇|低下|上が|下が))/gu, '前月比')
}
