// These checks cover explicit source facts that can be compared without
// another model call. A fact with no reliable pattern is left to the engine.
const digits = '〇零一二三四五六七八九兩两'
const values = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 2, 2]
const magnitude = { 十: 10, 百: 100, 千: 1000 }
const scale = { 万: 10000, 萬: 10000, 億: 100000000, 亿: 100000000 }
const integer = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)'
const compoundAmount = `${integer}(?:[億亿](?:${integer}[万萬])?${integer}?|[万萬]${integer})`
const amount = `(?:${compoundAmount}|${integer}(?:\\.\\d+)?[万萬億亿]?|[${digits}十百千万萬億亿]+(?:[点點][${digits}]+)?)`

function numberValue(value) {
  if (/^\d/u.test(value)) {
    let total = 0
    for (const [, digits, unit] of value.replaceAll(',', '').matchAll(/(\d+(?:\.\d+)?)([万萬億亿]?)/gu)) {
      total += Number(digits) * (scale[unit] ?? 1)
    }
    return total
  }
  const [whole, fraction = ''] = value.split(/[点點]/u)
  const digit = (char) => values[digits.indexOf(char)]
  let total = 0
  let group = 0
  let pending
  for (const char of whole) {
    const unit = magnitude[char]
    if (scale[char]) {
      total += (group + (pending ?? 0) || 1) * scale[char]
      group = 0
      pending = undefined
    } else if (unit) {
      group += (pending ?? 1) * unit
      pending = undefined
    } else {
      pending = (pending ?? 0) * 10 + digit(char)
    }
  }
  const decimal = fraction ? Number(`0.${[...fraction].map(digit).join('')}`) : 0
  return total + group + (pending ?? 0) + decimal
}

const startOfAmount = `(?<![0-9${digits}十百千万萬億亿.])`
const japaneseTime = new RegExp(`${startOfAmount}(${amount})\\s*(時間半|時間|分間|分)(後|以内|以上|未満|ごと|おき|ほど|くらい)?`, 'gu')
const chineseTime = new RegExp(`${startOfAmount}(${amount})\\s*(?:個|个)?(半小時|半小时|半鐘頭|小時|小时|鐘頭|分鐘|分钟|分(?=(?:之|以)?(?:後|后|內|内|上|下)))(?:之|以)?(後|后|內|内|上|下)?`, 'gu')
const japanesePercent = new RegExp(`${startOfAmount}(${amount})\\s*(パーセント|%|ポイント)`, 'gu')
const chinesePercent = new RegExp(`${startOfAmount}(${amount})\\s*(%|(?:個|个)?百分[點点])|百分之\\s*(${amount})`, 'gu')
const headcount = new RegExp(`${startOfAmount}(${amount})\\s*(?:人|名|位)`, 'gu')
const japanesePeopleStats = /(?:就業者|雇用者|失業者|応募者|利用者|来場者|入場者|感染者|患者|視聴者|出席者|参加者)数|人口|人数/u
const chinesePeopleStats = /(?:就業|就业|就職|就职|受僱|受雇|雇用|失業|失业|申請|申请|使用|到場|到场|入場|入场|感染|出席|參加|参加|收視|收视)人數|(?:人口|人數|人数)/u
const japaneseTrend = /増加|増え|減少|減っ|上回|下回/u
const chineseTrend = '增加|增至|上升|上揚|上扬|成長|成长|減少|减少|減至|减至|下降|下滑|多了|少了'
const bareHeadcount = new RegExp(`(?:${chineseTrend})\\s*了?\\s*(${amount})(?=$|[，,。.;；\\s])`, 'gu')
const relation = {
  後: 'after', 后: 'after', 以内: 'within', 內: 'within', 内: 'within',
  以上: 'atLeast', 上: 'atLeast', 未満: 'under', 下: 'under'
}

