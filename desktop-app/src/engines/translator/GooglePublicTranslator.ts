import type { Language, TranslateContext, TranslatorEngine } from '../types'
import { translateProtectedCloudText } from './api-utils'
import { requestPublicGoogle } from '../../../../extension/public-google.mjs'
import { retryTranslationRequest } from '../../../../extension/cloud-api.mjs'
import { validateTranslation, polishChinese } from '../../../../extension/translation-policy.mjs'
import { applyTaiwanLivestreamTerminology, normalizeTaiwanChinese } from '../../../../extension/taiwan-chinese.mjs'
import { finishJaZhTranslation } from './ja-zh-fidelity'
import { prepareJapaneseCloudText } from './prepare-japanese-cloud'

/** The same public translation service used by the Chrome extension. */
export class GooglePublicTranslator implements TranslatorEngine {
  readonly id = 'google-public-translate'
  readonly name = 'Google Translate (no API key)'
  readonly isOffline = false

  async initialize(): Promise<void> {}

  async translate(text: string, from: Language, to: Language, context?: TranslateContext): Promise<string> {
    if (!text.trim() || from === to) return text
    const timeout = AbortSignal.timeout(8000)
    const signal = context?.signal ? AbortSignal.any([context.signal, timeout]) : timeout
    const translated = await translateProtectedCloudText(text, context?.glossary, async source => {
      // ASR often omits punctuation between a completed sentence and a new day.
      const input = from === 'ja' ? prepareJapaneseCloudText(source) : source
      const result = await retryTranslationRequest(() => requestPublicGoogle(input, from, to, signal), signal)
      // The public provider occasionally mixes scripts despite tl=zh-TW.
      // Convert before restoring protected names so user spellings stay exact.
      const normalized = to === 'zh' ? normalizeTaiwanChinese(result) : result
      return from === 'ja' && to === 'zh'
        ? applyTaiwanLivestreamTerminology(text, normalized, context?.sourceContext)
        : normalized
    })
    const output = from === 'ja' && to === 'zh'
      ? finishJaZhTranslation(text, polishChinese(text, translated)) : translated
    return validateTranslation(output, `${from}-${to}`, text, context?.glossary)
  }

  async dispose(): Promise<void> {}
}
