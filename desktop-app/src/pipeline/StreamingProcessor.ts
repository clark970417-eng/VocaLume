import { FinalCaptionQueue } from './FinalCaptionQueue'
import { performanceState } from '../main/performance-state'
import { completeSentence } from '../../../extension/sentence-boundary.mjs'
import { RecognitionCheckpoint } from './RecognitionCheckpoint'
import { StreamingRecognition } from './StreamingRecognition'
import { recoverFinalTranslation } from './FinalTranslationRecovery'
import { recognitionVocabulary, boundedRecognitionVocabulary } from '../engines/stt/recognition-vocabulary'
import { JapaneseCaptionContext } from './JapaneseCaptionContext'
import { SpeechToneAnalyzer } from './SpeechToneAnalyzer'
import { applySpeechTone, laughterMarker, type SpeechToneMode } from './SpeechTone'
import type { EventEmitter } from 'events'
import type {
  TranslationResult,
  Language,
  GlossaryEntry,
  TranslatorEngine,
  SpeakerDiarizer,
  DiarizationResult
} from '../engines/types'
import type { STTEngine, SpeechEvidence } from '../engines/types'
import type { LocalAgreement } from './LocalAgreement'
import type { ContextBuffer } from './ContextBuffer'
import type { GERProcessor } from './GERProcessor'
import { detectClauseBoundary, detectTranslationBoundary, countUnits } from './ClauseBoundaryDetector'
import { createLogger } from '../main/logger'

const log = createLogger('pipeline:stream')

const MAX_STREAMING_LOCK_RESOLVERS = 50
const STREAMING_LOCK_TIMEOUT_MS = 10_000
/** Debounce delay before translating interim text (ms) */
const TRANSLATE_DEBOUNCE_MS = 250

export interface PreparedStreamingFinal {
  sourceText: string
  completion: Promise<TranslationResult | null>
}

export interface StreamingDeps {
  readonly emitter: EventEmitter
  readonly agreement: LocalAgreement
  readonly contextBuffer: ContextBuffer
  getSTTEngine(): STTEngine | null
  getTranslator(): TranslatorEngine | null
  getGlossary(): GlossaryEntry[]
  getCachedTranslation?(text: string, from: Language, to: Language): string | undefined
  canReuseInterimTranslation?(): boolean
  translateFinal?(text: string, from: Language, to: Language, recognitionConfidence?: number, sourceContext?: string): Promise<string>
  getSimulMtConfig(): { enabled: boolean; waitK: number }
  resolveTargetLanguage(detectedLang: Language): Language
  /** Notify that processing count changed */
  incrementProcessing(): void
  decrementProcessing(): void
  /** GER processor for async STT post-correction */
  getGER?(): GERProcessor | null
  /** Draft STT engine for fast interim results (#536) */
  getDraftSTTEngine?(): STTEngine | null
  /** Speaker diarizer for multi-speaker identification (#549) */
  getDiarizer?(): SpeakerDiarizer | null
  /** Current pipeline session generation — used to drop stale async emits (#719) */
  getGeneration?(): number
  getSpeechToneMode?(): SpeechToneMode
  getSourceLanguage?(): Language | 'auto'
  detectLaughter?(audio: Float32Array, sampleRate: number): Promise<number>
}

/**
 * Handles streaming audio processing: processStreaming(), finalizeStreaming(),
 * and the streaming lock mechanism.
 * Extracted from TranslationPipeline to isolate streaming-specific logic.
 */
export class StreamingProcessor {
  private readonly recognitionCheckpoint = new RecognitionCheckpoint()
  private readonly recognition = new StreamingRecognition(() => this.deps.getSourceLanguage?.() || 'auto')
  private recognitionSource = ''
  private recognitionContextRevision = 0
  private readonly japaneseContext = new JapaneseCaptionContext()
  private readonly toneAnalyzer = new SpeechToneAnalyzer()
  private preparation?: {
    text: string; from: Language; to: Language; translator: TranslatorEngine; glossary: string
    controller: AbortController; completion: Promise<string | null>
  }
  private readonly preparations = new Set<AbortController>()
  private preparedThisCue = false
  private readonly finalQueue = new FinalCaptionQueue()
  private finalGeneration = 0
  private lastFinalTimestamp = 0
  private streamingLock = false
  private streamingLockResolvers: Array<() => void> = []

  // Streaming translation state
  private lastTranslatedSource = ''
  lastTranslatedConfirmed = ''
  simulMtPreviousOutput = ''

  /** Debounced translation: timer and last source text for change detection */
  private translateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private debouncedTranslationInFlight = false
  private pendingTranslation: (() => void) | null = null
  private interimAbort = new AbortController()
  private draftSttInFlight = false
  private recognitionRevision = 0
  private primaryRevision = 0
  private lastSourceTextForTranslate = ''
  private translationDirectionKey = ''
  private translationDirectionRevision = 0

  /** SimulMT state: last boundary we translated up to (#550) */
  private simulMtLastBoundaryText = ''
  /** SimulMT: in-flight translation promise to prevent concurrent requests */
  private simulMtInFlight = false
  /** Latest recognition revision that arrived while SimulMT was busy. */
  private simulMtPending: (() => void) | null = null
  private simulMtResetPending = false

  /** Last diarization result for merging with STT output (#549) */
  private lastDiarizationResult: DiarizationResult | null = null

  /** Clause-level overlap: source text already sent for translation (#615) */
  private clauseTranslatedPrefix = ''
  /** Clause-level overlap: translation result for the translated prefix (#615) */
  private clauseTranslation = ''
  /** Clause-level overlap: in-flight flag to prevent concurrent clause translations */
  private clauseTranslationInFlight = false

  private deps: StreamingDeps

  constructor(deps: StreamingDeps) {
    this.deps = deps
  }

  get isLocked(): boolean {
    return this.streamingLock
  }

  /**
   * Whether a result scheduled under generation `gen` may still be emitted (#719).
   * Returns true when generation tracking is unavailable (no getGeneration dep).
   */
  private samePrefix(prefix: string, text: string): boolean {
    const normalize = (s: string) => s.replace(/[\p{P}\s]/gu, '')
    return normalize(text).startsWith(normalize(prefix))
  }

  private utteranceGeneration = 0

  private isCurrentGeneration(gen: number | undefined, utterance: number, contextRevision: number): boolean {
    return contextRevision === this.recognitionContextRevision && utterance === this.utteranceGeneration && (gen === undefined || this.deps.getGeneration?.() === gen)
  }

