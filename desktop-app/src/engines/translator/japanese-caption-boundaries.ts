/** Restore only clear ASR sentence joins. A finite polite ending before
 * a new topic/time phrase is different from a connective such as ましたが.
 * Do not reinterpret quoted text or insert content from the preceding cue. */
export function addJapaneseCaptionBoundaries(text: string): string {
  if (/[「」『』“”"]/u.test(text)) return text
  return text.replace(/(ませんでした|ました|ません|ます|でした|です)(?=(?:一方(?:で|[、，])|続いて[、，]|国内で|海外では|明日|今日|昨日|(?:きょう|あす|電車|列車)(?=[はがもにの、，]|\d)))/gu, '$1。')
}
