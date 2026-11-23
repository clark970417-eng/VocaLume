import type { TranslationResult } from '../engines/types'

/** Original and corrected versions have the same cue timestamp. Old
 * corrections can be logged, but must not interrupt the active caption. */
export class LiveCaptionRevisions {
  private history = new Map<number, TranslationResult>()
  private current?: number

  record(result: TranslationResult): void {
    if (result.isInterim || !result.sourceText.trim()) return
    this.history.set(result.timestamp, { ...result, captionRevision: 0 })
    this.current = result.timestamp
    if (this.history.size > 96) this.history.delete(this.history.keys().next().value!)
  }

  provisional(result: TranslationResult): void {
    const active = this.current === undefined ? undefined : this.history.get(this.current)
    if (active && result.sourceText.trim() && result.sourceText !== active.sourceText) this.current = undefined
  }

  correct(revision: TranslationResult): { result: TranslationResult; visible: boolean } | undefined {
    const original = this.history.get(revision.timestamp)
    const version = revision.captionRevision ?? 1
    if (!original || !Number.isInteger(version) || version !== (original.captionRevision ?? 0) + 1 ||
        original.sourceLanguage !== revision.sourceLanguage || original.targetLanguage !== revision.targetLanguage ||
        !revision.sourceText.trim() || !revision.translatedText.trim() ||
        (original.sourceText === revision.sourceText && original.translatedText === revision.translatedText)) return
    const result = {
      ...original, ...revision, timestamp: original.timestamp, captionRevision: version, isInterim: false,
      confirmedText: undefined, interimText: undefined, tokenConfidences: undefined,
      spokenText: revision.spokenText ?? revision.translatedText
    }
    this.history.set(result.timestamp, result)
    return { result, visible: this.current === result.timestamp }
  }

  clear(): void {
    this.history.clear()
    this.current = undefined
  }
}
