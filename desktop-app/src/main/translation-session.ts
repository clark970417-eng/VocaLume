/** HY-MT1.5 is trained with user-only translation prompts, not the wrapper's
 * default helpful-assistant system message. Clear it on creation and reuse. */
export function resetTranslationHistory(
  session: { setChatHistory(history: []): void; resetChatHistory(): void },
  modelType: string
): void {
  if (modelType === 'hunyuan-mt-15' || modelType === 'hunyuan-mt-2') session.setChatHistory([])
  else session.resetChatHistory()
}

/** Small translation models can translate reference history instead of the input.
 * Keep terminology but do not prepend earlier utterances to these models. */
export function translationContextForModel<T extends { previousSegments?: unknown[]; sourceContext?: string }>(
  context: T | undefined, modelType: string
): T | undefined {
  if (!context || !['hunyuan-mt-15', 'hunyuan-mt-2'].includes(modelType)) return context
  // The adjacent source question is used by conservative reply rules only.
  // Passing it into this small model caused question/answer leakage in A/B tests.
  const safe = { ...context, previousSegments: [] }
  delete safe.sourceContext
  return safe
}
