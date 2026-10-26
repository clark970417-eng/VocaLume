/** Retry only a quickly failed final translation, never recognition or capture.
 * One extra inference is allowed; successful/slow/cancelled work adds no retry. */
export async function recoverFinalTranslation(
  translate: () => Promise<string>, isCurrent: () => boolean,
  options: {retry?: () => Promise<string>; now?: () => number} = {}
): Promise<string> {
  const now = options.now ?? (() => performance.now())
  const started = now()
  try { return await translate() } catch (error) {
    const retryable = error instanceof Error && (
      error.name === 'TranslationValidationError' ||
      error.message === 'Worker process exited' ||
      /^翻譯(?:遺漏人名|人名標記不完整)，請重試$/u.test(error.message)
    )
    // This bounds eligibility for retry, not its duration; the worker still
    // owns its existing timeout. Do not compound an already slow inference.
    if (!retryable || now() - started >= 1000 || !isCurrent()) throw error
    return (options.retry ?? translate)()
  }
}