  /**
   * Keep interim work scoped to the current source/target pair. In auto-source
   * mode the detected language can change mid-cue; old translations must not
   * overwrite a pass-through caption or seed a new SimulMT direction.
   */
  private updateTranslationDirection(from: Language, to: Language): number {
    const key = `${from}\u0000${to}`
    if (key === this.translationDirectionKey) return this.translationDirectionRevision

    const hadDirection = this.translationDirectionKey !== ''
    this.translationDirectionKey = key
    this.translationDirectionRevision++
    if (!hadDirection) return this.translationDirectionRevision

    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    if (this.translateDebounceTimer) {
      clearTimeout(this.translateDebounceTimer)
      this.translateDebounceTimer = null
    }
    this.pendingTranslation = null
    this.lastSourceTextForTranslate = ''
    this.lastTranslatedSource = ''
    this.lastTranslatedConfirmed = ''
    this.clauseTranslatedPrefix = ''
    this.clauseTranslation = ''
    this.clauseTranslationInFlight = false
    this.debouncedTranslationInFlight = false
    this.preparation?.controller.abort()
    this.preparation = undefined
    this.preparedThisCue = false
    this.simulMtPending = null

    if (this.simulMtInFlight) {
      // Reset the shared KV session after its current non-reentrant request
      // completes; starting a new direction before then could corrupt both.
      this.simulMtResetPending = true
    } else {
      this.simulMtPreviousOutput = ''
      this.simulMtLastBoundaryText = ''
      this.deps.getTranslator()?.resetSimulMtSession?.()
    }
    return this.translationDirectionRevision
  }

  private isCurrentTranslationDirection(revision: number): boolean {
    return revision === this.translationDirectionRevision
  }

  /** Reset all streaming state */
  reset(): void {
    this.resetSourceContext()
    this.toneAnalyzer.dispose()
    this.resetUtterance()
  }

  stopToneAnalysis(): void { this.toneAnalyzer.dispose() }

  resetSourceContext(): void {
    // Invalidate settings-bound work without releasing a busy recognition lock.
    this.finalGeneration++
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    for (const controller of this.preparations) controller.abort()
    this.preparations.clear()
    this.preparation = undefined
    this.preparedThisCue = false
    this.lastTranslatedSource = ''
    this.lastTranslatedConfirmed = ''
    this.pendingTranslation = null
    this.debouncedTranslationInFlight = false
    this.clauseTranslationInFlight = false
    this.simulMtInFlight = false
    this.simulMtPending = null
    this.simulMtPreviousOutput = ''
    this.simulMtLastBoundaryText = ''
    this.clauseTranslatedPrefix = ''
    this.clauseTranslation = ''
    if (this.translateDebounceTimer) { clearTimeout(this.translateDebounceTimer); this.translateDebounceTimer = null }
    this.japaneseContext.reset()
    this.recognitionSource = ''
    this.recognitionContextRevision++
    this.translationDirectionKey = ''
    this.translationDirectionRevision++
    this.simulMtResetPending = false
    this.recognitionCheckpoint.clear()
    this.recognition.boundary.clear()
  }

  private beginTone(audio: Float32Array, sampleRate: number) {
    const mode = this.deps.getSpeechToneMode?.() || 'off'
    const state = { mode, confidence: 0 }
    if (mode !== 'off' && performanceState().previewDutyCycle >= .85) {
      const work = this.deps.detectLaughter
        ? this.deps.detectLaughter(audio, sampleRate) : this.toneAnalyzer.analyze(audio, sampleRate)
      // A late classification never delays or rewrites a delivered caption.
      void work.then(confidence => { state.confidence = confidence }).catch(() => {})
    }
    return state
  }

  private toneOnly(tone: { mode: SpeechToneMode; confidence: number }) {
    if (tone.mode === 'off' || tone.mode !== this.deps.getSpeechToneMode?.() || tone.confidence < .93) return null
    const source = this.deps.getSourceLanguage?.()
    const language = source && source !== 'auto' ? source : 'ja'
    return { text: laughterMarker('natural', language), language, timestamp: Date.now(), isFinal: true }
  }

  private decorateTone(source: string, translated: string, to: Language, tone: { mode: SpeechToneMode; confidence: number }): string {
    return applySpeechTone(source, translated, to,
      tone.mode === this.deps.getSpeechToneMode?.() ? tone.mode : 'off', tone.confidence)
  }

  private resetUtterance(): void {
    this.recognition.budget.resetSource()
    this.recognitionCheckpoint.clear()
    this.recognitionSource = ''
    this.preparation?.controller.abort()
    this.preparation = undefined
    this.preparedThisCue = false
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    this.utteranceGeneration++
    this.streamingLock = false
    for (const r of this.streamingLockResolvers) r()
    this.streamingLockResolvers = []
    this.lastTranslatedSource = ''
    this.lastTranslatedConfirmed = ''
    this.simulMtPreviousOutput = ''
    if (this.translateDebounceTimer) {
      clearTimeout(this.translateDebounceTimer)
      this.translateDebounceTimer = null
    }
    this.lastSourceTextForTranslate = ''
    this.translationDirectionKey = ''
    this.translationDirectionRevision++
    this.pendingTranslation = null
    this.simulMtLastBoundaryText = ''
    this.simulMtInFlight = false
    this.simulMtPending = null
    this.simulMtResetPending = false
    this.clauseTranslatedPrefix = ''
    this.clauseTranslation = ''
    this.clauseTranslationInFlight = false
    this.debouncedTranslationInFlight = false

    // Reset persistent SimulMT session in worker
    const translator = this.deps.getTranslator()
    if (translator?.resetSimulMtSession) {
      translator.resetSimulMtSession()
    }
  }

  /** Resume only the latest ready revision when the worker finishes. No polling. */
  private drainPendingTranslation(): void {
    if (this.finalQueue.pending || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) return
    const pending = this.pendingTranslation
    this.pendingTranslation = null
    pending?.()
  }

  private recognitionKey(stt: STTEngine): string {
    const language = this.deps.getSourceLanguage?.() || 'auto'
    const personal = this.deps.getGlossary().map(term => term.source)
    const vocabulary = language === 'ja' ? recognitionVocabulary(personal, this.recognitionSource)
      : language === 'zh' ? boundedRecognitionVocabulary(personal.filter(term => !/[ぁ-んァ-ヶ]/u.test(term))) : []
    stt.setVocabularyHints?.(vocabulary)
    return JSON.stringify([stt.id, language, vocabulary, this.recognitionContextRevision])
  }

  private currentSpeaker(): DiarizationResult | null {
    // Paused speaker analysis must not present a previous speaker as current.
    if (performanceState().previewDutyCycle < 0.85) this.lastDiarizationResult = null
    return this.lastDiarizationResult
  }