function timeFacts(text, source) {
  const facts = []
  for (const match of text.matchAll(source ? japaneseTime : chineseTime)) {
    const [, count, unit, comparator] = match
    // Bare Japanese 分 can be a fraction, score, share or counter.
    if (source && unit === '分' && !comparator) continue
    const minutes = /時間|小時|小时|鐘頭/u.test(unit) ? 60 * numberValue(count) : numberValue(count)
    facts.push({ value: minutes + (unit.includes('半') ? 30 : 0), relation: relation[comparator] })
  }
  if (!source) {
    for (const [, comparator] of text.matchAll(/(?<![\p{N}一二三四五六七八九十個个])半(?:個|个)?(?:小時|小时|鐘頭)(?:之|以)?(後|后|內|内|上|下)?/gu)) {
      facts.push({ value: 30, relation: relation[comparator] })
    }
    for (const match of text.matchAll(new RegExp(`(${amount})刻鐘`, 'gu'))) {
      facts.push({ value: 15 * numberValue(match[1]) })
    }
  }
  return facts
}

function percentFacts(text, source) {
  return [...text.matchAll(source ? japanesePercent : chinesePercent)].map(([, count, unit, fraction]) => ({
    value: numberValue(count ?? fraction),
    // Japanese ポイント is checked only in a sentence with a percent or an
    // explicit rate, so game points and loyalty points stay out of this check.
    unit: unit && unit !== '%' && unit !== 'パーセント' ? 'points' : 'percent'
  }))
}

function headcounts(text, source) {
  if (source && (!japanesePeopleStats.test(text) || !japaneseTrend.test(text))) return []
  const counts = [...text.matchAll(headcount)].map(match => numberValue(match[1]))
  if (!source && chinesePeopleStats.test(text)) {
    for (const match of text.matchAll(bareHeadcount)) counts.push(numberValue(match[1]))
  }
  return counts
}

/** The source, translated statistic and comparison are all required. */
export function repairComparativeStatistics(source, translation) {
  const japanese = source.normalize('NFKC')
  const periods = japanese.match(/前の月(?:から|に比べ)|前月(?:比|から|に比べ)/gu)
  if (periods?.length !== 1 || /四半期|前期|前年|昨年|同月/u.test(japanese) ||
      /上(?:個|个)?月|前月|月增|月減|月减|月比|環比|环比/u.test(translation)) return translation
  const counts = headcounts(japanese, true)
  if (counts.length !== 1 || !chinesePeopleStats.test(translation) ||
      !headcounts(translation.normalize('NFKC'), false).includes(counts[0])) return translation
  const period = new RegExp(`([較较比])上(?:一|個|个|一個|一个)?季(?:度)?(?=\\s*(?:${chineseTrend}))`, 'gu')
  return [...translation.matchAll(period)].length === 1
    ? translation.replace(period, '$1上月')
    : translation
}

const incompleteEmploymentComparison = new RegExp(
  `(?:就業者|雇用者|失業者)数[はが]\\s*(?:前の月から|前月(?:比|から))[、,\\s]*(${amount})\\s*(?:人|名|位)[、。．.,…\\s]*$`, 'u')
const guessedEmploymentTrend = new RegExp(
  `((?:就業|就业|就職|就职|雇用|失業|失业)人[數数])(?:較|较|比)上(?:[個个]?月|(?:一|個|个|一個|一个)?季(?:度)?)\\s*(?:${chineseTrend})\\s*了?\\s*(${amount})\\s*(人|名|位)[。．.、，,!?！？…\\s]*$`, 'u')

/** Preserve a spoken comparison and headcount when the caption cut omits the trend. */
export function repairIncompleteCaptionComparison(source, translation) {
  const japanese = source.normalize('NFKC')
  if (/四半期|前期|前年|昨年|同月/u.test(japanese)) return translation
  const spokenCount = incompleteEmploymentComparison.exec(japanese)?.[1]
  if (!spokenCount) return translation
  const trend = guessedEmploymentTrend.exec(translation)
  if (!trend || numberValue(spokenCount) !== numberValue(trend[2])) return translation
  return translation.slice(0, trend.index) + `${trend[1]}與上月相比，${trend[2]}${trend[3]}……`
}

