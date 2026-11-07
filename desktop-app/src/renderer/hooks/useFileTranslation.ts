import { useEffect, useRef, useState } from 'react'

export function useFileTranslation({ disabled, handleStart, handleStop, setStatus }: {
  disabled: boolean
  handleStart: (options: { captureAudio: boolean }) => Promise<boolean>
  handleStop: () => Promise<void>
  setStatus: (status: string) => void
}) {
  const [mediaJobId, setMediaJobId] = useState<string | null>(null)

  useEffect(() => window.api.onMediaFileProgress(({ jobId, processedSeconds }) => {
    if (jobId === mediaJobId) setStatus(`Translating file: ${formatMediaTime(processedSeconds)} processed`)
  }), [mediaJobId, setStatus])

  const mediaBusy = useRef(false)
  const translatePath = async (path: string, name: string): Promise<void> => {
    if (mediaBusy.current) return
    mediaBusy.current = true
    let started = false
    let finalStatus: string | undefined
    const jobId = crypto.randomUUID()
    try {
      if (!path) throw new Error('The selected file cannot be accessed.')
      setMediaJobId(jobId)
      setStatus(`Opening ${name}...`)
      started = await handleStart({ captureAudio: false })
      if (!started) return
      const result = await window.api.processMediaFile(path, jobId)
      finalStatus = result.cancelled
        ? `Cancelled ${name} at ${formatMediaTime(result.processedSeconds)}`
        : `Finished ${name} (${formatMediaTime(result.processedSeconds)})`
    } catch (error) {
      finalStatus = `File translation failed: ${error instanceof Error ? error.message : String(error)}`
    } finally {
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
    const timer = setInterval(() => void scanFolder.current(), 3000)
    return () => clearInterval(timer)
  }, [watchFolder])

  const cancelMediaFile = async (): Promise<void> => {
    if (!mediaJobId) return
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

  return { mediaJobId, translatePath, cancelMediaFile, watchFolder, toggleWatchFolder }
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
