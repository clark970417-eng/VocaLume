import { performanceState, subscribePerformanceState } from './performance-state'
import { liveWork } from './live-work'
import { isSpeechToneMode } from '../pipeline/SpeechTone'
/** Private local adapter for the existing browser UI; uses the production pipeline. */
import { createServer, type Server, type Socket } from 'net'
import { mkdirSync, chmodSync, existsSync, unlinkSync, writeFileSync } from 'fs'
import { endianness, homedir } from 'os'
import { join, posix } from 'path'
import { createHash } from 'crypto'
import { ALL_LANGUAGES, type Language, type TranslationResult, type TranslatorEngine } from '../engines/types'
import { store } from './store'
import { startPipeline, type PipelineStartConfig } from './ipc/pipeline-ipc'
import { buildEngineConfig, resolveEngineMode } from '../engine-selection'
import type { EngineMode, SttEngineType } from '../engine-selection'
import type { AppContext } from './app-context'
import { HunyuanMT2Translator } from '../engines/translator/HunyuanMT2Translator'
import { HunyuanMT15Translator } from '../engines/translator/HunyuanMT15Translator'
import { translateWrittenDraft } from './draft-fidelity'
import { selectDraftTerminology } from './draft-glossary'
import { CompanionScheduler } from './companion-scheduler'
import { speechEvidenceFor } from '../engines/stt/transcript-guard'
import type { SpeechEvidence } from '../engines/types'
import { getUiLanguageChoice, onUiLanguageChoiceChanged, updateUiLanguageChoice } from './interface-language'
import { createLogger } from './logger'

const log = createLogger('browser-companion')
const LITTLE_ENDIAN = endianness() === 'LE'

/** How long a new browser connection waits for the current one to close before
 * it is treated as a second client and refused. */
const OWNER_RELEASE_GRACE_MS = 2000

/** Windows requires a named pipe; Unix systems use a protected domain socket. */
export function companionEndpoint(directory: string, platform = process.platform, languageOnly = false): string {
  if (platform !== 'win32') {
    // Use the target platform's separator when tests or packaging tools resolve
    // an endpoint for another operating system.
    const file = languageOnly ? 'ui.sock' : 'desktop.sock'
    return platform === process.platform ? join(directory, file) : posix.join(directory.replaceAll('\\', '/'), file)
  }
  const id = createHash('sha256').update(directory).digest('hex').slice(0, 20)
  return `\\\\.\\pipe\\japanese-live-caption-${id}${languageOnly ? '-ui-language' : ''}`
}

async function listenPrivate(server: Server, path: string): Promise<void> {
  if (process.platform !== 'win32' && existsSync(path)) unlinkSync(path)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      if (process.platform !== 'win32') chmodSync(path, 0o600)
      resolve()
    })
  })
}

/** Separate this connection from the single inference owner. A browser can
 * watch the interface language without loading models or blocking capture. */
async function startLanguageCompanion(directory: string, inferenceServer: Server): Promise<void> {
  const sockets = new Set<Socket>()
  const server = createServer(socket => {
    if (sockets.size >= 16) { socket.destroy(); return }
    sockets.add(socket)
    socket.setEncoding('utf8')
    let buffer = ''
    let unsubscribe: (() => void) | undefined
    const send = (message: unknown): void => {
      if (!socket.destroyed && !socket.write(JSON.stringify(message) + '\n')) socket.destroy()
    }
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (buffer.length > 8192) { socket.destroy(); return }
      while (!socket.destroyed) {
        const newline = buffer.indexOf('\n')
        if (newline === -1) break
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        let message: { id?: number; op?: string; choice?: unknown } | undefined
        try { message = JSON.parse(line) } catch { /* Invalid frames are rejected below. */ }
        if (!message || !Number.isSafeInteger(message.id)) { socket.destroy(); return }
        try {
          if (message.op === 'watch-ui-language') {
            send({ id: message.id, ok: true, result: getUiLanguageChoice() })
            unsubscribe ??= onUiLanguageChoiceChanged(choice => send({ event: 'ui-language', result: choice }))
          } else if (message.op === 'set-ui-language' && unsubscribe) {
            send({ id: message.id, ok: true, result: updateUiLanguageChoice(message.choice) })
          } else {
            send({ id: message.id, ok: false, error: 'Unsupported language operation' })
          }
        } catch (error) {
          send({ id: message.id, ok: false, error: error instanceof Error ? error.message : 'Invalid interface language choice' })
        }
      }
    })
    socket.on('error', () => socket.destroy())
    socket.once('close', () => { unsubscribe?.(); sockets.delete(socket) })
  })
  await listenPrivate(server, companionEndpoint(directory, process.platform, true))
  inferenceServer.once('close', () => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
}

