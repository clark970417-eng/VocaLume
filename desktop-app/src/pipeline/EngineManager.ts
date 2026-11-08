import type {
  EngineConfig,
  STTEngine,
  TranslatorEngine,
  E2ETranslationEngine,
  SpeakerDiarizer
} from '../engines/types'
import { HybridTranslator } from '../engines/translator/HybridTranslator'
import type { EventEmitter } from 'events'
import { createLogger } from '../main/logger'

const log = createLogger('pipeline')

const ENGINE_INIT_TIMEOUT_MS = 5 * 60_000 // 5 minutes for model download
type EngineLifecycle = { initialize(): Promise<void>; dispose(): Promise<void> }

async function disposeEngine(engine: EngineLifecycle | null): Promise<void> {
  try {
    await engine?.dispose()
  } catch (err) {
    log.warn('Error during engine disposal:', err)
  }
}

/** Optional engines never block the primary engine's startup or its first cue. */
class OptionalEngine<T extends EngineLifecycle> {
  private current?: T
  private attempted = false
  private ready = false
  private retirement?: Promise<void>

  get(create: () => T, initialize: (engine: T) => Promise<void>, onError: (error: unknown) => void): T | null {
    if (this.ready) return this.current ?? null
    if (this.attempted || this.retirement) return null
    this.attempted = true
    try {
      const engine = this.current = create()
      void Promise.resolve().then(() => {
        if (this.current === engine) return initialize(engine)
      }).then(() => {
        if (this.current === engine) this.ready = true
      }).catch(async (error: unknown) => {
        if (this.current !== engine) return
        this.current = undefined
        this.retirement = disposeEngine(engine).finally(() => { this.retirement = undefined })
        onError(error)
        await this.retirement
      })
    } catch (error) {
      onError(error)
    }
    return null
  }

  release(afterUse: Promise<void>): Promise<void> {
    const engine = this.current
    this.current = undefined
    this.attempted = false
    this.ready = false
    if (this.retirement || !engine) return this.retirement ?? Promise.resolve()
    this.retirement = afterUse.then(() => disposeEngine(engine)).finally(() => { this.retirement = undefined })
    return this.retirement
  }
}

/**
 * Manages engine registration, creation, initialization, and disposal.
 * Extracted from TranslationPipeline to separate engine lifecycle from pipeline orchestration.
 */
export class EngineManager {
  private sttFactories = new Map<string, () => STTEngine>()
  private translatorFactories = new Map<string, () => TranslatorEngine>()
  private e2eFactories = new Map<string, () => E2ETranslationEngine>()
  private diarizerFactories = new Map<string, () => SpeakerDiarizer>()

  sttEngine: STTEngine | null = null
  translator: TranslatorEngine | null = null
  e2eEngine: E2ETranslationEngine | null = null
  private readonly draftStt = new OptionalEngine<STTEngine>()
  /** Secondary quality translator for adaptive routing (#547) */
  qualityTranslator: TranslatorEngine | null = null
  /** Speaker diarizer for multi-speaker identification (#549) */
  private readonly diarizer = new OptionalEngine<SpeakerDiarizer>()
  config: EngineConfig | null = null

  registerSTT(id: string, factory: () => STTEngine): void {
    this.sttFactories.set(id, factory)
  }

  registerTranslator(id: string, factory: () => TranslatorEngine): void {
    this.translatorFactories.set(id, factory)
  }

  registerE2E(id: string, factory: () => E2ETranslationEngine): void {
    this.e2eFactories.set(id, factory)
  }

  registerDiarizer(id: string, factory: () => SpeakerDiarizer): void {
    this.diarizerFactories.set(id, factory)
  }

