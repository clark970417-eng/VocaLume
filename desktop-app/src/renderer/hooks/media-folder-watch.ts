export interface WatchedMediaFile {
  path: string
  name: string
  revision: string
}

export const FILE_STABILITY_MS = 3000
export const WATCH_RECONCILE_MS = 30_000

export class MediaFolderQueue {
  private seen = new Map<string, { revision: string; since: number }>()
  private attempted = new Map<string, string>()

  scan(files: WatchedMediaFile[], now: number): { ready?: WatchedMediaFile; nextCheck: number } {
    const seen = new Map<string, { revision: string; since: number }>()
    let nextCheck = WATCH_RECONCILE_MS
    let ready: WatchedMediaFile | undefined
    for (const file of files) {
      const previous = this.seen.get(file.path)
      const since = previous?.revision === file.revision ? previous.since : now
      seen.set(file.path, { revision: file.revision, since })
      if (this.attempted.get(file.path) === file.revision) continue
      const remaining = FILE_STABILITY_MS - (now - since)
      if (remaining <= 0) ready ??= file
      else nextCheck = Math.min(nextCheck, remaining)
    }
    this.seen = seen
    for (const path of this.attempted.keys()) {
      if (!seen.has(path)) this.attempted.delete(path)
    }
    return { ready, nextCheck }
  }

  markAttempted(file: WatchedMediaFile): void {
    this.attempted.set(file.path, file.revision)
  }
}
