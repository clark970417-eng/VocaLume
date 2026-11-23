import { dialog, ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher, type Stats } from 'node:fs'
import { resolve } from 'node:path'
import { readdir, lstat, stat, writeFile } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { isSupportedMediaFile } from '../../media-formats'
import type { Language, STTResult, TranslationResult } from '../../engines/types'
import { lowerInferencePriority } from '../../engines/inference-resources'
import { addJapaneseCaptionBoundaries } from '../../engines/translator/japanese-caption-boundaries'
import type { MediaFileCue } from '../../media-transcript'
import type { AppContext } from '../app-context'
import { liveWork } from '../live-work'
import { performanceState } from '../performance-state'
import {
  chooseMediaCut, compactDigitalSilence, findOpeningSegmentEnd, hasAudibleMediaFrame, mediaOverlapPrefix,
  OPENING_SEGMENT_SECONDS, stitchMediaText
} from '../media-segmentation'
import { setTimeout as wait } from 'node:timers/promises'
import { translateUiText } from '../../../../extension/ui-language.mjs'
import { getUiLanguageState } from '../interface-language'
const MAX_PCM_BYTES = 16_000 * 4 * 60 * 60 * 6 // Six hours of mono float32 PCM.
const SAMPLE_RATE = 16_000
// The compatibility IPC returns one complete PCM array, with additional IPC copies.
const LEGACY_MEDIA_LIMIT_SECONDS = 4 * 60
const LEGACY_MAX_PCM_BYTES = LEGACY_MEDIA_LIMIT_SECONDS * SAMPLE_RATE * Float32Array.BYTES_PER_ELEMENT
const MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 24
const OPENING_SEGMENT_SAMPLES = SAMPLE_RATE * OPENING_SEGMENT_SECONDS
const OVERLAP_SAMPLES = Math.round(SAMPLE_RATE * 1.1)
interface MediaJob {
  decoder?: ChildProcess
  sender: Electron.WebContents
  cancel: AbortController
}
const activeJobs = new Map<string, MediaJob>()
let legacyDecodeActive = false

function cancelMediaJob(job: MediaJob): void {
  if (job.cancel.signal.aborted) return
  job.cancel.abort()
  job.decoder?.kill('SIGKILL')
}
const mediaRevision = (info: Stats): string => `${info.ino}:${info.size}:${info.mtimeMs}`

