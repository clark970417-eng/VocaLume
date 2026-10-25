/** A narrow tense correction, not a general Japanese grammar rewriter.
 * Chinese 沒辦法 describes inability; 沒能 and explicit past evidence do not.
 * Only explicit current/future inability can remove a model-added past suffix.
 */
const NONPAST_INABILITY = /(?:今[天晚]|現在|现在|目前|明[天晚]|後天|后天|下(?:次|週|周|個月|个月)|等一下|待會|待会|接下來|接下来)[^，。！？!?\n]{0,24}(?:沒辦法|没办法|無法|无法|不能)(?!不)/u
const PAST_OR_UNCERTAIN = /昨天|昨日|昨晚|前天|剛才|刚才|剛剛|刚刚|那時|那时|當時|当时|以前|之前|已經|已经|曾經|曾经|沒能|没能|沒看到|没看到|沒看完|没看完|結果|结果|終究|终究|最後還是|最后还是|錯過了|错过了|本來|本来|原本|如果|假如|要是|即使|就算|除非|不一定|不見得|不见得|也許|也许|或許|或许|可能|未必|不是|並非|并非|不能不|無法不|无法不|[「」『』“”"（）()嗎吗？?]/u
const ABILITY = '(?:でき|出来|見られ|観られ|いられ|来られ|こられ|行け)'
const POLITE_PAST = new RegExp(`(${ABILITY})ませんでした(?![らり])`, 'gu')
const PLAIN_PAST = new RegExp(`(${ABILITY})なかった(?![らり])`, 'gu')

export function finishZhJaTranslation(source: string, translated: string): string {
  const result = translated.trim()
  const otherPastEvidence = /去年|上(?:次|週|周|月|個月|个月)|先前|早前|過去|过去|當初|当初|(?:年|月|週|周|天|小時|小时|分鐘|分钟)前/u
  // Multiple inability clauses can refer to different events. Without clause
  // alignment, declining a correction is safer than changing both verb tenses.
  const inabilityClauses = source.match(/沒辦法|没办法|無法|无法|不能/gu)
  if (!NONPAST_INABILITY.test(source) || PAST_OR_UNCERTAIN.test(source) || otherPastEvidence.test(source) || inabilityClauses?.length !== 1) return result
  return result.replace(POLITE_PAST, '$1ません').replace(PLAIN_PAST, '$1ない')
}