  async processStreaming(
    audioBuffer: Float32Array,
    sampleRate: number,
    evidence?: SpeechEvidence
  ): Promise<TranslationResult | null> {
    const sttEngine = this.deps.getSTTEngine()
    if (!sttEngine) return null
    // Drop chunk if another streaming call is in-flight — acceptable because
    // the rolling buffer re-sends accumulated audio on the next interval (#103)
    if (this.streamingLock) return null
    const recognitionKey = this.recognitionKey(sttEngine)
    const recognitionContextRevision = this.recognitionContextRevision
    const checkpoint = this.recognitionCheckpoint.reuse(audioBuffer, sampleRate, evidence, recognitionKey)
    // A complete sentence waiting for translation has priority over another
    // speculative decode of the rolling buffer. Accepted finals are retained.
    if (this.finalQueue.pending || (!checkpoint && this.recognition.budget.remainingMs(performance.now(), performanceState()) > 0)) return null

    this.deps.incrementProcessing()
    const revision = ++this.recognitionRevision
    this.streamingLock = true
    const gen = this.deps.getGeneration?.()
    const contextRevision = this.recognitionContextRevision
    const utterance = this.utteranceGeneration
    try {
      // Fire draft STT in parallel for fast interim results (#536)
      const pressure = performanceState()
      const draftSttEngine = pressure.previewDutyCycle < 0.85 ? null : this.deps.getDraftSTTEngine?.()
      if (draftSttEngine && !checkpoint) {
        this.runDraftStt(draftSttEngine, audioBuffer, sampleRate, revision)
      }

      // Fire diarization in parallel with STT (#549)
      const diarizer = pressure.previewDutyCycle < 0.85 ? null : this.deps.getDiarizer?.()
      if (diarizer && !checkpoint) {
        this.runDiarization(diarizer, audioBuffer, sampleRate)
      }

      const t0 = performance.now()
      const sttResult = checkpoint || await this.recognition.process(sttEngine, audioBuffer, sampleRate, evidence)
      if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return null
      const sttMs = (performance.now() - t0).toFixed(0)
      if (!sttResult || !sttResult.text.trim()) {
        log.info(`STT: ${sttMs}ms → (no result, ${(audioBuffer.length / sampleRate).toFixed(1)}s audio)`)
        // Reset agreement on silence to prevent stale state accumulation (#75)
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }
      if (recognitionContextRevision === this.recognitionContextRevision) {
        if (!checkpoint) this.recognitionCheckpoint.remember(audioBuffer, sampleRate, evidence, sttResult, recognitionKey)
        this.recognitionSource = sttResult.language === 'ja' ? sttResult.text.slice(-120) : ''
      }
      this.primaryRevision = revision
      this.recognition.budget.observeSource(sttResult.text)
      log.info(`STT: ${sttMs}ms → "${sttResult.text}" [${sttResult.language}]`)

      const agreement = this.deps.agreement.update(sttResult.text)
      const targetLang = this.deps.resolveTargetLanguage(sttResult.language)
      const translationDirectionRevision = this.updateTranslationDirection(sttResult.language, targetLang)
      const sameLanguage = sttResult.language === targetLang

      const fullSourceText = this.japaneseContext.resolve(agreement.confirmedText + agreement.interimText,
        sttResult.language, targetLang, evidence, this.currentSpeaker()?.speakerIndex)

      const simulMtConfig = this.deps.getSimulMtConfig()
      const translator = this.deps.getTranslator()
      const useSimulMt = simulMtConfig.enabled && translator?.translateSimulMt

      const completeSentenceOnly = ['hunyuan-mt', 'hunyuan-mt-15', 'hunyuan-mt-2'].includes(translator?.id || '') &&
        ['ja', 'zh'].includes(sttResult.language) && ['ja', 'zh'].includes(targetLang)
      if (sameLanguage) {
        // Keep text already in the selected target language verbatim and avoid
        // spending a model decode on a no-op translation.
        if (this.translateDebounceTimer) {
          clearTimeout(this.translateDebounceTimer)
          this.translateDebounceTimer = null
        }
        this.pendingTranslation = null
        this.lastSourceTextForTranslate = fullSourceText
        this.lastTranslatedSource = fullSourceText
        this.lastTranslatedConfirmed = fullSourceText
        this.clauseTranslatedPrefix = fullSourceText
        this.clauseTranslation = fullSourceText
      } else if (completeSentenceOnly) {
        // Prepare at most one agreed, complete sentence. Never publish a
        // speculative Chinese/Japanese result before the final source agrees.
        if (!this.japaneseContext.referenceFor(fullSourceText, sttResult.language, targetLang, evidence, this.currentSpeaker()?.speakerIndex)) {
          this.prepareSentence(fullSourceText, agreement.confirmedText, sttResult.language, targetLang,
            !!evidence?.speechEndSample && audioBuffer.length - evidence.speechEndSample >= sampleRate * .192)
        }
      } else if (useSimulMt) {
        // SimulMT mode (#550): translate at clause boundaries using KV cache reuse
        this.handleSimulMtStreaming(
          fullSourceText,
          sttResult.language,
          targetLang,
          agreement.confirmedText,
          agreement.interimText,
          simulMtConfig.waitK,
          translationDirectionRevision
        )
      } else {
        // Fire clause-level overlap translation when new confirmed text is available (#615).
        // This runs in parallel (fire-and-forget) so translation starts before STT
        // finishes the next chunk, reducing perceived latency.
        if (agreement.newConfirmed) {
          this.runClauseTranslation(
            agreement.confirmedText,
            fullSourceText,
            sttResult.language,
            targetLang,
            translationDirectionRevision
          )
        }

        // Start the first hypothesis immediately; briefly coalesce subsequent revisions.
        // Busy requests retain only the latest pending source, so recognition continues
        // independently without building a translation backlog.
        if (fullSourceText !== this.lastSourceTextForTranslate) {
          this.lastSourceTextForTranslate = fullSourceText
          if (this.translateDebounceTimer) clearTimeout(this.translateDebounceTimer)
          this.pendingTranslation = null
          const translateWhenIdle = (): void => {
            this.translateDebounceTimer = null
            if (!this.isCurrentTranslationDirection(translationDirectionRevision)) return
            if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return
            if (this.finalQueue.pending || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) {
              this.pendingTranslation = translateWhenIdle
              return
            }
            if (fullSourceText === this.lastTranslatedSource) return
            const dbTranslator = this.deps.getTranslator()
            if (!dbTranslator || !fullSourceText.trim()) return
            const glossaryEntries = this.deps.getGlossary()
            const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
            // Partial speech must not borrow words from earlier complete utterances.
            const ctx = { glossary, previousSegments: [], signal: this.interimAbort.signal,
              onPartial: (translatedText: string): void => {
                if (!this.isCurrentTranslationDirection(translationDirectionRevision) ||
                    !this.isCurrentGeneration(gen, utterance, contextRevision) || fullSourceText !== this.lastSourceTextForTranslate) return
                this.deps.emitter.emit('interim-result', {
                  sourceText: this.lastSourceTextForTranslate, confirmedText: agreement.confirmedText,
                  interimText: agreement.interimText, translatedText, sourceLanguage: sttResult.language,
                  targetLanguage: targetLang, timestamp: Date.now(), isInterim: true
                })
              }
            }

            // Use SSBD for re-translation when we have a previous translation,
            // since most of the output likely remains valid (#607)
            this.debouncedTranslationInFlight = true
            const cached = this.deps.getCachedTranslation?.(fullSourceText, sttResult.language, targetLang)
            const translatePromise = cached !== undefined ? Promise.resolve(cached) : (dbTranslator.translateSSBD && this.lastTranslatedConfirmed)
              ? dbTranslator.translateSSBD(
                  fullSourceText,
                  this.lastTranslatedConfirmed,
                  sttResult.language,
                  targetLang,
                  ctx
                ).catch((ssbdErr) => {
                  if (ctx.signal.aborted || /Translation (timed out|exceeded its output limit|cancelled)/.test(String(ssbdErr))) throw ssbdErr
                  log.warn('SSBD debounced translation failed, falling back:', ssbdErr)
                  return dbTranslator.translate(fullSourceText, sttResult.language, targetLang, ctx)
                })
              : dbTranslator.translate(fullSourceText, sttResult.language, targetLang, ctx)

            translatePromise.then((translated) => {
              // Drop stale results before mutating shared state, so a switch mid-flight
              // cannot leave a resurfacing translatedText for the next generation (#719).
              if (!this.isCurrentTranslationDirection(translationDirectionRevision) ||
                  !this.isCurrentGeneration(gen, utterance, contextRevision) || !this.samePrefix(fullSourceText, this.lastSourceTextForTranslate)) return
              this.lastTranslatedSource = fullSourceText
              this.lastTranslatedConfirmed = translated
              const debouncedResult: TranslationResult = {
                sourceText: this.lastSourceTextForTranslate,
                confirmedText: agreement.confirmedText,
                interimText: agreement.interimText,
                translatedText: translated,
                sourceLanguage: sttResult.language,
                targetLanguage: targetLang,
                timestamp: Date.now(),
                isInterim: true
              }
              this.deps.emitter.emit('interim-result', debouncedResult)
            }).catch((err) => {
              if (this.isCurrentTranslationDirection(translationDirectionRevision) && this.isCurrentGeneration(gen, utterance, contextRevision)) {
                log.warn('Debounced translation failed:', err)
              }
            }).finally(() => {
              if (this.isCurrentTranslationDirection(translationDirectionRevision) && this.isCurrentGeneration(gen, utterance, contextRevision)) {
                this.debouncedTranslationInFlight = false
                this.drainPendingTranslation()
              }
            })
          }
          this.translateDebounceTimer = setTimeout(translateWhenIdle, this.lastTranslatedSource ? TRANSLATE_DEBOUNCE_MS : 0)
        }
      }

      const speaker = this.currentSpeaker()
      const interimResult: TranslationResult = {
        sourceText: fullSourceText,
        confirmedText: agreement.confirmedText,
        interimText: agreement.interimText,
        translatedText: this.samePrefix(this.lastTranslatedSource, fullSourceText) ? this.lastTranslatedConfirmed : '',
        sourceLanguage: sttResult.language,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true,
        ...(speaker && {
          speakerLabel: speaker.speakerLabel,
          speakerIndex: speaker.speakerIndex
        })
      }

      this.deps.emitter.emit('interim-result', interimResult)
      return interimResult
    } catch (err) {
      if (this.isCurrentGeneration(gen, utterance, contextRevision)) this.deps.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      return null
    } finally {
      this.streamingLock = false
      this.deps.decrementProcessing()
      for (const r of this.streamingLockResolvers) r()
      this.streamingLockResolvers = []
    }
  }