export function registerMediaFileIpc(ctx: AppContext): void {
  ipcMain.handle('export-file-transcript', async (_event, contents: unknown) => {
    if (typeof contents !== 'string') throw new Error('Invalid transcript.')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: translateUiText('Export text file', getUiLanguageState().locale),
      defaultPath: 'VocaLume-transcript.txt',
      filters: [{ name: 'TXT', extensions: ['txt'] }]
    })
    if (!canceled && filePath) await writeFile(filePath, contents, 'utf8')
  })
  let watched: { path: string; owner: Electron.WebContents; native?: FSWatcher; close: () => void } | undefined
  ipcMain.handle('choose-media-folder', async ({ sender }) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    const folder = result.filePaths[0]
    if (result.canceled || !folder || sender.isDestroyed()) return null
    watched?.close()
    let notification: ReturnType<typeof setTimeout> | undefined
    const notify = (): void => {
      clearTimeout(notification)
      notification = setTimeout(() => {
        if (watched === selection && !sender.isDestroyed()) sender.send('media-folder-changed')
      }, 250)
      notification.unref()
    }
    const close = (): void => {
      if (watched === selection) watched = undefined
      clearTimeout(notification)
      selection.native?.close()
      sender.off('destroyed', close)
    }
    const selection: NonNullable<typeof watched> = { path: folder, owner: sender, close }
    watched = selection
    sender.once('destroyed', close)
    try {
      selection.native = watch(folder, { persistent: false }, notify)
      selection.native.on('error', () => {
        selection.native?.close()
        selection.native = undefined
        notify()
      })
      selection.native.on('close', () => {
        if (watched !== selection || !selection.native) return
        selection.native = undefined
        notify()
      })
    } catch { /* Remote and removable folders can fall back to periodic scans. */ }
    return folder
  })
  ipcMain.handle('stop-media-folder-watch', ({ sender }) => {
    if (watched?.owner === sender) watched.close()
  })
  ipcMain.handle('scan-media-folder', async ({ sender }) => {
    const selection = watched
    if (!selection || selection.owner !== sender || ctx.pipeline?.active ||
        ctx.pipeline?.state === 'initializing' || performanceState().auxiliaryWorkPaused) return null
    const files: { path: string; name: string; revision: string }[] = []
    for (const entry of await readdir(selection.path, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.') || !isSupportedMediaFile(entry.name)) continue
      const path = resolve(selection.path, entry.name)
      const info = await lstat(path).catch(() => null)
      if (info?.isFile() && info.size) files.push({ path, name: entry.name, revision: mediaRevision(info) })
    }
    if (watched !== selection) return null
    return { files: files.sort((a, b) => a.name.localeCompare(b.name)), eventDriven: Boolean(selection.native) }
  })
  ipcMain.handle('decode-media-file', async (event, requestedPath: string) => {
    const inputPath = await validatedMediaPath(requestedPath)
    if (ctx.pipelineStarting || ctx.pipeline?.active || activeJobs.size || legacyDecodeActive) {
      throw new Error('Finish the active translation before decoding a short media file.')
    }
    legacyDecodeActive = true
    try { return await decodeWithFfmpeg(inputPath, event.sender) }
    finally { legacyDecodeActive = false }
  })

  ipcMain.handle('process-media-file', async (event, requestedPath: string, jobId: string, review = false, expectedRevision?: string) => {
    const pipeline = ctx.pipeline
    if (!pipeline?.running) throw new Error('Start the translation engine before importing a media file.')
    if (ctx.pipelineStarting || ctx.pipelineInputOwner !== 'file') throw new Error('Start a file translation session before importing media.')
    if (typeof jobId !== 'string' || !jobId || jobId.length > 128) throw new Error('Invalid media import job.')
    // Batch recognition shares one decoder/translation pipeline.
    if (activeJobs.size || legacyDecodeActive) throw new Error('A media import is already running.')
    const job: MediaJob = { sender: event.sender, cancel: new AbortController() }
    activeJobs.set(jobId, job)
    const stop = (): void => cancelMediaJob(job)
    const pipelineStateChanged = (state: string): void => {
      // Recovery can briefly enter idle with the same session clock.
      if (state === 'idle' && pipeline.sessionStartTime === null) stop()
    }
    job.sender.once('destroyed', stop)
    pipeline.on('state-change', pipelineStateChanged)
    const work = liveWork(ctx)
    const session = work.mediaSession
    try {
      const inputPath = await validatedMediaPath(requestedPath, expectedRevision)
      if (job.cancel.signal.aborted) return { processedSeconds: 0, cancelled: true }
      if (work.mediaSession !== session || ctx.pipeline !== pipeline || !pipeline.running || ctx.pipelineInputOwner !== 'file') {
        throw new Error('The file translation session ended.')
      }
      return await processMediaWithFfmpeg(ctx, pipeline, job, inputPath, jobId, review === true)
    } catch (error) {
      if (job.cancel.signal.aborted && !job.decoder) return { processedSeconds: 0, cancelled: true }
      throw error
    } finally {
      job.sender.off('destroyed', stop)
      pipeline.off('state-change', pipelineStateChanged)
      activeJobs.delete(jobId)
    }
  })

  ipcMain.handle('cancel-media-file', (event, jobId: string) => {
    const job = activeJobs.get(jobId)
    if (!job || job.sender !== event.sender) return { cancelled: false }
    cancelMediaJob(job)
    return { cancelled: true }
  })
}

async function validatedMediaPath(requestedPath: string, expectedRevision?: string): Promise<string> {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) throw new Error('No media file was selected.')
  const inputPath = resolve(requestedPath)
  if (!isSupportedMediaFile(inputPath)) throw new Error('Unsupported media file type.')
  const info = await (expectedRevision === undefined ? stat(inputPath) : lstat(inputPath))
  if (!info.isFile()) throw new Error('The selected media path is not a file.')
  if (expectedRevision !== undefined && expectedRevision !== mediaRevision(info)) throw new Error('The watched file changed before translation started.')
  return inputPath
}

export function executableFfmpegPath(): string {
  if (!ffmpegPath) throw new Error('The bundled FFmpeg decoder is unavailable.')
  return ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}