const directPolarity = [
  { japanese: /配信(?:は|を)?(?:し(?:ない|ません)|でき(?:ない|ません))(?:でした)?$/u, chinese: /(?:會|会|能|可以|將|将|要)(?:進行|进行|開始|开始)?(?:直播|播出|發布|发布|發送|发送)|(?:直播|播出|發布|发布|發送|发送)了/u },
  { japanese: /参加(?:は)?(?:し(?:ない|ません)|でき(?:ない|ません))(?:でした)?$/u, chinese: /(?:會|会|能|可以|將|将|要|有)(?:去)?[參参]加|[參参]加了/u },
  { japanese: /到着(?:し(?:ない|ません)|でき(?:ない|ません))(?:でした)?$/u, chinese: /(?:會|会|能|可以|將|将|要|有)(?:到達|到达|抵達|抵达|到站)|(?:到達|到达|抵達|抵达|到站)了/u },
  { japanese: /(?:始ま(?:らない|りません)|開始(?:しない|しません))(?:でした)?$/u, chinese: /(?:會|会|能|可以|將|将|要|有)開始|開始了|(?:会|能|可以|将|要|有)开始|开始了/u },
  { japanese: /(?:来(?:ない|ません)|こ(?:ない|られない))(?:でした)?$/u, chinese: /(?:會|会|能|可以|將|将|要|有)來|來了|(?:会|能|可以|将|要|有)来|来了/u }
]

function reversedPolarity(source, translation) {
  if (/[「」『』“”?!、，,]|わけ|と言|とは|もない|けど|のに|しか|かもしれ/u.test(source)) return false
  const sentence = source.trim().replace(/[。.!！]+$/u, '')
  if (/[。.!！]/u.test(sentence) || /[?？]|不|沒|没|未|無法|无法|別|别|拒絕|取消/u.test(translation)) return false
  return directPolarity.some(({ japanese, chinese }) => japanese.test(sentence) && chinese.test(translation))
}

/** Returns the first confidently detectable loss or contradiction, if any. */
export function assessCriticalFacts(source, translation, direction, liveCaption = false) {
  if (direction !== 'ja-zh' || !source || !translation) return undefined
  const japanese = source.normalize('NFKC')
  const chinese = translation.normalize('NFKC')
  if (reversedPolarity(japanese, chinese)) return { code: 'polarity', message: '翻譯可能反轉原文的否定' }
  const times = timeFacts(japanese, true)
  if (times.length) {
    const output = timeFacts(chinese, false)
    if (times.some(fact => !output.some(other => Math.abs(fact.value - other.value) < 0.000001 &&
        (!fact.relation || !other.relation || fact.relation === other.relation)))) {
      return { code: 'duration', message: '翻譯可能遺漏或更改原文的時間或期限' }
    }
  }
  const rate = /パーセント|%|(?:失業|成長|支持|参加|割合|増加|減少|上昇|低下)率/u.test(japanese)
  const percentages = percentFacts(japanese, true).filter(fact => fact.unit === 'percent' || rate)
  if (percentages.length) {
    const output = percentFacts(chinese, false)
    if (percentages.some(fact => !output.some(other => fact.unit === other.unit && fact.value === other.value))) {
      return { code: 'percentage', message: '翻譯可能遺漏或更改原文的百分比或百分點' }
    }
  }
  const incompleteCount = liveCaption ? incompleteEmploymentComparison.exec(japanese)?.[1] : undefined
  const people = incompleteCount ? [numberValue(incompleteCount)] : headcounts(japanese, true)
  if (people.length) {
    const output = headcounts(chinese, false)
    if (people.some(count => !output.includes(count))) {
      return { code: 'headcount', message: '翻譯可能遺漏或更改原文的統計人數' }
    }
  }
  return undefined
}
