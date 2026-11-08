import { useEffect, useRef, useState } from 'react'
import { FILE_STABILITY_MS, MediaFolderQueue } from './media-folder-watch'

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
  const translatePath = async (path: string, name: string, expectedRevision?: string): Promise<void> => {
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
      const result = await window.api.processMediaFile(path, jobId, expectedRevision)
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
  const watchState = useRef<{ queue: MediaFolderQueue; busy: boolean; dirty: boolean } | undefined>(undefined)
  const scheduleScan = useRef<(delay: number) => void>(() => {})
  const scanFolder = useRef<() => Promise<void>>(async () => {})
  scanFolder.current = async () => {
    const state = watchState.current
    if (!state || disabled || mediaJobId) return
    if (state.busy) { state.dirty = true; return }
    state.busy = true
    let delay = FILE_STABILITY_MS
    try {
      const scan = await window.api.scanMediaFolder()
      if (state !== watchState.current || !scan) return
      const { ready, nextCheck } = state.queue.scan(scan.files, performance.now())
      delay = scan.eventDriven ? nextCheck : Math.min(nextCheck, FILE_STABILITY_MS)
      if (ready) {
        if (mediaBusy.current) delay = FILE_STABILITY_MS
        else {
          state.queue.markAttempted(ready)
          await translatePath(ready.path, ready.name, ready.revision)
          delay = 0
        }
      }
    } catch (error) {
      if (state === watchState.current) {
        setStatus(String(error))
        setWatchFolder(null)
      }
    } finally {
      state.busy = false
      if (state === watchState.current) scheduleScan.current(state.dirty ? 0 : delay)
      state.dirty = false
    }
  }
  useEffect(() => {
    if (!watchFolder) return
    watchState.current = { queue: new MediaFolderQueue(), busy: false, dirty: false }
    let timer: ReturnType<typeof setTimeout> | undefined
    let deadline = Infinity
    scheduleScan.current = delay => {
      const at = performance.now() + delay
      if (deadline <= at) return
      clearTimeout(timer)
      deadline = at
      timer = setTimeout(() => {
        deadline = Infinity
        void scanFolder.current()
      }, delay)
    }
    const unsubscribe = window.api.onMediaFolderChanged(() => scheduleScan.current(0))
    scheduleScan.current(0)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      watchState.current = undefined
      scheduleScan.current = () => {}
      void window.api.stopMediaFolderWatch().catch(() => {})
    }
  }, [watchFolder])
  useEffect(() => {
    if (!disabled && !mediaJobId) scheduleScan.current(0)
  }, [disabled, mediaJobId])

  const cancelMediaFile = async (): Promise<void> => {
    if (!mediaJobId) return
    setStatus('Cancelling file translation...')
    await window.api.cancelMediaFile(mediaJobId)
  }

  const toggleWatchFolder = async (): Promise<void> => {
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
