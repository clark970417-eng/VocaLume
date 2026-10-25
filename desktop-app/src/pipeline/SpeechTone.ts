export const SPEECH_TONE_MODES = ['off', 'natural', 'ww', '笑', '草'] as const
export type SpeechToneMode = typeof SPEECH_TONE_MODES[number]
export function isSpeechToneMode(value: unknown): value is SpeechToneMode {
  return typeof value === 'string' && (SPEECH_TONE_MODES as readonly string[]).includes(value)
}

export function laughterMarker(mode: SpeechToneMode, language: string): string {
  if (mode === 'off') return ''
  if (mode !== 'natural') return mode
  return language === 'ja' ? '（笑）' : language === 'zh' ? '（笑）' :
    language === 'ko' ? '(웃음)' : '(laughter)'
}

// Only explicit nonverbal markers count. "笑った", "草原" and "www.example"
// are ordinary words, never evidence that the speaker is currently laughing.
const laughterSuffix = /(?:[（([](?:笑|笑い|笑聲|笑声|laughter|laughs)[）)\]]|(?<![a-z0-9])w{2,}|(?:ははは+|ハハハ+|哈哈哈+))[。.!！?？\s]*$/iu
const onlyLaughter = /^(?:[（([](?:笑|笑い|笑聲|笑声|laughter|laughs)[）)\]]|w{2,}|ははは+|ハハハ+|哈哈哈+)[。.!！?？\s]*$/iu

/** Apply tone after translation, keeping decorated strings out of the cache. */
export function applySpeechTone(source: string, translated: string, language: string, mode: SpeechToneMode, confidence = 0): string {
  if (mode === 'off') return translated
  const laugh = Number.isFinite(confidence) && confidence >= .93 || laughterSuffix.test(source.trim()) || onlyLaughter.test(source.trim())
  let result = translated.trim()
  if (onlyLaughter.test(source.trim()) || (!source.trim() && laugh)) return laughterMarker(mode, language)
  // Never fabricate a translation just because laughter was detected.
  if (!result) return translated
  const marks = source.match(/([!！?？]{1,3})[」』”"）)]*\s*$/u)?.[1]
  if (marks) {
    const suffix = marks.replace(/[!！]/g, language === 'ja' || language === 'zh' ? '！' : '!')
      .replace(/[?？]/g, language === 'ja' || language === 'zh' ? '？' : '?')
    result = result.replace(/[。.!！?？]+(?=[」』”"）)]*$)/u, '')
      .replace(/([」』”"）)]*)$/u, suffix + '$1')
  }
  if (laugh) {
    result = result.replace(laughterSuffix, '').trim()
    result = `${result} ${laughterMarker(mode, language)}`.trim()
  }
  return result
}