  /** Recognize now, then translate accepted sentences in order without holding STT. */
  async prepareFinalStreaming(audioChunk: Float32Array, sampleRate: number, evidence?: SpeechEvidence): Promise<PreparedStreamingFinal | null> {
    // Persistent SimulMT sessions share mutable KV state; retain their serial boundary.
    if (this.deps.getSimulMtConfig().enabled && this.deps.getTranslator()?.translateSimulMt) {
      const result = await this.finalizeStreamingSerial(audioChunk, sampleRate, evidence)
      return result ? { sourceText: result.sourceText, completion: Promise.resolve(result) } : null
    }
    const stt = this.deps.getSTTEngine()
    if (!stt) return null
    if (this.streamingLock) {
      await this.waitForStreamingLock()
      if (this.streamingLock) return null
    }
    this.streamingLock = true
    this.deps.incrementProcessing()
    const gen = this.deps.getGeneration?.()
    const finalStartedAt = performance.now()
    const contextRevision = this.recognitionContextRevision
    const finalGeneration = this.finalGeneration
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    const utterance = ++this.utteranceGeneration
    this.pendingTranslation = null
    if (this.translateDebounceTimer) { clearTimeout(this.translateDebounceTimer); this.translateDebounceTimer = null }
    let handedOff = false
    const tone = this.beginTone(audioChunk, sampleRate)
    try {
      const recognitionKey = this.recognitionKey(stt)
      let sttResult = this.recognitionCheckpoint.reuse(audioChunk, sampleRate, evidence, recognitionKey) ||
        await this.recognition.process(stt, audioChunk, sampleRate, evidence, true)
      const nonverbal = !sttResult?.text.trim()
      if (!sttResult?.text.trim()) sttResult = this.toneOnly(tone)
      if (!this.isCurrentGeneration(gen, utterance, contextRevision) || finalGeneration !== this.finalGeneration) return null
      if (!sttResult?.text.trim()) {
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }
      const recognizedText = this.deps.agreement.finalize(sttResult.text).confirmedText
      this.recognition.boundary.remember(audioChunk, sampleRate, evidence, recognizedText, sttResult.language)
      const targetLanguage = this.deps.resolveTargetLanguage(sttResult.language)
      this.updateTranslationDirection(sttResult.language, targetLanguage)
      const sameLanguage = sttResult.language === targetLanguage
      const sourceText = nonverbal ? recognizedText : this.japaneseContext.resolve(recognizedText,
        sttResult.language, targetLanguage, evidence, this.currentSpeaker()?.speakerIndex)
      const sourceContext = !nonverbal && sourceText===recognizedText ? this.japaneseContext.referenceFor(recognizedText,
        sttResult.language,targetLanguage,evidence,this.currentSpeaker()?.speakerIndex) : undefined
      if (nonverbal) this.japaneseContext.reset()
      else this.japaneseContext.remember(recognizedText, sttResult.language, targetLanguage, evidence, this.currentSpeaker()?.speakerIndex)
      const translator = this.deps.getTranslator()
      const glossary = this.deps.getGlossary().map(entry => ({ ...entry }))
      const preparation = this.preparation
      const prepared = !sameLanguage && !sourceContext && preparation && preparation.text === sourceText && preparation.from === sttResult.language &&
        preparation.to === targetLanguage && preparation.translator === translator &&
        preparation.glossary === JSON.stringify(glossary) && this.deps.canReuseInterimTranslation?.() !== false
        ? preparation.completion : null
      // A matching candidate becomes an accepted final. Resetting the next cue
      // must not cancel it; session reset still cancels every live preparation.
      if (prepared) this.preparation = undefined
      const speaker = this.currentSpeaker()
      const reused = !sameLanguage && !sourceContext && this.deps.canReuseInterimTranslation?.() !== false && this.lastTranslatedSource === sourceText
        ? this.lastTranslatedConfirmed : ''
      const valid = (): boolean => contextRevision === this.recognitionContextRevision && finalGeneration === this.finalGeneration &&
        (gen === undefined || gen === this.deps.getGeneration?.())
      const sourceReadyAt = performance.now()
      this.deps.emitter.emit('source-result', sourceText)
      this.resetUtterance()
      handedOff = true
      const completion = this.finalQueue.enqueue(async (): Promise<TranslationResult | null> => {
        if (!valid()) return null
        const translationStartedAt = performance.now()
        try {
          const candidate = sameLanguage ? '' : reused || (prepared ? await prepared : '')
          if (!valid()) return null
          const translatedText = nonverbal ? '' : sameLanguage ? sourceText : candidate || (translator ? this.deps.translateFinal
            ? await this.deps.translateFinal(sourceText, sttResult.language, targetLanguage, sttResult.confidence, sourceContext)
            : await translator.translate(sourceText, sttResult.language, targetLanguage,
              { ...this.deps.contextBuffer.getContext(glossary.length ? glossary : undefined), ...(sourceContext && {sourceContext}) }) : '')
          if (!valid()) return null
          if (!nonverbal) this.deps.contextBuffer.add(sourceText, translatedText)
          const result: TranslationResult = {
            sourceText, translatedText: this.decorateTone(sourceText, translatedText, targetLanguage, tone), sourceLanguage: sttResult.language, targetLanguage,
            spokenText: translatedText,
            timestamp: this.lastFinalTimestamp = Math.max(Date.now(), this.lastFinalTimestamp + 1), isInterim: false, confidence: sttResult.confidence,
            ...(speaker && { speakerLabel: speaker.speakerLabel, speakerIndex: speaker.speakerIndex })
          }
          if (process.env.VOCALUME_CAPTION_TIMING === '1') {
            log.info(`Caption timing: final audio to source ${Math.round(sourceReadyAt - finalStartedAt)}ms, queue ${Math.round(translationStartedAt - sourceReadyAt)}ms, translation ${Math.round(performance.now() - translationStartedAt)}ms`)
          }
          this.deps.emitter.emit('result', result)
          if (!nonverbal) this.deps.getGER?.()?.maybeCorrect(sourceText, sttResult.confidence, sttResult.language,
            targetLanguage, result.timestamp, translatedText || undefined)
          return result
        } catch (error) {
          if (valid()) this.deps.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
          return null
        }
      }, () => {
        this.deps.decrementProcessing()
        this.drainPendingTranslation()
      })
      return { sourceText, completion }
    } catch (error) {
      if (contextRevision === this.recognitionContextRevision && finalGeneration === this.finalGeneration) {
        this.deps.agreement.reset()
        this.resetUtterance()
        this.deps.emitter.emit('error', error instanceof Error ? error : new Error(String(error)))
      }
      return null
    } finally {
      this.streamingLock = false
      if (!handedOff) this.deps.decrementProcessing()
      for (const resolve of this.streamingLockResolvers) resolve()
      this.streamingLockResolvers = []
    }
  }

