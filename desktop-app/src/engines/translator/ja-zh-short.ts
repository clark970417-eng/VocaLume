/** Exact, standalone Japanese only. These answers need neither more audio nor
 * GPU inference. Multi-meaning replies (はい / いい / 大丈夫 / やばい) and longer
 * sentences deliberately keep the ordinary translation path. */
const clearPhrases: Readonly<Record<string, string>> = {
  'こんにちは': '你好',
  'こんばんは': '晚上好',
  'おはよう': '早安',
  'おはようございます': '早安',
  'おやすみ': '晚安',
  'おやすみなさい': '晚安',
  'ありがとう': '謝謝',
  'ありがとうございます': '謝謝您',
  'ありがとうございました': '謝謝您',
  'どうもありがとうございます': '非常感謝您',
  'ごめんなさい': '對不起',
  '待って': '等一下',
  'ちょっと待って': '等一下',
  '待ってください': '請等一下',
  'ちょっと待ってください': '請等一下'
}
const timeTopics: Readonly<Record<string, string>> = {
  '今日': '今天', '明日': '明天', '明後日': '後天', '昨日': '昨天',
  '今夜': '今晚', '今週': '這週', '来週': '下週', '先週': '上週',
  '今年': '今年', '来年': '明年', '去年': '去年'
}

export function shortJaZhTranslation(source: string): string | undefined {
  const text = source.trim()
  // No noun, verb or adjective is supplied for an elliptical source.
  const topic = /^(ところで[、,]\s*)?(今日|明日|明後日|昨日|今夜|今週|来週|先週|今年|来年|去年)は([?？]+)$/u.exec(text)
  if (topic) return `${topic[1] ? '對了，' : ''}${timeTopics[topic[2]]}呢？`
  if (/^それは(?:、|\s)*ちょっと[。．.、，,…\s]*$/u.test(text)) return '那個有點……'
  // An isolated negative suffix does not identify what is being negated.
  // A recovered full verb such as 飲みません will not match this rule.
  if (/^ません[。．.…\s]*$/u.test(text)) return '不……'

  const match = /^(.*?)([。.!！?？…]*)$/u.exec(text)
  if (!match) return undefined
  const [, body, suffix] = match
  let translated = Object.hasOwn(clearPhrases, body) ? clearPhrases[body] : undefined
  if (body === '本当に' && /[?？!！]/u.test(suffix)) translated = '真的'
  if (body === 'え' && /^[?？]+$/u.test(suffix)) translated = '咦'
  if (body === 'どこ' && /^[?？]+$/u.test(suffix)) translated = '哪裡'
  if (!translated) return undefined
  const ending = /^[.…]{2,}$/u.test(suffix) ? '……' : suffix.replace(/!/g, '！').replace(/\?/g, '？').replace(/\./g, '。')
  return translated + ending
}
