import { screen, type BrowserWindow, type Rectangle } from 'electron'

const POLL_MS = 50
const ENTER_MARGIN = 12
const LEAVE_MARGIN = 18
const trackers = new WeakMap<BrowserWindow, (region: Rectangle | null) => void>()

export function isSubtitleHoverRegion(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const { x, y, width, height } = value as Rectangle
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
}

export function setSubtitleHoverRegion(window: BrowserWindow, region: Rectangle | null): void {
  const existing = trackers.get(window)
  if (existing) {
    existing(region)
    return
  }
  if (!region) return

  let bounds = region
  let near = false
  let timer: ReturnType<typeof setInterval> | undefined

  const report = (next: boolean): void => {
    if (near === next) return
    near = next
    if (!window.webContents.isDestroyed()) window.webContents.send('subtitle-pointer-near', near)
  }

  const poll = (): void => {
    if (!window.isVisible() || window.isMinimized()) return
    let cursor: Electron.Point
    try {
      cursor = screen.getCursorScreenPoint()
    } catch {
      // Global pointer coordinates are unavailable on some display servers.
      stop()
      return
    }
    const origin = window.getContentBounds()
    const zoom = window.webContents.getZoomFactor()
    const x = (cursor.x - origin.x) / zoom
    const y = (cursor.y - origin.y) / zoom
    const margin = near ? LEAVE_MARGIN : ENTER_MARGIN
    report(
      x >= bounds.x - margin && x < bounds.x + bounds.width + margin &&
      y >= bounds.y - margin && y < bounds.y + bounds.height + margin
    )
  }

  const stop = (): void => {
    clearInterval(timer)
    timer = undefined
    report(false)
  }
  const start = (): void => {
    if (!window.isVisible() || window.isMinimized()) return
    timer ??= setInterval(poll, POLL_MS)
    poll()
  }
  const dispose = (): void => {
    clearInterval(timer)
    trackers.delete(window)
    window.off('show', start)
    window.off('restore', start)
    window.off('hide', stop)
    window.off('minimize', stop)
    window.off('closed', dispose)
  }

  window.on('show', start)
  window.on('restore', start)
  window.on('hide', stop)
  window.on('minimize', stop)
  window.once('closed', dispose)
  trackers.set(window, (next) => {
    if (!next) {
      stop()
      dispose()
      return
    }
    bounds = next
    start()
  })
  start()
}
