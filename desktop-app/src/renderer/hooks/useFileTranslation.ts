import { useEffect, useRef, useState } from 'react'
import { mergeMediaCue, type MediaTranscriptRow } from '../../media-transcript'

export function useFileTranslation({ disabled, handleStart, handleStop, setStatus }: {
  disabled: boolean
  handleStart: (options: { captureAudio: boolean }) => Promise<boolean>
  handleStop: () => Promise<void>
  setStatus: (status: string) => void
}) {
  const [mediaJobId, setMediaJobId] = useState<string | null>(null)
  const activeJob = useRef<string | null>(null)
  const cancelRequested = useRef(false)
  const [reviewFile, setReviewFile] = useState(false)
  const [rows, setRows] = useState<MediaTranscriptRow[]>([])

  useEffect(() => window.api.onMediaFileProgress(({ jobId, processedSeconds }) => {
    if (jobId === activeJob.current && !cancelRequested.current) setStatus(`Translating file: ${formatMediaTime(processedSeconds)} processed`)
  }), [setStatus])
  useEffect(() => window.api.onMediaFileCue(cue => {
    const job = activeJob.current
    setRows(current => mergeMediaCue(current, job, cue))
  }), [])

  const editCue = (jobId: string, cueId: number, editedText: string): void => {
    setRows(current => current.map(row => row.jobId === jobId && row.cueId === cueId ? { ...row, editedText } : row))
  }

  const mediaBusy = useRef(false)
  const translatePath = async (path: string, name: string): Promise<void> => {
    if (mediaBusy.current) return
    mediaBusy.current = true
    cancelRequested.current = false
    let started = false
    let finalStatus: string | undefined
    const jobId = crypto.randomUUID()
    try {
      if (!path) throw new Error('The selected file cannot be accessed.')
      activeJob.current = jobId
      setRows([])
      setMediaJobId(jobId)
      setStatus(`Opening ${name}...`)
      started = await handleStart({ captureAudio: false })
      if (!started) return
      if (cancelRequested.current) {
        finalStatus = `Cancelled ${name} at 0:00`
        return
      }
      const result = await window.api.processMediaFile(path, jobId, reviewFile)
      finalStatus = result.cancelled
        ? `Cancelled ${name} at ${formatMediaTime(result.processedSeconds)}`
        : `Finished ${name} (${formatMediaTime(result.processedSeconds)})`
    } catch (error) {
      finalStatus = `File translation failed: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      activeJob.current = null
      setMediaJobId(null)
      try { if (started) await handleStop() }
      finally {
        if (finalStatus) setStatus(finalStatus)
        mediaBusy.current = false
      }
    }
  }

  const [watchFolder, setWatchFolder] = useState<string | null>(null)
  const watchState = useRef({ seen: new Map<string, string>(), attempted: new Map<string, string>(), busy: false })
  const scanFolder = useRef<() => Promise<void>>(async () => {})
  scanFolder.current = async () => {
    const state = watchState.current
    if (!watchFolder || disabled || mediaJobId || state.busy) return
    state.busy = true
    try {
      const files = await window.api.scanMediaFolder()
      if (state !== watchState.current) return
      const next = files.find(file => state.seen.get(file.path) === file.revision &&
        state.attempted.get(file.path) !== file.revision)
      state.seen = new Map(files.map(file => [file.path, file.revision]))
      if (next && !mediaBusy.current) {
        state.attempted.set(next.path, next.revision)
        await translatePath(next.path, next.name)
      }
    } catch (error) {
      setStatus(String(error))
      setWatchFolder(null)
    } finally {
      state.busy = false
    }
  }
  useEffect(() => {
    if (!watchFolder) return
    void scanFolder.current()
    const timer = setInterval(() => void scanFolder.current(), 3000)
    return () => clearInterval(timer)
  }, [watchFolder])

  const cancelMediaFile = async (): Promise<void> => {
    if (!mediaJobId) return
    cancelRequested.current = true
    setStatus('Cancelling file translation...')
    await window.api.cancelMediaFile(mediaJobId)
  }

  const toggleWatchFolder = async (): Promise<void> => {
    watchState.current = { seen: new Map(), attempted: new Map(), busy: false }
    if (watchFolder) setWatchFolder(null)
    else {
      try { setWatchFolder(await window.api.chooseMediaFolder()) }
      catch (error) { setStatus(String(error)) }
    }
  }

  return { mediaJobId, translatePath, cancelMediaFile, watchFolder, toggleWatchFolder, rows, editCue, reviewFile, setReviewFile }
}

function formatMediaTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remaining = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`
}