function prepareFileDecoder(decoder: ChildProcess): () => string {
  decoder.once('spawn', () => {
    if (decoder.pid) lowerInferencePriority(decoder.pid)
  })
  const maxErrorBytes = 4096
  let tail = Buffer.alloc(0)
  decoder.stderr?.on('data', (chunk: Buffer) => {
    tail = chunk.length >= maxErrorBytes
      ? Buffer.from(chunk.subarray(-maxErrorBytes))
      : Buffer.concat([tail.subarray(Math.max(0, tail.length + chunk.length - maxErrorBytes)), chunk])
  })
  return () => tail.toString('utf8').trim().slice(-500)
}

async function decodeWithFfmpeg(inputPath: string, sender: Electron.WebContents): Promise<Uint8Array> {
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-filter_threads', '1', '-threads', '1', '-i', inputPath,
    '-vn', '-t', String(LEGACY_MEDIA_LIMIT_SECONDS + 1), '-ac', '1', '-ar', String(SAMPLE_RATE),
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

  const chunks: Buffer[] = []
  const readErrors = prepareFileDecoder(decoder)
  const stop = (): void => { decoder.kill('SIGKILL') }
  sender.once('destroyed', stop)
  let total = 0
  const timeout = setTimeout(stop, 2 * 60_000)

  decoder.stdout.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > LEGACY_MAX_PCM_BYTES) stop()
    else chunks.push(chunk)
  })
  const exitCode = await new Promise<number | null>((accept, reject) => {
    decoder.once('error', reject)
    decoder.once('close', accept)
  }).finally(() => { clearTimeout(timeout); sender.off('destroyed', stop) })

  if (total > LEGACY_MAX_PCM_BYTES) throw new Error('Use File translation for media longer than four minutes.')
  if (exitCode !== 0) {
    throw new Error(readErrors() || 'FFmpeg could not decode this media file.')
  }
  const pcm = Buffer.concat(chunks)
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

