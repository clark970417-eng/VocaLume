/** Narrow source-only conversational senses. No generated history is used and
 * no absent subject, reason, thanks or future action is added to a short reply.
 * The pipeline supplies only an adjacent question; this guard also protects
 * other callers. Unlisted replies keep the ordinary model path.
 */
export function contextualShortReply(text: string, from: string, to: string, sourceContext?: string): string | undefined {
  if (!sourceContext || sourceContext.length>80 || /[\n「」『』"<>]/u.test(sourceContext) || !/[?？]$/u.test(sourceContext.trim())) return undefined
  const reply=text.trim().replace(/[。.!！\s]+$/u,'')
  if(from==='ja' && to==='zh') {
    if (/^(?:もう大丈夫|もう結構)(?:です)?$/u.test(reply) &&
        /もう一杯|おかわり/u.test(sourceContext) && /お茶|水|コーヒー|飲み物|ジュース/u.test(sourceContext) &&
        /いかが|要ります|いります|飲みます/u.test(sourceContext) && !/ない|ません/u.test(sourceContext)) return '不用再加了。'
    if (/^大丈夫(?:です)?$/u.test(reply) && /怪我|けが/u.test(sourceContext) && /ありませんか|ないですか/u.test(sourceContext)) return '沒事。'
    if (reply==='できました' && /^(?:もう)?準備はできましたか[?？]$/u.test(sourceContext.trim())) return '準備好了。'
  }
  if(from==='zh' && to==='ja') {
    if(reply==='好了' && /^(?:你|妳)?(?:準備|准备)好了[嗎吗][?？]$/u.test(sourceContext.trim())) return '準備できました。'
    if((reply==='會'||reply==='会'||reply==='不會'||reply==='不会') && /^(?:你|妳)?[會会](?:操作|使用).{1,30}[嗎吗][?？]$/u.test(sourceContext.trim())) return /^[不]/u.test(reply)?'できません。':'できます。'
  }
  return undefined
}
