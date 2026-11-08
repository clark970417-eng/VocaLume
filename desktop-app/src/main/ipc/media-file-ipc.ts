import { dialog, ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { watch, type FSWatcher, type Stats } from 'node:fs'
import { resolve } from 'node:path'
import { readdir, lstat, stat, writeFile } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { isSupportedMediaFile } from '../../media-formats'
import type { AppContext } from '../app-context'
import { liveWork } from '../live-work'
import { performanceState } from '../performance-state'
import { setTimeout as wait } from 'node:timers/promises'
import { findQuietSegmentEnd } from '../media-segmentation'
import { translateUiText } from '../../../../extension/ui-language.mjs'
import { getUiLanguageState } from '../interface-language'
const MAX_PCM_BYTES = 16_000 * 4 * 60 * 60 * 6 // Six hours of mono float32 PCM.
const SAMPLE_RATE = 16_000
const MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 24
const activeDecoders = new Map<string, ChildProcess>()
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
  ipcMain.handle('decode-media-file', async (_event, requestedPath: string) => {
    if (typeof requestedPath !== 'string' || requestedPath.length === 0) throw new Error('No media file was selected.')
    const inputPath = resolve(requestedPath)
    if (!isSupportedMediaFile(inputPath)) throw new Error('Unsupported media file type.')
    const info = await stat(inputPath)
    if (!info.isFile()) throw new Error('The selected media path is not a file.')
    return decodeWithFfmpeg(inputPath)
  })

  ipcMain.handle('process-media-file', async (event, requestedPath: string, jobId: string, expectedRevision?: string) => {
    const work = liveWork(ctx)
    const session = work.mediaSession
    if (!ctx.pipeline?.running || !session) throw new Error('Start a file translation session before importing a media file.')
    if (typeof jobId !== 'string' || !jobId) throw new Error('Invalid media import job.')
    const inputPath = await validatedMediaPath(requestedPath, expectedRevision)
    if (work.mediaSession !== session || !ctx.pipeline?.running) throw new Error('The file translation session ended.')
    if (activeDecoders.size) throw new Error('A media import is already running.')
    return processMediaWithFfmpeg(ctx, event.sender, inputPath, jobId)
  })

  ipcMain.handle('cancel-media-file', (_event, jobId: string) => {
    const decoder = activeDecoders.get(jobId)
    if (!decoder) return { cancelled: false }
    decoder.kill('SIGKILL')
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

async function decodeWithFfmpeg(inputPath: string): Promise<Uint8Array> {
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const chunks: Buffer[] = []
  const errors: Buffer[] = []
  let total = 0
  const timeout = setTimeout(() => decoder.kill('SIGKILL'), 10 * 60_000)

  decoder.stdout.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > MAX_PCM_BYTES) decoder.kill('SIGKILL')
    else chunks.push(chunk)
  })
  decoder.stderr.on('data', (chunk: Buffer) => errors.push(chunk))

  const exitCode = await new Promise<number | null>((accept, reject) => {
    decoder.once('error', reject)
    decoder.once('close', accept)
  }).finally(() => clearTimeout(timeout))

  if (total > MAX_PCM_BYTES) throw new Error('The media file is longer than the six-hour import limit.')
  if (exitCode !== 0) {
    const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
    throw new Error(detail || 'FFmpeg could not decode this media file.')
  }
  const pcm = Buffer.concat(chunks)
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

async function processMediaWithFfmpeg(
  ctx: AppContext,
  sender: Electron.WebContents,
  inputPath: string,
  jobId: string
): Promise<{ processedSeconds: number; cancelled: boolean }> {
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const work = liveWork(ctx)
  const session = work.mediaSession
  activeDecoders.set(jobId, decoder)
  let pending = Buffer.alloc(0)
  let totalBytes = 0
  let processedSamples = 0
  let stopped = false
  const errors: Buffer[] = []
  let processing = Promise.resolve()
  const timeout = setTimeout(() => decoder.kill('SIGKILL'), 6 * 60 * 60_000)

  const processAvailable = async (final: boolean): Promise<void> => {
    while (pending.length >= MAX_SEGMENT_SAMPLES * 4 || (final && pending.length >= 4)) {
      const availableSamples = Math.floor(pending.length / 4)
      const candidateSamples = Math.min(availableSamples, MAX_SEGMENT_SAMPLES)
      const candidateBytes = candidateSamples * 4
      const candidateBuffer = pending.subarray(0, candidateBytes)
      const candidate = new Float32Array(candidateBuffer.buffer, candidateBuffer.byteOffset, candidateSamples)
      const segmentSamples = final && availableSamples <= MAX_SEGMENT_SAMPLES
        ? candidateSamples
        : findQuietSegmentEnd(candidate)
      const segmentBytes = segmentSamples * 4
      const segmentBuffer = Buffer.from(pending.subarray(0, segmentBytes))
      pending = pending.subarray(segmentBytes)
      const audio = new Float32Array(segmentBuffer.buffer, segmentBuffer.byteOffset, segmentSamples)
      for (;;) {
        const processed = await work.run('background', async signal => {
          if (signal.aborted || !session || work.mediaSession !== session || !ctx.pipeline?.running || decoder.killed) return 'stopped'
          if (performanceState().speculativeTranslationPaused) return 'paused'
          await ctx.pipeline.process(new Float32Array(audio), SAMPLE_RATE)
          return 'done'
        })
        if (processed === 'done') break
        if (processed === 'stopped') { stopped = true; decoder.kill('SIGKILL'); return }
        // The decoder's stream remains backpressured during this wait; only
        // the file is delayed. Audio never waits on a pressure timer.
        await wait(1000)
      }
      processedSamples += segmentSamples
      sender.send('media-file-progress', { jobId, processedSeconds: processedSamples / SAMPLE_RATE })
    }
  }

  decoder.stdout.on('data', (chunk: Buffer) => {
    totalBytes += chunk.length
    if (totalBytes > MAX_PCM_BYTES) {
      decoder.kill('SIGKILL')
      return
    }
    pending = Buffer.concat([pending, chunk])
    if (pending.length >= MAX_SEGMENT_SAMPLES * 4) {
      decoder.stdout.pause()
      processing = processing.then(() => processAvailable(false)).finally(() => {
        if (!decoder.killed) decoder.stdout.resume()
      })
    }
  })
  decoder.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
  decoder.once('error', () => {})
  const exitCode = await new Promise<number | null>((accept) => decoder.once('close', accept))
  clearTimeout(timeout)
  const cancelled = decoder.killed && totalBytes <= MAX_PCM_BYTES
  try {
    await processing
    if (!cancelled && totalBytes <= MAX_PCM_BYTES) await processAvailable(true)
  } finally {
    activeDecoders.delete(jobId)
  }
  if (totalBytes > MAX_PCM_BYTES) throw new Error('The media file is longer than the six-hour import limit.')
  if (!cancelled && exitCode !== 0) {
    const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
    throw new Error(detail || 'FFmpeg could not decode this media file.')
  }
  return { processedSeconds: processedSamples / SAMPLE_RATE, cancelled: cancelled || stopped }
}
