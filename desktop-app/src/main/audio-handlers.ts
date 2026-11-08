import { ipcMain } from 'electron'
import { sanitizeErrorMessage } from './error-utils'
import { createLogger } from './logger'
import { SAMPLE_RATE } from './constants'
import { MIN_AUDIO_CHUNK_SAMPLES, SILENCE_THRESHOLD } from './audio-constants'
import { getRealtimeAudioDispatcher } from './realtime-audio'
import type { AppContext } from './app-context'
import { FinalCaptionQueue } from '../pipeline/FinalCaptionQueue'
import { speechEvidenceFor } from '../engines/stt/transcript-guard'
import type { SpeechEvidence } from '../engines/types'
import { performanceState } from './performance-state'

const log = createLogger('audio')
const MAX_PENDING_DESKTOP_FINALS = 16
const MAX_PENDING_DESKTOP_SAMPLES = 64 * SAMPLE_RATE
const MAX_PENDING_CLOUD_TRANSLATIONS = 4
const VAD_CONFIRMED_PEAK_FLOOR = SILENCE_THRESHOLD / 20

interface DesktopFinalState {
  pipeline: NonNullable<AppContext['pipeline']>
  generation: number
  queue: FinalCaptionQueue
  cloudCompletions: Set<Promise<unknown>>
  pcmSamples: number
  missed: number
  reportedAt: number
}

/** Convert IPC audio data to Float32Array. */
function toFloat32Array(audioData: unknown): Float32Array | null {
  let chunk: Float32Array
  if (audioData instanceof Float32Array) {
    chunk = audioData
  } else if (Array.isArray(audioData)) {
    chunk = new Float32Array(audioData)
  } else if (audioData instanceof ArrayBuffer || Buffer.isBuffer(audioData)) {
    if (audioData.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return null
    chunk = new Float32Array(
      Buffer.isBuffer(audioData) ? audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) : audioData
    )
  } else {
    log.error('Unknown data type:', typeof audioData)
    return null
  }

  return chunk
}

function hasSignal(chunk: Float32Array, floor: number): boolean {
  let maxAmp = 0
  for (let index = 0; index < chunk.length; index++) {
    const sample = chunk[index]
    if (!Number.isFinite(sample)) return false
    const abs = Math.abs(sample)
    if (abs > maxAmp) maxAmp = abs
  }

  return maxAmp >= floor
}

/**
 * Validate and convert IPC audio data to Float32Array.
 * Returns null if data is invalid, too short, or silent.
 */
function toValidAudioChunk(audioData: unknown): Float32Array | null {
  const chunk = toFloat32Array(audioData)
  if (!chunk || chunk.length < MIN_AUDIO_CHUNK_SAMPLES || !hasSignal(chunk, SILENCE_THRESHOLD)) return null
  return chunk
}

function captureEvidence(value: unknown, chunk: Float32Array): SpeechEvidence | undefined {
  if (!value || typeof value !== 'object') return undefined
  const window = value as Partial<Record<keyof SpeechEvidence, unknown>>
  const evidence = speechEvidenceFor(window.speechSeconds, chunk.length / SAMPLE_RATE, window)
  if (evidence?.speechEndSample !== undefined && evidence.speechSeconds * SAMPLE_RATE > evidence.speechEndSample + 1e-6) {
    return undefined
  }
  return evidence
}

/**
 * Accept typed PCM directly, or convert an older number[] payload.
 * Unlike {@link toValidAudioChunk}, this applies neither the 0.5s
 * minimum nor silence gating, since cloud realtime APIs expect a continuous
 * stream where 100ms chunks and silence are part of the provider's own turn
 * detection.
 */
function toRealtimeChunk(audioData: unknown): Float32Array | null {
  if (audioData instanceof Float32Array) return audioData
  if (Array.isArray(audioData)) return new Float32Array(audioData)
  log.error('Unknown realtime audio data type:', typeof audioData)
  return null
}