export async function startExtensionCompanion(ctx: AppContext, directory?: string): Promise<Server> {
  const dir = directory || join(homedir(), 'Library/Application Support/JapaneseLiveCaption')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(dir, 0o700)
  // Refresh the native launch path after installation, rename or upgrade.
  if (process.platform === 'darwin' && process.execPath.includes('.app/Contents/MacOS/')) {
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ executable: process.execPath }), { mode: 0o600 })
  }
  const path = companionEndpoint(dir)
  let owned = false
  /** The previous connection's teardown. A client reconnecting after the old
   * socket closed is accepted at once, but starts no work until the session it
   * replaces has stopped. Refusing it instead would spend the browser's only
   * recovery attempt while that teardown was still running. */
  let teardown: Promise<void> = Promise.resolve()
  /** Connections waiting for the current owner to close. */
  const waiting: Array<() => void> = []
  const server = createServer(socket => {
    if (!owned) { serve(socket); return }
    // The owner may be a connection whose close has not been processed yet, such
    // as a browser host that died and was restarted immediately. Adopt this
    // client if the owner releases within the grace period; otherwise it is a
    // genuine second client and is refused.
    const adopt = (): void => { clearTimeout(refuse); if (!socket.destroyed) serve(socket) }
    const refuse = setTimeout(() => {
      const index = waiting.indexOf(adopt)
      if (index >= 0) waiting.splice(index, 1)
      socket.end()
    }, OWNER_RELEASE_GRACE_MS)
    waiting.push(adopt)
  })
  const work = liveWork(ctx)
  function serve(socket: Socket): void {
    owned = true
    const previousTeardown = teardown
    let ownsSession = false
    socket.setEncoding('utf8')
    let buffer = '', pending = 0, closed = false
    const queue = new CompanionScheduler()
    let translator: HunyuanMT2Translator | HunyuanMT15Translator | undefined
    let translatorMode: string | undefined
    let translatorIdle: ReturnType<typeof setTimeout> | undefined
    const send = (value: unknown): void => { if (!closed) socket.write(JSON.stringify(value) + '\n') }
    const unsubscribePerformance = subscribePerformanceState(state => {
      if (ownsSession) send({ event: 'performance', result: state })
      if (state.speculativeTranslationPaused && translator) scheduleTranslatorRelease(0)
    })
    type LocalMode = 'offline-hymt2' | 'offline-hymt15'
    const modeOf = (value: unknown): LocalMode => value === 'offline-hymt2' ? 'offline-hymt2' : 'offline-hymt15'
    const translatorFor = async (mode: LocalMode): Promise<HunyuanMT2Translator | HunyuanMT15Translator> => {
      if (!translator || translatorMode !== mode) {
        await translator?.dispose()
        translator = mode === 'offline-hymt2' ? new HunyuanMT2Translator({ variant: '7B-Q4_K_M' }) : new HunyuanMT15Translator()
        translatorMode = mode
      }
      return translator
    }
    const discardTranslator = async (): Promise<void> => {
      clearTimeout(translatorIdle)
      translatorIdle = undefined
      const stale = translator
      translator = undefined; translatorMode = undefined
      try { await stale?.dispose() } catch { /* its worker is already gone */ }
    }
    function scheduleTranslatorRelease(delay = 30_000): void {
      clearTimeout(translatorIdle)
      if (!translator || closed) return
      const expected = translator
      translatorIdle = setTimeout(() => {
        void work.run('background', async () => {
          if (!closed && translator === expected) await discardTranslator()
        }).catch(() => {})
      }, delay)
      translatorIdle.unref()
    }
    const translatorForText = async (mode: LocalMode): Promise<TranslatorEngine> => {
      const pipeline = ctx.pipeline
      const shared = mode === 'offline-hymt15' ? pipeline?.getTranslatorForBackgroundText?.() : null
      if (shared) return shared
      if (pipeline?.active && pipeline.currentConfig?.translatorEngineId === 'hunyuan-mt-15') {
        throw new Error('Pause live captions to translate text while simultaneous translation is enabled.')
      }
      const engine = await translatorFor(mode)
      await engine.initialize()
      return engine
    }
    /** Terminology is chosen from the whole comment, so a clause retranslated
     * during repair keeps the meaning the full sentence established. */
    const draftWith = (engine: TranslatorEngine, comment: string, writingStyle?: 'general' | 'viewer' | 'polite') => {
      const glossary = selectDraftTerminology(comment)
      return (text: string, signal?: AbortSignal): Promise<string> =>
        engine.translate(text, 'zh', 'ja', { signal, previousSegments: [], glossary, writingStyle })
    }
    /** Answer a draft request later, on the caption model, behind any audio work
     * already queued. Scheduled as its own task: awaiting it from inside the
     * current task would deadlock the serial scheduler. */
    const deferDraft = (id: number | undefined, text: string, mode: LocalMode, writingStyle?: 'general' | 'viewer' | 'polite'): void => {
      pending++
      void queue.run(false, localPreempt => work.run('background', async globalPreempt => {
        const fallbackPreempt = AbortSignal.any([localPreempt, globalPreempt])
        try {
          if (closed) return
          const small = await translatorForText(mode)
          const draft = await translateWrittenDraft(text, draftWith(small, text, writingStyle), fallbackPreempt)
          send({ id, ok: true, result: { ...draft, fallbackModel: true } })
        } catch (error) {
          send({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
        } finally { pending--; scheduleTranslatorRelease() }
      }, work.hasDetachedFinals ? localPreempt : undefined)).catch(error => {
        pending--
        send({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
      })
    }
    let current: { segment?: string; id?: number } = {}
    let lastAudio: Float32Array | null = null
    /** The speech evidence that arrived with `lastAudio`. Always assigned and
     * cleared together with it, so a finalized segment is judged only by what
     * the browser measured for that segment. */
    let lastEvidence: SpeechEvidence | undefined
    const revisions = new Map<number, string>()
    /** What the browser would show for each segment, without the timestamp. The
     * pipeline can emit one result twice within milliseconds; repeating it for
     * the same segment changes nothing on screen. The same words in another
     * segment are a new caption and are always sent. */
    const lastShown = new Map<string, string>()
    const captionFor = (segment: string | undefined, r: TranslationResult): void => {
      if (!segment) return
      // Recorded before the repeat check: a later correction may name this timestamp.
      revisions.set(r.timestamp, segment)
      if (revisions.size > 100) revisions.delete(revisions.keys().next().value!)
      const result = { text: r.sourceText, translated: r.translatedText, targetLanguage: r.targetLanguage, speakerLabel: r.speakerLabel, speakerIndex: r.speakerIndex, interim: !!r.isInterim, final: !r.isInterim }
      const shown = JSON.stringify(result)
      if (lastShown.get(segment) === shown) return
      lastShown.delete(segment)
      lastShown.set(segment, shown)
      if (lastShown.size > 100) lastShown.delete(lastShown.keys().next().value!)
      send({ event: 'caption', segment, result: { ...result, timestamp: r.timestamp } })
    }
    const caption = (r: TranslationResult): void => captionFor(current.segment, r)
    // Bound accepted translation work. Backpressure keeps audio in the browser queue.
    const finals = new Set<Promise<void>>()
    const drainFinals = async (): Promise<void> => { await Promise.all(finals) }
    const prepareFinal = async (audio: Float32Array, segment: string, evidence: SpeechEvidence | undefined): Promise<unknown> => {
      const pipeline = ctx.pipeline!
      if (finals.size >= 4) await Promise.race(finals)
      const prepared = await pipeline.prepareFinalStreaming(audio, 16000, evidence)
      if (!prepared) return { text: '', translated: '' }
      const sourceText = prepared.sourceText
      const completion: Promise<void> = work.trackFinal(prepared.completion).then(result => {
        if (result) captionFor(segment, result)
        else send({ event: 'caption', segment, result: { text: sourceText, translated: '', final: true, error: 'Translation did not complete' } })
      }).catch(error => {
        send({ event: 'caption', segment, result: { text: sourceText, translated: '', final: true, error: String(error) } })
      }).finally(() => { finals.delete(completion) })
      finals.add(completion)
      return { text: sourceText, translated: '', pending: true }
    }
    const correction = (r: TranslationResult): void => {
      const segment = revisions.get(r.timestamp)
      if (segment) send({ event: 'caption', segment, result: { text: r.sourceText, translated: r.translatedText, correction: true, timestamp: r.timestamp } })
    }
    ctx.pipeline?.on('interim-result', caption)
    ctx.pipeline?.on('draft-stt-result', caption)
    ctx.pipeline?.on('ger-corrected', correction)
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (buffer.length > 2_000_000) { socket.destroy(); return }
      for (;;) {
        const newline = buffer.indexOf('\n'); if (newline < 0) break
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1)
        let m: { id?: number; op?: string; audio?: string; text?: string; direction?: string; writingStyle?: 'general' | 'viewer' | 'polite'; quality?: 'fast' | 'quality'; segment?: string; final?: boolean; speechSeconds?: unknown; speechEndSample?: unknown; captureStartSample?: unknown; captureEndSample?: unknown; continuationExpected?: unknown; sourceLanguage?: string; targetLanguage?: string; speechToneMode?: unknown }
        try { m = JSON.parse(line) } catch { send({ ok: false, error: 'Invalid request' }); continue }
        if (!m || typeof m !== 'object') { send({ ok: false, error: 'Invalid request' }); continue }
        const audioPriority = ['decode', 'init', 'stop'].includes(m.op || '')
        // Reserve capacity for audio/control; excess page text must not disconnect capture.
        if (pending >= (audioPriority ? 16 : 12)) {
          send({ id: m.id, ok: false, error: 'Desktop queue is full; please retry' }); continue
        }
        if (ownsSession && m.op === 'decode' && m.final === true) {
          const ending = typeof m.speechEndSample === 'number' && typeof m.speechSeconds === 'number'
            ? { segment: m.segment, speechEndSample: m.speechEndSample, speechSeconds: m.speechSeconds }
            : undefined
          ctx.pipeline?.interruptStreamingPreview?.(ending)
        }
        pending++
        const priority = m.op === 'translate' ? 'background'
          : m.op === 'decode' && !m.final && !!m.segment ? 'preview' : 'final'
        void queue.run(audioPriority, async localPreempt => {
          // Wait before reserving the shared slot: prior teardown may still
          // need that slot to finish draining its accepted messages.
          await previousTeardown
          const operate = async (globalPreempt: AbortSignal): Promise<void> => {
            const preempt = AbortSignal.any([localPreempt, globalPreempt])
            let deferred = false
            try {
              if (closed) return
              const pipeline = ctx.pipeline
              if (!pipeline) throw new Error('Desktop pipeline not ready')
              let result: unknown
              if (m.op === 'status') {
                // Read-only health information: do not create a renderer just to
                // inspect whether background translation owns desktop windows.
                result = { desktopUI: !!ctx.mainWindow, desktopOverlay: !!ctx.subtitleWindow, captureActive: pipeline.active }
              } else if (m.op === 'settings') {
                if (ctx.openSettings) ctx.openSettings()
                else { ctx.mainWindow?.show(); ctx.mainWindow?.focus() }
                result = { opened: true }
              } else if (m.op === 'stop') {
                if (ownsSession && lastAudio) { const result = await pipeline.finalizeStreaming(lastAudio, 16000, lastEvidence); if (result) caption(result) }
                lastAudio = null; lastEvidence = undefined
                if (ownsSession) { await drainFinals(); await pipeline.stop(); ctx.logger?.endSession(); ctx.logger = null }
                ownsSession = false; ctx.extensionConnected = false; current = {}; revisions.clear(); lastShown.clear()
                result = { stopped: true }
              } else if (m.op === 'init') {
                if (pipeline.active && !ownsSession) throw new Error('Stop desktop audio capture before starting browser capture.')
                if (m.speechToneMode !== undefined) {
                  if (!isSpeechToneMode(m.speechToneMode)) throw new Error('Invalid speech tone setting')
                  store.set('speechToneMode', m.speechToneMode)
                  pipeline.setSpeechToneMode(m.speechToneMode)
                }
                const supported = new Set(['ja','en','zh','ko','fr','de','es','pt','ru','it','nl','pl','ar','th','vi','id'])
                if (m.sourceLanguage && m.targetLanguage) {
                  if (!supported.has(m.sourceLanguage) || !supported.has(m.targetLanguage) || m.sourceLanguage === m.targetLanguage) throw new Error('Invalid language pair')
                  store.set('sourceLanguage', m.sourceLanguage as Language)
                  store.set('targetLanguage', m.targetLanguage as Language)
                }
                // MLX only exists on Apple Silicon. A copied profile or the old
                // platform-agnostic default must still start on Intel Mac,
                // Windows and Linux instead of selecting an unregistered engine.
                if (!(process.platform === 'darwin' && process.arch === 'arm64') && store.get('sttEngine') === 'mlx-whisper') {
                  store.set('sttEngine', 'whisper-local')
                }
                ownsSession = true; ctx.extensionConnected = true
                ctx.subtitleWindow?.hide()
                if (!pipeline.active) {
                  const keys = { apiKey: store.get('googleApiKey'), deeplApiKey: store.get('deeplApiKey'),
                    geminiApiKey: store.get('geminiApiKey'), microsoftApiKey: store.get('microsoftApiKey'),
                    microsoftRegion: store.get('microsoftRegion') }
                  const mode = resolveEngineMode(store.get('translationEngine') as EngineMode, keys, null, process.platform)
                  const selectedStt = store.get('sttEngine') as SttEngineType
                  const config = buildEngineConfig(mode, selectedStt, keys) as unknown as PipelineStartConfig
                  const started = await startPipeline(ctx, config)
                  if ('error' in started) throw new Error(started.error)
                }
                result = { model: `${pipeline.currentConfig?.sttEngineId} + ${pipeline.currentConfig?.translatorEngineId}`, dtype: 'native', performance: performanceState() }
              } else if (m.op === 'decode') {
                if (!ownsSession || !pipeline.running || typeof m.audio !== 'string') throw new Error('Start desktop mode first')
                const bytes = Buffer.from(m.audio, 'base64')
                if (!bytes.length || bytes.length % 4 || bytes.length > 1280000) throw new Error('Invalid audio size')
                const sampleCount = bytes.length / Float32Array.BYTES_PER_ELEMENT
                const canView = LITTLE_ENDIAN && bytes.byteOffset % Float32Array.BYTES_PER_ELEMENT === 0
                const audio = canView
                  ? new Float32Array(bytes.buffer, bytes.byteOffset, sampleCount)
                  : new Float32Array(sampleCount)
                if (!canView) for (let i = 0; i < sampleCount; i++) audio[i] = bytes.readFloatLE(i * 4)
                if (!audio.every(Number.isFinite)) throw new Error('Invalid audio samples')
                // Optional: an older browser sends none, and invalid values count as none.
                const evidence = speechEvidenceFor(m.speechSeconds, audio.length / 16000, m)
                if (lastAudio && current.segment && current.segment !== m.segment) {
                  if (pipeline.canOverlapFinalTranslation && typeof pipeline.prepareFinalStreaming === 'function') await prepareFinal(lastAudio, current.segment, lastEvidence)
                  else { const prior = await pipeline.finalizeStreaming(lastAudio, 16000, lastEvidence); if (prior) caption(prior) }
                }
                current = { id: m.id, segment: m.segment }
                lastAudio = m.final ? null : audio
                lastEvidence = m.final ? undefined : evidence
                let original = ''
                const source = (text: string): void => { original = text; send({ id: m.id, segment: m.segment, event: 'source', text }) }
                pipeline.on('source-result', source)
                try {
                  if (m.final && m.segment && pipeline.canOverlapFinalTranslation && typeof pipeline.prepareFinalStreaming === 'function') {
                    result = await prepareFinal(audio, m.segment, evidence)
                  } else {
                    const translated = m.segment ? (m.final ? await pipeline.finalizeStreaming(audio, 16000, evidence) : await pipeline.processStreaming(audio, 16000, evidence)) : await pipeline.process(audio, 16000)
                    if (translated && m.final && m.segment) revisions.set(translated.timestamp, m.segment)
                    result = { text: translated?.sourceText || original, translated: translated?.translatedText || '', targetLanguage: translated?.targetLanguage }
                  }
                } finally { pipeline.off('source-result', source) }
              } else if (m.op === 'translate') {
                if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 3000) throw new Error('Invalid text')
                const [from, to] = (m.direction || 'ja-zh').split('-') as [Language, Language]
                if (!ALL_LANGUAGES.includes(from) || !ALL_LANGUAGES.includes(to) || from === to) throw new Error('Invalid language')
                // Drafts may use a more accurate model than the captions, but only
                // while no caption session is running. The shared worker unloads
                // one model to load another, and measuring that swap against live
                // audio put caption round trips above 20 s.
                const writingStyle = m.writingStyle === 'viewer' || m.writingStyle === 'polite' ? m.writingStyle : 'general'
                const isDraft = from === 'zh' && to === 'ja'
                const captionMode = modeOf(store.get('translationEngine'))
                // Fast drafts reuse the caption model, avoiding a cold 7B load.
                // Clients without the new option keep their saved model preference.
                const requestedMode = isDraft && m.quality !== 'fast' && !pipeline.running ? modeOf(store.get('draftTranslationEngine')) : captionMode
                // A draft on a model the captions do not use will occupy the shared
                // worker with a load that captions would otherwise have to wait for.
                const displacesCaptions = isDraft && requestedMode !== captionMode
                if (displacesCaptions && !preempt.aborted) {
                  const large = await translatorFor(requestedMode)
                  const interrupt = (): void => { large.interrupt?.('Live captions started during a large-model draft') }
                  preempt.addEventListener('abort', interrupt, { once: true })
                  try {
                    // Captions may have arrived while the previous text model was
                    // being released, before this listener existed.
                    if (preempt.aborted) interrupt()
                    await large.initialize()
                    result = await translateWrittenDraft(m.text, draftWith(large, m.text, writingStyle), preempt)
                  } catch (error) {
                    if (!preempt.aborted) throw error
                    // The large model produced nothing before captions needed the
                    // hardware. Finish this draft on the caption model after them.
                    deferDraft(m.id, m.text, captionMode, writingStyle)
                    deferred = true
                  } finally {
                    preempt.removeEventListener('abort', interrupt)
                    // An interrupted engine points at a worker that no longer exists.
                    if (preempt.aborted) await discardTranslator()
                  }
                } else {
                  const active = await translatorForText(displacesCaptions ? captionMode : requestedMode)
                  result = isDraft
                    ? await translateWrittenDraft(m.text, draftWith(active, m.text, writingStyle), preempt)
                    : { text: await active.translate(m.text, from, to, { signal: preempt, previousSegments: [] }) }
                }
              } else throw new Error('Unsupported operation')
              if (!deferred) send({ id: m.id, ok: true, result: m.op === 'decode' ? { ...(result as object), performance: performanceState() } : result })
            } catch (error) {
              if (m.op === 'init' && ownsSession) { ownsSession = false; ctx.extensionConnected = false }
              send({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) })
            }
            finally {
              pending--
              if (m.op === 'translate') scheduleTranslatorRelease()
            }
          }
          if (m.op === 'status' || m.op === 'settings' || !['translate', 'decode', 'init', 'stop'].includes(m.op || '')) {
            await operate(localPreempt)
          } else {
            try {
              await work.run(priority, operate, priority === 'background' && work.hasDetachedFinals ? localPreempt : undefined)
            } catch (error) {
              pending--
              send({ id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) })
            }
          }
        }).catch(() => { socket.destroy() })
      }
    })
    socket.on('error', () => socket.destroy())
    socket.on('close', () => {
      closed = true
      unsubscribePerformance()
      clearTimeout(translatorIdle)
      // Nobody is waiting for the active page-text work, and a reconnecting
      // client's captions wait for this queue to drain.
      queue.preemptActive(new Error('Browser disconnected'))
      ctx.pipeline?.off('draft-stt-result', caption)
      ctx.pipeline?.off('interim-result', caption); ctx.pipeline?.off('ger-corrected', correction)
      // The socket is gone, so another client may connect now; its work waits for this.
      owned = false
      teardown = queue.idle().then(async () => { try { if (ownsSession) { await ctx.pipeline?.stop(); ctx.logger?.endSession(); ctx.logger = null }; await drainFinals(); await translator?.dispose() } finally { ctx.extensionConnected = false } }).catch(() => {})
      waiting.shift()?.()
    })
  }
  await listenPrivate(server, path)
  try { await startLanguageCompanion(dir, server) }
  catch (error) { log.warn('Browser language connection unavailable:', error) }
  return server
}
