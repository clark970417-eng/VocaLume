import { TranslationValidationError } from '../../../extension/translation-policy.mjs'
import { TemporaryTranslationServiceError } from '../engines/translator/api-utils'

/** Retry only a quickly failed final translation, never recognition or capture.
 * One extra inference is allowed; successful/slow/cancelled work adds no retry. */
export async function recoverFinalTranslation(
  translate: () => Promise<string>, isCurrent: () => boolean,
  options: {retry?: () => Promise<string>; now?: () => number} = {}
): Promise<string> {
  const now = options.now ?? (() => performance.now())
  const started = now()
  const run = async (request: () => Promise<string>): Promise<string> => {
    const result = await request()
    if (typeof result !== 'string' || !result.trim()) {
      throw new TranslationValidationError('Translation service returned no text')
    }
    return result
  }
  try { return await run(translate) } catch (error) {
    const retryable = error instanceof Error && (
      error.name === 'TranslationValidationError' ||
      error.name === 'WorkerTerminatedError' ||
      error.message === 'Worker process exited' ||
      error instanceof TemporaryTranslationServiceError ||
      /^翻譯(?:遺漏人名|人名標記不完整|重複了人名)，請重試$/u.test(error.message)
    )
    // This bounds eligibility for retry, not its duration; the worker still
    // owns its existing timeout. Do not compound an already slow inference.
    if (!retryable || now() - started >= 1000 || !isCurrent()) throw error
    return run(options.retry ?? translate)
  }
}
