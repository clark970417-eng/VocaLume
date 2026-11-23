/**
 * GER (Generative Error Correction) processor for async STT post-processing (#409).
 *
 * Design:
 *   STT result → Translation (immediate, uncorrected) → Display
 *            ↘ GER (async, background) → Re-translate if changed → Update display
 *
 * GER runs in the shared SLM UtilityProcess (worker-pool.ts → slm-worker.ts).
 * It is selective: only triggers when STT confidence is below a threshold,
 * and only corrects proper nouns, numbers, units, and glossary terms.
 *
 * This feature is experimental and disabled by default.
 */

import type { EventEmitter } from 'events'
import type {
  Language,
  GlossaryEntry,
  TranslatorEngine,
  TranslationResult
} from '../engines/types'
import {
  GER_CONFIDENCE_THRESHOLD,
  GER_TIMEOUT_MS,
  GER_MIN_TEXT_LENGTH
} from '../engines/constants'
import { workerPool } from '../main/worker-pool'
import { createLogger } from '../main/logger'
import { validateTranslation } from '../../../extension/translation-policy.mjs'
import { performanceState } from '../main/performance-state'

const log = createLogger('pipeline:ger')

const facts = (value: string): string => (value.normalize('NFKC').match(
  /\d+(?:[.,]\d+)*|[〇零一二三四五六七八九十百千万億]+(?=人|円|年|月|日|時|分|秒|割|件|個|%|パーセント)|ません|ない|なかった|不|沒|没|未|否|上回|下回|上昇|低下|増加|減少/gu
) ?? []).join('|')

function faithfulSmallEdit(original: string, candidate: string): boolean {
  if (facts(original) !== facts(candidate)) return false
  const before = Array.from(original.normalize('NFKC').replace(/[\p{P}\s]/gu, ''))
  const after = Array.from(candidate.normalize('NFKC').replace(/[\p{P}\s]/gu, ''))
  if (before.length > 160 || after.length > 160) return false
  const limit = Math.min(6, Math.max(2, Math.floor(before.length / 5)))
  if (Math.abs(before.length - after.length) > limit) return false
  let row = Array.from({ length: after.length + 1 }, (_, index) => index)
  for (let i = 0; i < before.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < after.length; j++) {
      next.push(Math.min(next[j]! + 1, row[j + 1]! + 1, row[j]! + (before[i] === after[j] ? 0 : 1)))
    }
    row = next
  }
  return row[after.length]! <= limit
}

export interface GERDeps {
  readonly emitter: EventEmitter
  getTranslator(): TranslatorEngine | null
  getGlossary(): GlossaryEntry[]
  /** Current pipeline session generation — used to drop stale async emits (#719) */
  getGeneration?(): number
  getConfigurationRevision?(): number
}

/**
 * Async GER post-correction processor.
 * Call `maybeCorrect()` after STT produces a result — it runs in the background
 * and emits a 'ger-corrected' event if the corrected text differs.
 */
export class GERProcessor {
  private enabled = false
  private deps: GERDeps
  /** Track in-flight corrections to avoid duplicate work */
  private pendingTimestamp: number | null = null
  /** Last known translation for SSBD re-translation draft */
  private active?: AbortController
  private revision = 0

  constructor(deps: GERDeps) {
    this.deps = deps
  }