/** Register audio processing IPC handlers */
export function registerAudioHandlers(ctx: AppContext): void {
  // IPC-level concurrency flags — drop duplicate requests before they reach
  // the pipeline to prevent concurrent native addon calls (#363)
  let processingAudio = false
  let processingStreaming = false
  let currentFinals: DesktopFinalState | undefined
  const desktopAudioPipeline = () => ctx.pipelineStarting || ctx.pipelineInputOwner === 'file' ? null : ctx.pipeline
  const finalsFor = (pipeline: NonNullable<AppContext['pipeline']>): DesktopFinalState => {
    const generation = pipeline.audioSessionGeneration
    if (!currentFinals || currentFinals.pipeline !== pipeline || currentFinals.generation !== generation) {
      currentFinals = {
        pipeline, generation, queue: new FinalCaptionQueue(), cloudCompletions: new Set(),
        pcmSamples: 0, missed: 0, reportedAt: -Infinity
      }
    }
    return currentFinals
  }
  const previewDelay = (): number => {
    const pipeline = desktopAudioPipeline()
    if (!pipeline?.running || performanceState().previewsPaused) return 1500
    const finals = finalsFor(pipeline)
    if (processingStreaming || finals.queue.pending || finals.cloudCompletions.size >= 2) return 250
    return pipeline.audioPreviewDelayMs
  }

  // Process audio chunk from renderer
  ipcMain.handle('process-audio', async (_event, audioData: unknown) => {
    const pipeline = desktopAudioPipeline()
    if (!pipeline?.running) return null
    if (processingAudio) return null

    const chunk = toValidAudioChunk(audioData)
    if (!chunk) return null

    processingAudio = true
    const t0 = performance.now()
    try {
      const result = await pipeline.process(chunk, SAMPLE_RATE)
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) log.info(`process-audio: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
      return result
    } catch (err) {
      log.error('Pipeline error:', err)
      const message = sanitizeErrorMessage(err instanceof Error ? err.message : String(err))
      ctx.mainWindow?.webContents.send('status-update', `Processing error: ${message}`)
      return null
    } finally {
      processingAudio = false
    }
  })

  // Process streaming audio (rolling buffer during speech).
  const processDesktopPreview = async (audioData: unknown, evidenceData: unknown) => {
    const pipeline = desktopAudioPipeline()
    if (!pipeline?.running) return null
    // Drop if another streaming call is in-flight — the next interval
    // will resend accumulated audio via the rolling buffer (#363)
    const finals = finalsFor(pipeline)
    if (processingStreaming || finals.queue.pending || finals.cloudCompletions.size >= 2 || performanceState().previewsPaused) return null

    const chunk = toValidAudioChunk(audioData)
    if (!chunk) return null

    processingStreaming = true
    const t0 = performance.now()
    try {
      const result = await pipeline.processStreaming(chunk, SAMPLE_RATE, captureEvidence(evidenceData, chunk))
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) log.info(`streaming: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
      return result
    } catch (err) {
      log.error('Streaming pipeline error:', err)
      return null
    } finally {
      processingStreaming = false
    }
  }
  ipcMain.handle('process-audio-streaming', (_event, audioData: unknown, evidenceData: unknown) =>
    processDesktopPreview(audioData, evidenceData))
  ipcMain.handle('get-audio-preview-delay', previewDelay)
  ipcMain.handle('process-audio-preview', async (_event, audioData: unknown, evidenceData: unknown) => {
    const delay = previewDelay()
    if (delay > 0) return delay
    await processDesktopPreview(audioData, evidenceData)
    return previewDelay()
  })

  // #721: Realtime cloud e2e — continuous 100ms PCM chunks and VAD turn-boundary
  // hints are serialized through the shared dispatcher (ordering, bounded
  // backpressure, and session isolation live there — see realtime-audio.ts).
  const realtime = getRealtimeAudioDispatcher()
  ipcMain.handle('push-realtime-audio', (_event, audioData: unknown) => {
    if (!desktopAudioPipeline()) return
    const chunk = toRealtimeChunk(audioData)
    if (chunk) realtime.pushAudio(ctx, chunk)
  })
  ipcMain.handle('speech-boundary', (_event, boundary: unknown) => {
    if (!desktopAudioPipeline()) return
    realtime.signalBoundary(ctx, boundary)
  })

  // Finalize streaming (speech segment ended)
  ipcMain.handle('finalize-streaming', async (_event, audioData: unknown, evidenceData: unknown) => {
    const pipeline = desktopAudioPipeline()
    if (!pipeline?.running) return null

    const chunk = toFloat32Array(audioData)
    if (!chunk) return null
    const evidence = captureEvidence(evidenceData, chunk)
    const confirmed = evidence?.captureStartSample !== undefined && evidence.speechSeconds >= 0.096
    if (!hasSignal(chunk, confirmed ? VAD_CONFIRMED_PEAK_FLOOR : SILENCE_THRESHOLD)) return null
    // A VAD-confirmed short final can carry a negation or an entire reply.
    // Keep the 0.5s floor for legacy or unverified capture.
    if (chunk.length < MIN_AUDIO_CHUNK_SAMPLES &&
        (chunk.length < SAMPLE_RATE / 4 || !confirmed)) return null
    const finals = finalsFor(pipeline)
    if (finals.queue.pending >= MAX_PENDING_DESKTOP_FINALS || finals.pcmSamples + chunk.length > MAX_PENDING_DESKTOP_SAMPLES) {
      finals.missed++
      const now = performance.now()
      if (now - finals.reportedAt >= 1000) {
        finals.reportedAt = now
        log.warn(`Desktop caption queue full. Dropped ${finals.missed} speech segments in this session.`)
      }
      return null
    }

    const t0 = performance.now()
    finals.pcmSamples += chunk.length
    try {
      const isCurrent = (): boolean => desktopAudioPipeline() === pipeline && pipeline.running &&
        pipeline.audioSessionGeneration === finals.generation
      const accepted = await finals.queue.enqueue(async () => {
        if (!isCurrent()) return null
        if (!pipeline.canOverlapFinalTranslation) {
          return { completion: Promise.resolve(await pipeline.finalizeStreaming(chunk, SAMPLE_RATE, evidence)) }
        }
        if (finals.cloudCompletions.size >= MAX_PENDING_CLOUD_TRANSLATIONS) await Promise.race(finals.cloudCompletions)
        if (!isCurrent()) return null
        const prepared = await pipeline.prepareFinalStreaming(chunk, SAMPLE_RATE, evidence)
        if (!prepared) return null
        // Release recognition while the remote translator works. The pipeline
        // owns final publication order and checks its generation again.
        const completion: Promise<unknown> = prepared.completion.catch(() => undefined)
        finals.cloudCompletions.add(completion)
        void completion.then(() => finals.cloudCompletions.delete(completion))
        return prepared
      }, () => { finals.pcmSamples -= chunk.length })
      const result = accepted ? await accepted.completion : null
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) log.info(`finalize: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
      return result
    } catch (err) {
      log.error('Finalize streaming error:', err)
      return null
    }
  })
}
