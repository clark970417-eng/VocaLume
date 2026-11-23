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
  'ちょっと待ってください': '請等一下',
  '少々お待ちください': '請稍等',
  '少しお待ちください': '請稍等',
  'ご視聴ありがとうございます': '感謝收看',
  'ご視聴ありがとうございました': '感謝收看',
  '最後までご覧いただきありがとうございました': '感謝您收看到最後',
  'チャンネル登録をお願いします': '請訂閱頻道',
  'チャンネル登録よろしくお願いします': '請訂閱頻道',
  '通知をオンにしてください': '請開啟通知',
  'ライブ配信を始めます': '要開始直播了',
  'ライブ配信を開始します': '要開始直播了',
  'まもなくライブ配信が始まります': '直播即將開始',
  'もうすぐライブ配信が始まります': '直播即將開始',
  'ライブ配信は終了しました': '直播已結束',
  'また次回お会いしましょう': '下次再見',
  'また明日お会いしましょう': '明天見'
}
const timeTopics: Readonly<Record<string, string>> = {
  '今日': '今天', '明日': '明天', '明後日': '後天', '昨日': '昨天',
  '今夜': '今晚', '今週': '這週', '来週': '下週', '先週': '上週',
  '今年': '今年', '来年': '明年', '去年': '去年'
}

/** Expand explicit written contractions without guessing their kanji or subject.
 * Hiragana とっといて stays ambiguous; 取る and 撮る remain different verbs. */
export function expandJapaneseContractions(text: string): string {
  return text.replace(/取っといて/gu, '取っておいて')
    .replace(/撮っといて/gu, '撮っておいて')
    .replace(/放っといて/gu, '放っておいて')
    .replace(/残しといて/gu, '残しておいて')
    .replace(/保存しといて/gu, '保存しておいて')
    .replace(/置いといて/gu, '置いておいて')
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
  // Only complete, explicit future timings qualify. Leave estimates, ranges,
  // questions and negations to the model, where they retain their context.
  if (!translated && /^[。.!！]*$/u.test(suffix)) {
    const timing = /^(ライブ配信|電車)[はが](\S+)分後に(始まります|開始します|到着します)$/u.exec(body)
    if (timing) {
      const [, subject, minutes, verb] = timing
      const duration = minutes.normalize('NFKC')
      const exactMinutes = /^(?:[1-9][0-9]?|[一二三四五六七八九]|[二三四五六七八九]?十[一二三四五六七八九]?)$/u.test(duration)
      if (exactMinutes && subject === 'ライブ配信' && verb !== '到着します') translated = `直播將在${duration}分鐘後開始`
      if (exactMinutes && subject === '電車' && verb === '到着します') translated = `電車將在${duration}分鐘後到達`
    }
  }
  if (body === '本当に' && /[?？!！]/u.test(suffix)) translated = '真的'
  if (body === 'え' && /^[?？]+$/u.test(suffix)) translated = '咦'
  if (body === 'どこ' && /^[?？]+$/u.test(suffix)) translated = '哪裡'
  if (!translated) return undefined
  const ending = /^[.…]{2,}$/u.test(suffix) ? '……' : suffix.replace(/!/g, '！').replace(/\?/g, '？').replace(/\./g, '。')
  return translated + ending
}
