import { ipcMain } from 'electron'
import { sanitizeErrorMessage } from './error-utils'
import { createLogger } from './logger'
import { SAMPLE_RATE } from './constants'
import { MIN_AUDIO_CHUNK_SAMPLES, SILENCE_THRESHOLD } from './audio-constants'
import { getRealtimeAudioDispatcher } from './realtime-audio'
import { liveWork } from './live-work'
import { speechEvidenceFor } from '../engines/stt/transcript-guard'
import type { SpeechEvidence } from '../engines/types'
import type { AppContext } from './app-context'

const log = createLogger('audio')
const logTiming = process.env.VOCALUME_CAPTION_TIMING === '1' ? log.info : log.debug

/** Convert IPC audio data to Float32Array, returning null for silence */
function toFloat32Array(audioData: unknown): Float32Array | null {
  let chunk: Float32Array
  if (audioData instanceof Float32Array) {
    chunk = audioData
  } else if (Array.isArray(audioData)) {
    chunk = new Float32Array(audioData)
  } else if (audioData instanceof ArrayBuffer || Buffer.isBuffer(audioData)) {
    chunk = new Float32Array(
      Buffer.isBuffer(audioData) ? audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) : audioData
    )
  } else {
    log.error('Unknown data type:', typeof audioData)
    return null
  }

  // Scan for max amplitude (used for silence detection)
  let maxAmp = 0
  for (let i = 0; i < chunk.length; i++) {
    const abs = Math.abs(chunk[i])
    if (abs > maxAmp) maxAmp = abs
  }

  if (maxAmp < SILENCE_THRESHOLD) {
    return null
  }

  return chunk
}

/**
 * Validate and convert IPC audio data to Float32Array.
 * Returns null if data is invalid, too short, or silent.
 */
function toValidAudioChunk(audioData: unknown): Float32Array | null {
  const chunk = toFloat32Array(audioData)
  if (!chunk || chunk.length < MIN_AUDIO_CHUNK_SAMPLES) return null
  return chunk
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

function captureCheckpoint(value: unknown, audio: Float32Array): SpeechEvidence | undefined {
  if (!value || typeof value !== 'object') return undefined
  const metadata = value as Record<string, unknown>
  const evidence = speechEvidenceFor(metadata.speechSeconds, audio.length / SAMPLE_RATE, metadata)
  if (evidence?.captureStartSample === undefined || evidence.captureEndSample === undefined) return undefined
  return { ...evidence, checkpointOnly: true }
}

/** Register audio processing IPC handlers */
export function registerAudioHandlers(ctx: AppContext): void {
  // IPC-level concurrency flags — drop duplicate requests before they reach
  // the pipeline to prevent concurrent native addon calls (#363)
  const work = liveWork(ctx)
  let processingAudio = false
  let processingStreaming = false
  let finalizedCue = 0

  // Process audio chunk from renderer
  ipcMain.handle('process-audio', async (_event, audioData: unknown) => {
    if (!ctx.pipeline?.running || ctx.extensionConnected || work.mediaSession) return null
    if (processingAudio) return null

    const chunk = toValidAudioChunk(audioData)
    if (!chunk) return null

    processingAudio = true
    const t0 = performance.now()
    try {
      const pipeline = ctx.pipeline
      const epoch = pipeline.sessionStartTime
      const result = await work.run('final', async () =>
        ctx.pipeline === pipeline && pipeline.running && pipeline.sessionStartTime === epoch && !ctx.extensionConnected && !work.mediaSession
          ? pipeline.process(chunk, SAMPLE_RATE) : null)
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) logTiming(`process-audio: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
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

  // Process streaming audio (rolling buffer during speech)
  ipcMain.handle('process-audio-streaming', async (_event, audioData: unknown, metadata?: unknown) => {
    if (!ctx.pipeline?.running || ctx.extensionConnected || work.mediaSession) return null
    // Drop if another streaming call is in-flight — the next interval
    // will resend accumulated audio via the rolling buffer (#363)
    if (processingStreaming) return null

    const chunk = toValidAudioChunk(audioData)
    if (!chunk) return null

    processingStreaming = true
    const t0 = performance.now()
    try {
      const pipeline = ctx.pipeline
      const epoch = pipeline.sessionStartTime
      const cue = finalizedCue
      const evidence = captureCheckpoint(metadata, chunk)
      const result = await work.run('preview', async () =>
        cue === finalizedCue && ctx.pipeline === pipeline && pipeline.running &&
        pipeline.sessionStartTime === epoch && !ctx.extensionConnected && !work.mediaSession
          ? pipeline.processStreaming(chunk, SAMPLE_RATE, evidence) : null)
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) logTiming(`streaming: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
      return result
    } catch (err) {
      log.error('Streaming pipeline error:', err)
      return null
    } finally {
      processingStreaming = false
    }
  })

  // #721: Realtime cloud e2e — continuous 100ms PCM chunks and VAD turn-boundary
  // hints are serialized through the shared dispatcher (ordering, bounded
  // backpressure, and session isolation live there — see realtime-audio.ts).
  const realtime = getRealtimeAudioDispatcher()
  ipcMain.handle('push-realtime-audio', (_event, audioData: unknown) => {
    const chunk = toRealtimeChunk(audioData)
    if (chunk) realtime.pushAudio(ctx, chunk)
  })
  ipcMain.handle('speech-boundary', (_event, boundary: unknown) => {
    realtime.signalBoundary(ctx, boundary)
  })

  // Finalize streaming (speech segment ended)
  ipcMain.handle('finalize-streaming', async (_event, audioData: unknown, metadata?: unknown) => {
    if (!ctx.pipeline?.running || ctx.extensionConnected || work.mediaSession) return null

    const chunk = toValidAudioChunk(audioData)
    if (!chunk) return null

    finalizedCue++
    const t0 = performance.now()
    try {
      const pipeline = ctx.pipeline
      const epoch = pipeline.sessionStartTime
      const evidence = captureCheckpoint(metadata, chunk)
      pipeline.interruptStreamingPreview?.(evidence)
      const { completion } = await work.run('final', async () => {
        if (ctx.pipeline !== pipeline || !pipeline.running || pipeline.sessionStartTime !== epoch || ctx.extensionConnected || work.mediaSession) {
          return { completion: Promise.resolve(null) }
        }
        if (pipeline.canOverlapFinalTranslation) {
          const prepared = await pipeline.prepareFinalStreaming(chunk, SAMPLE_RATE, evidence)
          return { completion: prepared ? work.trackFinal(prepared.completion) : Promise.resolve(null) }
        }
        return { completion: Promise.resolve(await pipeline.finalizeStreaming(chunk, SAMPLE_RATE, evidence)) }
      })
      const result = await completion
      const elapsed = (performance.now() - t0).toFixed(0)
      if (result) logTiming(`finalize: ${elapsed}ms, ${(chunk.length / SAMPLE_RATE).toFixed(1)}s audio`)
      return result
    } catch (err) {
      log.error('Finalize streaming error:', err)
      return null
    }
  })
}