  /** Enable or disable GER post-correction */
  setEnabled(enabled: boolean): void {
    if (enabled !== this.enabled) this.reset()
    this.enabled = enabled
    log.info(`GER ${enabled ? 'enabled' : 'disabled'}`)
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Attempt async GER correction on the given STT result.
   * Returns immediately (fire-and-forget). If correction succeeds and
   * the text differs, re-translates and emits 'ger-corrected' event.
   *
   * @param sttText - Raw STT text
   * @param confidence - STT confidence (0.0–1.0), undefined means unknown
   * @param language - Detected source language
   * @param targetLanguage - Translation target language
   * @param timestamp - Original result timestamp for deduplication
   * @param previousTranslation - Previous translation output for SSBD re-translation draft
   */
  maybeCorrect(
    sttText: string,
    confidence: number | undefined,
    language: Language,
    targetLanguage: Language,
    timestamp: number,
    previousTranslation?: string
  ): void {
    if (!this.enabled || performanceState().auxiliaryWorkPaused) return

    // Skip if text is too short to meaningfully correct
    if (sttText.length < GER_MIN_TEXT_LENGTH) return

    const lowConfidence = Number.isFinite(confidence) && confidence! < GER_CONFIDENCE_THRESHOLD
    const riskyTerm = confidence === undefined && (facts(sttText).length > 0 ||
      this.deps.getGlossary().some(entry => entry.source.length >= 2 && sttText.includes(entry.source)))
    if (!lowConfidence && !riskyTerm) return

    // Skip if worker is not alive (no SLM model loaded)
    if (!workerPool.isAlive) {
      log.info('GER skipped: SLM worker not running')
      return
    }

    // Skip if another correction is already in flight
    if (this.pendingTimestamp !== null) {
      log.info('GER skipped: correction already in flight')
      return
    }

    this.pendingTimestamp = timestamp
    const revision = this.revision
    const controller = new AbortController()
    this.active = controller
    // One budget covers correction AND retranslation.
    const timeout = setTimeout(() => controller.abort(), GER_TIMEOUT_MS)
    this.runCorrection(sttText, language, targetLanguage, timestamp, controller.signal, previousTranslation).catch((err) => {
      if (!controller.signal.aborted) log.warn('GER correction failed:', err)
    }).finally(() => {
      clearTimeout(timeout)
      if (this.revision === revision && this.pendingTimestamp === timestamp) {
        this.pendingTimestamp = null
        this.active = undefined
      }
    })
  }

  /** New speech gets priority over optional background work. */
  preempt(): void { this.active?.abort() }

  /** Reset state (e.g., on pipeline stop) */
  reset(): void {
    this.preempt()
    this.revision++
    this.pendingTimestamp = null
    this.active = undefined
  }

  private async runCorrection(
    sttText: string,
    language: Language,
    targetLanguage: Language,
    timestamp: number,
    signal: AbortSignal,
    previousTranslation?: string
  ): Promise<void> {
    const t0 = performance.now()
    const gen = this.deps.getGeneration?.()
    const revision = this.revision
    const configuration = this.deps.getConfigurationRevision?.()
    const translator = this.deps.getTranslator()
    const current = (): boolean => !signal.aborted && this.enabled && !performanceState().auxiliaryWorkPaused && revision === this.revision &&
      gen === this.deps.getGeneration?.() && configuration === this.deps.getConfigurationRevision?.() &&
      translator === this.deps.getTranslator()

    const glossaryEntries = this.deps.getGlossary()
    const glossary = glossaryEntries.length > 0
      ? glossaryEntries.map((g) => ({ source: g.source, target: g.target }))
      : undefined

    const correctedText = await workerPool.sendRequest(
      { type: 'ger-correct', text: sttText, language, glossary }, 'ger-correct', undefined, signal
    )
    if (!current()) return

    const gerMs = performance.now() - t0
    log.info(`GER: ${gerMs.toFixed(0)}ms "${sttText}" → "${correctedText}"`)

    // Only proceed if the correction actually changed the text
    const trimmedOriginal = sttText.trim()
    const trimmedCorrected = correctedText.trim()
    if (!trimmedCorrected || trimmedCorrected === trimmedOriginal || !faithfulSmallEdit(trimmedOriginal, trimmedCorrected)) {
      log.info('GER: no change, skipping re-translation')
      return
    }

    // Re-translate the corrected text, using SSBD if available for faster re-translation.
    // Since GER only makes small corrections, most of the previous translation remains valid.
    if (!translator) {
      log.warn('GER: no translator available for re-translation')
      return
    }

    let translatedText: string
    if (language === targetLanguage) {
      translatedText = trimmedCorrected
    } else {
      const context = { glossary, previousSegments: [], signal }
      translatedText = translator.translateSSBD && previousTranslation
        ? await translator.translateSSBD(trimmedCorrected, previousTranslation, language, targetLanguage, context)
        : await translator.translate(trimmedCorrected, language, targetLanguage, context)
      if (!current()) return
      if (language === 'ja' && targetLanguage === 'zh') translatedText = validateTranslation(translatedText, 'ja-zh', trimmedCorrected, glossary)
    }
    if (!translatedText.trim()) return

    const result: TranslationResult = {
      sourceText: trimmedCorrected,
      translatedText,
      sourceLanguage: language,
      targetLanguage: targetLanguage,
      timestamp,
      captionRevision: 1,
      isInterim: false,
      translationStage: 'ger-corrected'
    }

    // Drop the correction if the engine was switched/stopped while it was in flight (#719)
    if (!current()) {
      log.info('GER: generation changed during correction, dropping stale result')
      return
    }

    log.info(`GER corrected: "${trimmedOriginal}" → "${trimmedCorrected}" → "${translatedText}"`)
    this.deps.emitter.emit('ger-corrected', result)
  }
}