  async finalizeStreaming(audioChunk: Float32Array, sampleRate: number, evidence?: SpeechEvidence): Promise<TranslationResult | null> {
    const prepared = await this.prepareFinalStreaming(audioChunk, sampleRate, evidence)
    return prepared ? prepared.completion : null
  }

  private prepareSentence(text: string, confirmed: string, from: Language, to: Language, acousticPause: boolean): void {
    if (this.preparation && (this.preparation.text !== text || this.preparation.from !== from || this.preparation.to !== to)) {
      this.preparation.controller.abort()
      this.preparation = undefined
    }
    const translator = this.deps.getTranslator()
    if (this.preparedThisCue || this.finalQueue.pending || !translator || from === to ||
        !['hunyuan-mt-15', 'hunyuan-mt-2'].includes(translator.id) ||
        this.deps.canReuseInterimTranslation?.() === false || performanceState().previewDutyCycle < .85 ||
        (text !== confirmed && !acousticPause) || text.length < 6 || !completeSentence(text, from)) return
    this.preparedThisCue = true
    const controller = new AbortController()
    const glossary = this.deps.getGlossary().map(entry => ({ ...entry }))
    this.preparations.add(controller)
    const completion = Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return this.deps.getCachedTranslation?.(text, from, to) ?? translator.translate(text, from, to,
        { previousSegments: [], glossary, signal: controller.signal })
    }).then(value => value.trim() || null).catch(() => null).finally(() => {
      this.preparations.delete(controller)
    })
    this.preparation = { text, from, to, translator, glossary: JSON.stringify(glossary), controller, completion }
  }

  private async finalizeStreamingSerial(
    audioChunk: Float32Array,
    sampleRate: number,
    evidence?: SpeechEvidence
  ): Promise<TranslationResult | null> {
    const sttEngine = this.deps.getSTTEngine()
    if (!sttEngine) return null

    if (this.streamingLock) {
      await this.waitForStreamingLock()
      // A timed-out waiter must not enter a non-reentrant STT engine.
      if (this.streamingLock) return null
    }
    this.deps.incrementProcessing()
    this.streamingLock = true
    const gen = this.deps.getGeneration?.()
    const contextRevision = this.recognitionContextRevision
    this.interimAbort.abort()
    this.interimAbort = new AbortController()
    const utterance = ++this.utteranceGeneration
    this.pendingTranslation = null
    if (this.translateDebounceTimer) { clearTimeout(this.translateDebounceTimer); this.translateDebounceTimer = null }

    const tone = this.beginTone(audioChunk, sampleRate)
    try {
      const finalStartedAt = performance.now()
      const recognitionKey = this.recognitionKey(sttEngine)
      let sttResult = this.recognitionCheckpoint.reuse(audioChunk, sampleRate, evidence, recognitionKey) ||
        await this.recognition.process(sttEngine, audioChunk, sampleRate, evidence, true)
      const nonverbal = !sttResult?.text.trim()
      if (!sttResult?.text.trim()) sttResult = this.toneOnly(tone)
      if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return null
      if (!sttResult || !sttResult.text.trim()) {
        this.deps.agreement.reset()
        this.resetUtterance()
        return null
      }

      const agreement = this.deps.agreement.finalize(sttResult.text)
      const targetLang = this.deps.resolveTargetLanguage(sttResult.language)
      this.updateTranslationDirection(sttResult.language, targetLang)
      const sameLanguage = sttResult.language === targetLang
      const recognizedText = agreement.confirmedText
      this.recognition.boundary.remember(audioChunk, sampleRate, evidence, recognizedText, sttResult.language)
      const sourceContext = !nonverbal ? this.japaneseContext.referenceFor(recognizedText,
        sttResult.language,targetLang,evidence,this.currentSpeaker()?.speakerIndex) : undefined
      if (nonverbal) this.japaneseContext.reset()
      else {
        agreement.confirmedText = this.japaneseContext.resolve(recognizedText,
          sttResult.language, targetLang, evidence, this.currentSpeaker()?.speakerIndex)
        this.japaneseContext.remember(recognizedText, sttResult.language, targetLang, evidence, this.currentSpeaker()?.speakerIndex)
      }
      const sourceReadyAt = performance.now()
      this.deps.emitter.emit('source-result', agreement.confirmedText)

      const glossaryEntries = this.deps.getGlossary()
      const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
      const translator = this.deps.getTranslator()

      const simulMtConfig = this.deps.getSimulMtConfig()
      const useSimulMt = simulMtConfig.enabled && translator?.translateSimulMt &&
        !(['hunyuan-mt', 'hunyuan-mt-15', 'hunyuan-mt-2'].includes(translator.id) &&
          ['ja', 'zh'].includes(sttResult.language) && ['ja', 'zh'].includes(targetLang))

      let translatedText = ''
      let translationStage: 'simulmt-revised' | undefined

      if (!nonverbal && sameLanguage) {
        // Preserve target-language speech exactly instead of running a model.
        translatedText = agreement.confirmedText
      } else if (!nonverbal && useSimulMt && translator && agreement.confirmedText.trim()) {
        // SimulMT revision: retranslate the full clause for accuracy (#550)
        let usedRevision = true
        const context = { ...this.deps.contextBuffer.getContext(glossary), ...(sourceContext && {sourceContext}) }
        translatedText = await recoverFinalTranslation(() => translator.translateSimulMt!(
          agreement.confirmedText,
          this.simulMtPreviousOutput,
          sttResult.language,
          targetLang,
          true, // revision mode — full clause available
          context
        ), () => this.isCurrentGeneration(gen, utterance, contextRevision) && translator === this.deps.getTranslator() &&
          glossaryEntries === this.deps.getGlossary() && targetLang === this.deps.resolveTargetLanguage(sttResult.language), {
          // Bypass the rejected SimulMT session once using the complete source.
          // Do not nest translateFinal's retry and accidentally run three times.
          retry: () => { usedRevision = false; return translator.translate(agreement.confirmedText, sttResult.language, targetLang, context) }
        })
        translationStage = usedRevision ? 'simulmt-revised' : undefined
        if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return null
        this.deps.contextBuffer.add(agreement.confirmedText, translatedText)

        // Reset SimulMT session for the next speech segment
        translator.resetSimulMtSession?.()
      } else if (!nonverbal && translator && agreement.confirmedText.trim()) {
        const preparation = this.preparation
        const matches = !sourceContext && preparation && preparation.text === agreement.confirmedText &&
          preparation.from === sttResult.language && preparation.to === targetLang &&
          preparation.translator === translator && preparation.glossary === JSON.stringify(glossaryEntries) &&
          this.deps.canReuseInterimTranslation?.() !== false
        if (!matches) { preparation?.controller.abort(); this.preparation = undefined }
        const candidate = matches ? await preparation.completion : ''
        if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return null
        translatedText = candidate || ((!sourceContext && this.deps.canReuseInterimTranslation?.() !== false && this.lastTranslatedSource === agreement.confirmedText && this.lastTranslatedConfirmed)
          ? this.lastTranslatedConfirmed
          : this.deps.translateFinal ? await this.deps.translateFinal(agreement.confirmedText, sttResult.language, targetLang, sttResult.confidence, sourceContext) : await translator.translate(
          agreement.confirmedText,
          sttResult.language,
          targetLang,
          { ...this.deps.contextBuffer.getContext(glossary), ...(sourceContext && {sourceContext}) }
        ))
        if (!this.isCurrentGeneration(gen, utterance, contextRevision)) return null
        this.deps.contextBuffer.add(agreement.confirmedText, translatedText)
      }

      this.lastTranslatedSource = ''
      this.lastTranslatedConfirmed = ''
      this.simulMtPreviousOutput = ''
      this.simulMtLastBoundaryText = ''
      this.simulMtInFlight = false
      this.clauseTranslatedPrefix = ''
      this.clauseTranslation = ''
      this.clauseTranslationInFlight = false
      this.debouncedTranslationInFlight = false

      const speaker = this.currentSpeaker()
      const result: TranslationResult = {
        sourceText: agreement.confirmedText,
        translatedText: this.decorateTone(agreement.confirmedText, translatedText, targetLang, tone),
        spokenText: translatedText,
        sourceLanguage: sttResult.language,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: false,
        confidence: sttResult.confidence,
        ...(translationStage && { translationStage }),
        ...(speaker && {
          speakerLabel: speaker.speakerLabel,
          speakerIndex: speaker.speakerIndex
        })
      }

      if (process.env.VOCALUME_CAPTION_TIMING === '1') {
        log.info(`Caption timing: final audio to source ${Math.round(sourceReadyAt - finalStartedAt)}ms, source to translation ${Math.round(performance.now() - sourceReadyAt)}ms`)
      }
      this.deps.emitter.emit('result', result)

      // Fire-and-forget GER correction on finalized result (async, non-blocking)
      const ger = nonverbal ? null : this.deps.getGER?.()
      if (ger) {
        ger.maybeCorrect(
          agreement.confirmedText,
          sttResult.confidence,
          sttResult.language,
          targetLang,
          result.timestamp,
          translatedText || undefined
        )
      }

      this.resetUtterance()
      return result
    } catch (err) {
      if (this.isCurrentGeneration(gen, utterance, contextRevision)) {
        this.deps.agreement.reset()
        this.resetUtterance()
        this.deps.emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
      return null
    } finally {
      this.streamingLock = false
      this.deps.decrementProcessing()
      for (const r of this.streamingLockResolvers) r()
      this.streamingLockResolvers = []
    }
  }

  /**
   * Handle SimulMT streaming translation (#550).
   *
   * Instead of debouncing for 1s, translates at clause/phrase boundaries
   * detected by the ClauseBoundaryDetector. Uses translateSimulMt() which
   * maintains a persistent KV cache session for lower latency.
   *
   * Translation triggers:
   * 1. New clause boundary detected (particle-based for JA, whitespace for EN)
   * 2. Enough units accumulated beyond waitK threshold
   * 3. Source text changed since last boundary translation
   */
  private handleSimulMtStreaming(
    fullSourceText: string,
    sourceLang: Language,
    targetLang: Language,
    confirmedText: string,
    interimText: string,
    waitK: number,
    translationDirectionRevision: number
  ): void {
    const translator = this.deps.getTranslator()
    if (!translator?.translateSimulMt || !fullSourceText.trim() || sourceLang === targetLang ||
        !this.isCurrentTranslationDirection(translationDirectionRevision)) return

    // Retain the newest revision while translation is busy. Dropping it here
    // leaves a long Japanese hypothesis visible with no Chinese until another
    // recognition window happens to arrive.
    if (this.simulMtInFlight) {
      this.simulMtPending = () => this.handleSimulMtStreaming(
        fullSourceText, sourceLang, targetLang, confirmedText, interimText, waitK, translationDirectionRevision
      )
      return
    }

    // Check if we have enough units to start translating (wait-k policy)
    const unitCount = countUnits(fullSourceText, sourceLang)
    if (unitCount < waitK) return

    // Detect clause boundary in the source text
    const boundary = detectClauseBoundary(fullSourceText, sourceLang)
    const textToTranslate = boundary ? boundary.stablePrefix : fullSourceText

    // Skip if we already translated this exact boundary text
    if (textToTranslate === this.simulMtLastBoundaryText) return

    this.simulMtLastBoundaryText = textToTranslate
    this.simulMtInFlight = true
    this.simulMtPending = null

    const gen = this.deps.getGeneration?.()
    const contextRevision = this.recognitionContextRevision
    const utterance = this.utteranceGeneration
    const glossaryEntries = this.deps.getGlossary()
    const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined

    translator.translateSimulMt(
      textToTranslate,
      this.simulMtPreviousOutput,
      sourceLang,
      targetLang,
      false, // not a revision — incremental
      this.deps.contextBuffer.getContext(glossary)
    ).then((translated) => {
      if (!this.isCurrentTranslationDirection(translationDirectionRevision) ||
          !this.isCurrentGeneration(gen, utterance, contextRevision)) return

      this.simulMtPreviousOutput = translated
      this.lastTranslatedConfirmed = translated

      const simulMtResult: TranslationResult = {
        sourceText: fullSourceText,
        confirmedText,
        interimText,
        translatedText: translated,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true,
        translationStage: 'simulmt-partial'
      }

      this.deps.emitter.emit('interim-result', simulMtResult)
    }).catch((err) => {
      if (this.isCurrentTranslationDirection(translationDirectionRevision)) log.warn('SimulMT translation failed:', err)
    }).finally(() => {
      if (this.isCurrentGeneration(gen, utterance, contextRevision)) {
        this.simulMtInFlight = false
        if (this.simulMtResetPending) {
          this.simulMtResetPending = false
          this.simulMtPreviousOutput = ''
          this.simulMtLastBoundaryText = ''
          this.deps.getTranslator()?.resetSimulMtSession?.()
        }
        const pending = this.simulMtPending
        this.simulMtPending = null
        pending?.()
      }
    })
  }

  /**
   * Run draft STT (Moonshine Tiny JA) in parallel with primary STT.
   * Emits result as 'draft-stt-result' immediately for fast interim display (#536).
   * Fire-and-forget — errors are logged but do not affect primary pipeline.
   */
  private runDraftStt(draftEngine: STTEngine, audioBuffer: Float32Array, sampleRate: number, revision: number): void {
    if (this.draftSttInFlight) return
    this.draftSttInFlight = true
    const t0 = performance.now()
    const gen = this.deps.getGeneration?.()
    const contextRevision = this.recognitionContextRevision
    const utterance = this.utteranceGeneration
    draftEngine.processAudio(audioBuffer, sampleRate)
      .then((draftResult) => {
        const draftMs = (performance.now() - t0).toFixed(0)
        if (!draftResult || !draftResult.text.trim()) {
          log.info(`Draft STT: ${draftMs}ms → (no result)`)
          return
        }
        log.info(`Draft STT: ${draftMs}ms → "${draftResult.text}" [${draftResult.language}]`)

        if (!this.isCurrentGeneration(gen, utterance, contextRevision) || revision <= this.primaryRevision) return

        const targetLang = this.deps.resolveTargetLanguage(draftResult.language)

        const draftTranslationResult: TranslationResult = {
          sourceText: draftResult.text,
          translatedText: '', // Draft STT only provides source text — no translation yet
          sourceLanguage: draftResult.language,
          targetLanguage: targetLang,
          timestamp: Date.now(),
          isInterim: true
        }

        this.deps.emitter.emit('draft-stt-result', draftTranslationResult)
      })
      .catch((err) => {
        log.warn('Draft STT error (non-fatal):', err instanceof Error ? err.message : err)
      }).finally(() => { this.draftSttInFlight = false })
  }

  /**
   * Run speaker diarization in parallel with primary STT (#549).
   * Fire-and-forget — errors are logged but do not affect primary pipeline.
   * Updates lastDiarizationResult for the next emit cycle.
   */
  private runDiarization(diarizer: SpeakerDiarizer, audioBuffer: Float32Array, sampleRate: number): void {
    const t0 = performance.now()
    diarizer.processAudio(audioBuffer, sampleRate)
      .then((result) => {
        const diarizeMs = (performance.now() - t0).toFixed(0)
        if (!result) {
          log.info(`Diarization: ${diarizeMs}ms → (no speaker)`)
          return
        }
        log.info(`Diarization: ${diarizeMs}ms → ${result.speakerLabel} (confidence: ${result.confidence.toFixed(2)})`)
        this.lastDiarizationResult = result
      })
      .catch((err) => {
        log.warn('Diarization error (non-fatal):', err instanceof Error ? err.message : err)
      })
  }

  /**
   * Run clause-level overlap translation when new confirmed text arrives (#615).
   *
   * Detects a clause boundary in the confirmed text and translates up to that
   * boundary immediately (fire-and-forget), without waiting for the debounce timer.
   * This overlaps translation with the next STT chunk, reducing end-to-end latency.
   *
   * Uses SSBD when a previous clause translation exists to avoid re-translating
   * the already-translated prefix.
   */
  private runClauseTranslation(
    confirmedText: string,
    fullSourceText: string,
    sourceLang: Language,
    targetLang: Language,
    translationDirectionRevision: number
  ): void {
    const translator = this.deps.getTranslator()
    if (!translator || !confirmedText.trim() || sourceLang === targetLang ||
        !this.isCurrentTranslationDirection(translationDirectionRevision)) return

    // Skip if already translating a clause or nothing new to translate
    if (this.finalQueue.pending || this.clauseTranslationInFlight || this.debouncedTranslationInFlight) return
    if (confirmedText === this.clauseTranslatedPrefix) return

    // Detect clause boundary in confirmed text
    const boundary = detectTranslationBoundary(confirmedText, sourceLang)
    if (!boundary) return

    const textToTranslate = boundary.stablePrefix

    // Skip if this boundary was already translated
    if (textToTranslate === this.clauseTranslatedPrefix) return

    // Confirmation can trail a successful full-hypothesis translation. Do not
    // spend another decode replacing it with a shorter prefix. Only reuse it
    // while it still matches the current hypothesis; corrections must translate.
    if (this.lastTranslatedConfirmed &&
        this.samePrefix(textToTranslate, this.lastTranslatedSource) &&
        this.samePrefix(this.lastTranslatedSource, fullSourceText)) return

    this.clauseTranslationInFlight = true

    const gen = this.deps.getGeneration?.()
    const contextRevision = this.recognitionContextRevision
    const utterance = this.utteranceGeneration
    const glossaryEntries = this.deps.getGlossary()
    const glossary = glossaryEntries.length > 0 ? glossaryEntries : undefined
    // Keep glossary hints without leaking previous sentences into a partial draft.
    const ctx = { glossary, previousSegments: [], signal: this.interimAbort.signal }

    const t0 = performance.now()

    // Use SSBD if we have a previous clause translation to build on (#607)
    const translatePromise = (translator.translateSSBD && this.clauseTranslation)
      ? translator.translateSSBD(
          textToTranslate,
          this.clauseTranslation,
          sourceLang,
          targetLang,
          ctx
        ).catch((ssbdErr) => {
          if (ctx.signal.aborted || /Translation (timed out|exceeded its output limit|cancelled)/.test(String(ssbdErr))) throw ssbdErr
          log.warn('SSBD clause translation failed, falling back:', ssbdErr)
          return translator.translate(textToTranslate, sourceLang, targetLang, ctx)
        })
      : translator.translate(textToTranslate, sourceLang, targetLang, ctx)

    translatePromise.then((translated) => {
      const clauseMs = (performance.now() - t0).toFixed(0)
      log.info(`Clause translation: ${clauseMs}ms → "${translated}" (prefix: "${textToTranslate}")`)

      if (!this.isCurrentTranslationDirection(translationDirectionRevision) ||
          !this.isCurrentGeneration(gen, utterance, contextRevision) || !this.samePrefix(fullSourceText, this.lastSourceTextForTranslate)) return

      this.clauseTranslatedPrefix = textToTranslate
      this.clauseTranslation = translated
      this.lastTranslatedSource = textToTranslate
      this.lastTranslatedConfirmed = translated

      const clauseResult: TranslationResult = {
        sourceText: this.lastSourceTextForTranslate,
        translatedText: translated,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        timestamp: Date.now(),
        isInterim: true
      }
      this.deps.emitter.emit('interim-result', clauseResult)
    }).catch((err) => {
      if (this.isCurrentTranslationDirection(translationDirectionRevision)) {
        log.warn('Clause translation error (non-fatal):', err instanceof Error ? err.message : err)
      }
    }).finally(() => {
      if (this.isCurrentTranslationDirection(translationDirectionRevision) && this.isCurrentGeneration(gen, utterance, contextRevision)) {
        this.clauseTranslationInFlight = false
        this.drainPendingTranslation()
      }
    })
  }

  /**
   * Wait for the streaming lock to be released with a timeout and backpressure cap.
   * If more than MAX_STREAMING_LOCK_RESOLVERS are already waiting, the oldest
   * resolvers are auto-resolved to prevent unbounded growth (#292, #431).
   */
  private waitForStreamingLock(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Evict oldest waiters when the queue is full to prevent unbounded growth (#431)
      if (this.streamingLockResolvers.length >= MAX_STREAMING_LOCK_RESOLVERS) {
        const evictCount = this.streamingLockResolvers.length - MAX_STREAMING_LOCK_RESOLVERS + 1
        log.warn(
          `streamingLock resolver queue overflow: evicting ${evictCount} oldest resolver(s) (queue size: ${this.streamingLockResolvers.length})`
        )
        for (let i = 0; i < evictCount; i++) {
          const oldest = this.streamingLockResolvers.shift()
          if (oldest) oldest()
        }
      }

      // Auto-resolve after timeout so callers never hang indefinitely
      const timer = setTimeout(() => {
        const idx = this.streamingLockResolvers.indexOf(release)
        if (idx !== -1) {
          this.streamingLockResolvers.splice(idx, 1)
          log.warn('streamingLock wait timed out')
          resolve()
        }
      }, STREAMING_LOCK_TIMEOUT_MS)

      const release = (): void => {
        clearTimeout(timer)
        resolve()
      }
      this.streamingLockResolvers.push(release)
    })
  }

  /**
   * Count words in text. For CJK text (Japanese/Chinese/Korean), count characters
   * since there are no space-delimited word boundaries.
   */
  private countWords(text: string, language: Language): number {
    if (language === 'ja' || language === 'zh') {
      return text.replace(/\s/g, '').length
    }
    if (language === 'ko') {
      return text.replace(/\s/g, '').length
    }
    return text.trim().split(/\s+/).filter(Boolean).length
  }
}