  /**
   * Initialize engines for the given configuration.
   * Emits 'engine-loading' status updates via the provided emitter.
   */
  async initializeEngines(config: EngineConfig, emitter: EventEmitter): Promise<void> {
    this.config = config

    if (config.mode === 'cascade') {
      const sttId = config.sttEngineId
      const translatorId = config.translatorEngineId
      if (!sttId || !translatorId) {
        throw new Error('cascade mode requires sttEngineId and translatorEngineId')
      }

      const sttFactory = this.sttFactories.get(sttId)
      const translatorFactory = this.translatorFactories.get(translatorId)
      if (!sttFactory) throw new Error(`STT engine not found: ${sttId}`)
      if (!translatorFactory) throw new Error(`Translator engine not found: ${translatorId}`)

      try {
        emitter.emit('engine-loading', 'Loading STT model...')
        this.sttEngine = await Promise.resolve(sttFactory())
        await this.withTimeout(this.sttEngine.initialize(), ENGINE_INIT_TIMEOUT_MS, 'STT initialization')

        emitter.emit('engine-loading', 'Initializing translator...')
        this.translator = await Promise.resolve(translatorFactory())
        await this.withTimeout(this.translator.initialize(), ENGINE_INIT_TIMEOUT_MS, 'Translator initialization')

        // Wire up draft callback for hybrid translator (#235)
        if (this.translator instanceof HybridTranslator) {
          this.translator.setOnDraft((draft) => {
            emitter.emit('draft-result', draft)
          })
        }
      } catch (err) {
        await this.disposeEngines()
        throw err
      }
    } else if (config.mode === 'e2e') {
      const e2eId = config.e2eEngineId
      if (!e2eId) throw new Error('e2e mode requires e2eEngineId')

      const e2eFactory = this.e2eFactories.get(e2eId)
      if (!e2eFactory) throw new Error(`E2E engine not found: ${e2eId}`)

      emitter.emit('engine-loading', 'Loading translation model...')
      this.e2eEngine = await Promise.resolve(e2eFactory())
      await this.withTimeout(this.e2eEngine.initialize(), ENGINE_INIT_TIMEOUT_MS, 'E2E engine initialization')
    }
  }

  /**
   * Initialize a secondary quality translator for adaptive routing (#547).
   * Called separately from initializeEngines since it's optional.
   */
  async initQualityTranslator(engineId: string, emitter: EventEmitter): Promise<void> {
    const factory = this.translatorFactories.get(engineId)
    if (!factory) throw new Error(`Quality translator engine not found: ${engineId}`)

    emitter.emit('engine-loading', 'Loading quality translation model for adaptive routing...')
    this.qualityTranslator = await Promise.resolve(factory())
    await this.withTimeout(this.qualityTranslator.initialize(), ENGINE_INIT_TIMEOUT_MS, 'Quality translator initialization')
    log.info(`Quality translator initialized: ${engineId}`)
  }

  getDraftStt(engineId: string): STTEngine | null {
    return this.draftStt.get(() => {
      const factory = this.sttFactories.get(engineId)
      if (!factory) throw new Error(`Draft STT engine not found: ${engineId}`)
      return factory()
    }, engine => this.withTimeout(engine.initialize(), ENGINE_INIT_TIMEOUT_MS, 'Draft STT initialization'),
    error => log.warn('Draft STT initialization failed (non-fatal):', error))
  }

  getDiarizer(engineId: string): SpeakerDiarizer | null {
    return this.diarizer.get(() => {
      const factory = this.diarizerFactories.get(engineId)
      if (!factory) throw new Error(`Diarizer engine not found: ${engineId}`)
      return factory()
    }, engine => this.withTimeout(engine.initialize(), ENGINE_INIT_TIMEOUT_MS, 'Diarizer initialization'),
    error => log.warn('Speaker diarization initialization failed (non-fatal):', error))
  }

  async releaseOptionalEngines(afterUse = Promise.resolve()): Promise<void> {
    await Promise.all([this.draftStt.release(afterUse), this.diarizer.release(afterUse)])
  }

  /** Dispose all active engines and clear references */
  async disposeEngines(): Promise<void> {
    const optionalDisposal = this.releaseOptionalEngines()
    const engines = [
      this.sttEngine, this.translator, this.e2eEngine, this.qualityTranslator
    ]
    this.sttEngine = null
    this.translator = null
    this.e2eEngine = null
    this.qualityTranslator = null

    for (const engine of engines) await disposeEngine(engine)
    await optionalDisposal
  }

  /** Clear config reference (used on initialization failure) */
  clearConfig(): void {
    this.config = null
  }

  /** Run a promise with a timeout */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    })
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
  }
}
