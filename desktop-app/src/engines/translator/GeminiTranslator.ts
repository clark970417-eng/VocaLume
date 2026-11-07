import type { TranslatorEngine, Language, TranslateContext } from '../types'
import { LANG_NAMES_EN } from '../language-names'
import { apiFetch, DEFAULT_TIMEOUT_MS, translateProtectedCloudText } from './api-utils'
import { formatGlossaryPrompt } from './glossary-utils'
import { createLogger } from '../../main/logger'

const log = createLogger('gemini')

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const ERROR_MAPPINGS = [
  { statuses: [400, 403], message: 'Invalid API key' },
  { statuses: [429], message: 'Rate limit - retry after short cooldown' }
]

/**
 * Classify Gemini API 429 responses. The Gemini API returns 429 for both
 * per-minute rate-limit and daily/monthly quota exhaustion. The error body
 * typically contains a quotaId or "quota" mention for monthly exhaustion.
 * Reference: https://ai.google.dev/gemini-api/docs/troubleshooting
 */
function classifyGeminiError(status: number, body: string): string | null {
  if (status !== 429) return null
  const lower = body.toLowerCase()
  if (
    lower.includes('quota') &&
    (lower.includes('day') || lower.includes('month') || lower.includes('exceeded'))
  ) {
    return 'Quota exceeded - monthly limit reached'
  }
  return 'Rate limit - retry after short cooldown'
}

export class GeminiTranslator implements TranslatorEngine {
  readonly id = 'gemini-translate'
  readonly name = 'Gemini 2.5 Flash'
  readonly isOffline = false

  private apiKey: string
  private timeoutMs: number
  private initialized = false

  constructor(apiKey: string, options?: { timeoutMs?: number }) {
    this.apiKey = apiKey
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (!this.apiKey) {
      throw new Error('Gemini API key is required')
    }
    // API key validation deferred to first real translation to avoid wasting tokens
    this.initialized = true
  }

  async translate(text: string, from: Language, to: Language, context?: TranslateContext): Promise<string> {
    if (!text.trim()) return ''
    if (from === to) return text

    // Build context-enhanced prompt
    const contextParts: string[] = []
    const glossaryPrompt = formatGlossaryPrompt(context?.glossary)
    if (glossaryPrompt) {
      contextParts.push(glossaryPrompt)
    }
    if (from === 'ja' && to === 'zh') {
      if (context?.sourceContext) contextParts.push(
        `Untranslated preceding utterance, for resolving explicit references only: ${JSON.stringify(context.sourceContext)}. Do not translate or repeat it.`)
    } else if (context?.previousSegments && context.previousSegments.length > 0) {
      const history = context.previousSegments
        .map((s) => `  ${s.source} → ${s.translated}`)
        .join('\n')
      contextParts.push(`Previous translations for context:\n${history}`)
    }
    const contextSection = contextParts.length > 0 ? contextParts.join('\n\n') + '\n\n' : ''

    return translateProtectedCloudText(text, context?.glossary, async (source, hasNames) => {
      const nameInstruction = hasNames ? ' Copy all bracketed name markers exactly.' : ''
      const targetName = to === 'zh' ? 'Traditional Chinese as used in Taiwan' : LANG_NAMES_EN[to]
      const missingSubject = from === 'ja' && to === 'zh' ? ' Preserve any unstated subject or unfinished thought without filling it in.' : ''
      const prompt = `${contextSection}Translate the following ${LANG_NAMES_EN[from]} text to ${targetName}. Output ONLY the translated text, nothing else.${missingSubject}${nameInstruction}\n\n${source}`
      const data = await apiFetch<{
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }>({
        url: GEMINI_API_URL,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 256
            }
          })
        },
        timeoutMs: this.timeoutMs,
        signal: context?.signal,
        serviceName: 'Gemini API',
        errorMappings: ERROR_MAPPINGS,
        classifyErrorBody: classifyGeminiError
      })
      const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text
      return typeof translated === 'string' ? translated.trim() : undefined
    }, { from, to, sourceContext: context?.sourceContext })
  }

  async dispose(): Promise<void> {
    log.info('Disposing resources')
  }
}