async function processMediaWithFfmpeg(
  ctx: AppContext,
  pipeline: NonNullable<AppContext['pipeline']>,
  job: MediaJob,
  inputPath: string,
  jobId: string,
  review: boolean
): Promise<{ processedSeconds: number; cancelled: boolean }> {
  const { sender, cancel } = job
  const stop = (): void => cancelMediaJob(job)
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-filter_threads', '1', '-threads', '1', '-i', inputPath,
    // Keep the container's audio delay/gaps on the original media timeline.
    '-vn', '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', String(SAMPLE_RATE),
    '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  job.decoder = decoder
  const readErrors = prepareFileDecoder(decoder)
  let pending = Buffer.alloc(0)
  let totalBytes = 0
  let processedSamples = 0
  let checkedOpening = false
  let nextCueId = 0
  let prior: { tail: Float32Array; cue: MediaFileCue; language: Language; merged: boolean } | undefined
  let processingError: unknown
  let timedOut = false
  let processing = Promise.resolve()
  const timeout = setTimeout(() => { timedOut = true; stop() }, 6 * 60 * 60_000)
  const sendCue = (cue: MediaFileCue): void => {
    if (!cancel.signal.aborted && !sender.isDestroyed()) sender.send('media-file-cue', cue)
  }

  const work = liveWork(ctx)
  const session = work.mediaSession
  async function processWhenReady(operation: () => Promise<void>): Promise<boolean> {
    while (!cancel.signal.aborted) {
      try {
        const completed = await work.run('background', async signal => {
          if (work.mediaSession !== session || !pipeline.running) { stop(); return false }
          if (performanceState().speculativeTranslationPaused) return false
          signal.addEventListener('abort', stop, { once: true })
          try {
            await operation()
            return !cancel.signal.aborted
          } finally { signal.removeEventListener('abort', stop) }
        }, cancel.signal)
        if (completed) return true
        if (!cancel.signal.aborted) await wait(1000, undefined, { signal: cancel.signal })
      } catch (error) {
        if (!cancel.signal.aborted) throw error
      }
    }
    return false
  }

  const nextSampleThreshold = (): number => checkedOpening ? MAX_SEGMENT_SAMPLES : OPENING_SEGMENT_SAMPLES
  const processAvailable = async (final: boolean): Promise<void> => {
    while (!cancel.signal.aborted && (pending.length >= nextSampleThreshold() * 4 || (final && pending.length >= 4))) {
      const availableSamples = Math.floor(pending.length / 4)
      const candidateSamples = Math.min(availableSamples, MAX_SEGMENT_SAMPLES)
      const candidateBytes = candidateSamples * 4
      const candidateBuffer = pending.subarray(0, candidateBytes)
      const candidate = new Float32Array(candidateBuffer.buffer, candidateBuffer.byteOffset, candidateSamples)
      let openingEnd: number | null = null
      if (!checkedOpening && availableSamples >= OPENING_SEGMENT_SAMPLES) {
        checkedOpening = true
        // A file already fully decoded under the normal limit needs no new split.
        if (!final || availableSamples > MAX_SEGMENT_SAMPLES) {
          openingEnd = findOpeningSegmentEnd(candidate, SAMPLE_RATE)
        }
      }
      if (!openingEnd && !final && availableSamples < MAX_SEGMENT_SAMPLES) return
      const cut = openingEnd !== null ? { end: openingEnd, hard: false }
        : final && availableSamples <= MAX_SEGMENT_SAMPLES ? { end: candidateSamples, hard: false }
          : chooseMediaCut(candidate, SAMPLE_RATE)
      const segmentSamples = cut.end
      const segmentBytes = segmentSamples * 4
      const audio = new Float32Array(candidate.buffer, candidate.byteOffset, segmentSamples)
      pending = pending.subarray(segmentBytes)
      const start = processedSamples / SAMPLE_RATE
      const end = (processedSamples + segmentSamples) / SAMPLE_RATE
      const originalCue = { jobId, cueId: ++nextCueId, revision: 0, startSeconds: start, endSeconds: end }
      const speech = compactDigitalSilence(audio, SAMPLE_RATE)
      const previous = prior
      prior = undefined
      if (speech.length) {
        const completed = await processWhenReady(async () => {
          const prefix = mediaOverlapPrefix(previous?.tail, audio, SAMPLE_RATE)
          // Some recognizers transfer their input to a worker. Keep the original
          // decoder buffer available for timestamps, overlap and optional review.
          const input = prefix ? joinMediaAudio(prefix, speech) : speech === audio ? audio.slice() : speech
          let recognized: STTResult | undefined
          let failed: TranslationResult | undefined
          let location = originalCue
          let deduplicated: string | undefined
          let merged = false
          const result = await pipeline.process(input, SAMPLE_RATE, {
            signal: cancel.signal,
            publish: () => !merged,
            onTranslationFailure: value => { failed = value },
            prepareSource: value => {
              const text = fileSourceText(value)
              recognized = { ...value, text }
              if (!prefix || !previous || previous.language !== value.language) return text
              const joined = stitchMediaText(previous.cue.sourceText, text)
              if (!joined) return text
              deduplicated = joined.appended
              if (previous.merged || previous.cue.status !== 'translated' ||
                  /[.!?。！？]["'」』）)]?\s*$/u.test(previous.cue.sourceText) || joined.merged.length > 240) return joined.appended
              merged = true
              location = { ...originalCue, cueId: previous.cue.cueId, revision: previous.cue.revision + 1,
                startSeconds: previous.cue.startSeconds }
              return joined.merged
            }
          })
          if (cancel.signal.aborted) return
          if (!pipeline.running) throw new Error('The translation engine stopped during file import.')
          let cue: MediaFileCue | undefined
          if (result?.translatedText.trim()) {
            cue = { ...location, sourceText: result.sourceText, translatedText: result.translatedText, status: 'translated' }
          } else if (failed || recognized || result) {
            // Preserve the earlier completed row if re-translating its stitch failed.
            cue = { ...originalCue, sourceText: deduplicated ?? failed?.sourceText ?? recognized?.text ?? result?.sourceText ?? '',
              translatedText: '', status: 'translation-failed' }
            merged = false
          } else if (hasAudibleMediaFrame(audio, SAMPLE_RATE)) {
            cue = { ...originalCue, sourceText: '', translatedText: '', status: 'unrecognized' }
          }
          if (cue) sendCue(cue)
          const alternateInput = speech !== audio || !!prefix
          const uncertain = cue && (cue.status === 'unrecognized' ||
            (recognized?.confidence !== undefined && recognized.confidence < .72) || (prefix && !deduplicated))
          if (review && cue && !merged && performanceState().previewDutyCycle >= .85 &&
              (cue.status === 'translation-failed' || alternateInput && uncertain)) {
            const oldCue = cue
            let reviewedLanguage: Language | undefined
            const refined = await pipeline.process(audio.slice(), SAMPLE_RATE, {
              signal: cancel.signal,
              publish: () => false,
              onTranslationFailure: () => {},
              prepareSource: candidate => {
                if (recognized && candidate.language !== recognized.language) return null
                const borrowedSource = prefix && !deduplicated ? previous?.cue.sourceText : undefined
                if (!acceptMediaReview(oldCue, candidate, recognized, borrowedSource)) return null
                reviewedLanguage = candidate.language
                return fileSourceText(candidate)
              }
            })
            if (cancel.signal.aborted) return
            if (reviewedLanguage && refined?.translatedText.trim()) {
              cue = { ...oldCue, revision: oldCue.revision + 1, sourceText: refined.sourceText,
                translatedText: refined.translatedText, status: 'translated' }
              sendCue(cue)
              if (cut.hard) prior = { tail: audio.slice(-OVERLAP_SAMPLES), cue, language: reviewedLanguage, merged: false }
            }
          }
          const language = result?.sourceLanguage ?? failed?.sourceLanguage ?? recognized?.language
          if (!prior && cue?.sourceText && cut.hard && language) {
            prior = { tail: audio.slice(-OVERLAP_SAMPLES), cue, language, merged }
          }
        })
        if (!completed) break
      }
      processedSamples += segmentSamples
      if (!sender.isDestroyed()) sender.send('media-file-progress', { jobId, processedSeconds: processedSamples / SAMPLE_RATE })
    }
  }

  decoder.stdout.on('data', (chunk: Buffer) => {
    totalBytes += chunk.length
    if (totalBytes > MAX_PCM_BYTES) {
      stop()
      return
    }
    pending = Buffer.concat([pending, chunk])
    if (!cancel.signal.aborted && pending.length >= nextSampleThreshold() * 4) {
      decoder.stdout.pause()
      processing = processing.then(() => processAvailable(false)).catch(error => {
        processingError = error
        stop()
      }).finally(() => {
        if (!decoder.killed) decoder.stdout.resume()
      })
    }
  })
  decoder.once('error', () => {})
  try {
    const exitCode = await new Promise<number | null>((accept) => decoder.once('close', accept))
    await processing
    if (processingError) throw processingError
    if (!cancel.signal.aborted && totalBytes <= MAX_PCM_BYTES && exitCode === 0) await processAvailable(true)
    if (timedOut) throw new Error('The media file import timed out.')
    const cancelled = cancel.signal.aborted
    if (totalBytes > MAX_PCM_BYTES) throw new Error('The media file is longer than the six-hour import limit.')
    if (!cancelled && exitCode !== 0) {
      throw new Error(readErrors() || 'FFmpeg could not decode this media file.')
    }
    return { processedSeconds: processedSamples / SAMPLE_RATE, cancelled }
  } finally { clearTimeout(timeout) }
}

function fileSourceText(result: STTResult): string {
  return result.language === 'ja' ? addJapaneseCaptionBoundaries(result.text) : result.text
}

function joinMediaAudio(prefix: Float32Array, body: Float32Array): Float32Array {
  const input = new Float32Array(prefix.length + body.length)
  input.set(prefix)
  input.set(body, prefix.length)
  return input
}

function acceptMediaReview(
  cue: MediaFileCue, candidate: STTResult, recognized: STTResult | undefined, borrowedSource?: string
): boolean {
  const normalize = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const before = normalize(cue.sourceText), after = normalize(candidate.text)
  if (!after) return false
  if (!before) return true
  if (before === after) return cue.status !== 'translated'
  // Without the borrowed PCM, only remove a short, verified duplicate prefix.
  if (borrowedSource && after.length >= 8 && before.endsWith(after)) {
    const removed = before.slice(0, -after.length)
    if (removed.length >= 3 && removed.length <= 22 && normalize(borrowedSource).endsWith(removed)) return true
  }
  // With two real confidence measurements, accept a clearer completion that
  // retains all of the previously recognized words.
  return after.startsWith(before) && candidate.confidence !== undefined && recognized?.confidence !== undefined &&
    candidate.confidence >= .72 && candidate.confidence >= recognized.confidence + .08
}
