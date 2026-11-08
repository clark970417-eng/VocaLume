import { isUiTest } from './ui-test-mode'
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { store } from './store'
import { obsCaptionStatus } from './obs-captions'
import type { AppContext } from './app-context'

/** Calculate subtitle window height based on display scale factor */
export function getSubtitleHeight(display: Electron.Display): number {
  // Base height for 3 subtitle lines at default font size (30px)
  const baseHeight = 200
  const scaleFactor = display.scaleFactor ?? 1
  // Scale for HiDPI displays but cap at 2x to avoid excessively tall windows
  return Math.round(baseHeight * Math.min(scaleFactor, 2))
}

/** Keep the entire overlay above taskbars and inside the selected monitor. */
export function getSubtitleBounds(
  display: Electron.Display, saved?: { x: number; y: number }, anchor = 'bottom'
): Electron.Rectangle {
  const area = display.workArea ?? display.bounds
  const height = Math.min(getSubtitleHeight(display), area.height)
  const width = Math.min(area.width, Math.max(540, Math.round(area.width * 0.84)))
  const maxX = area.x + area.width - width
  const maxY = area.y + area.height - height
  const x = saved && Number.isFinite(saved.x) ? saved.x : area.x + Math.round((area.width - width) / 2)
  const y = saved && Number.isFinite(saved.y) ? saved.y : anchor === 'top' ? area.y : maxY
  return {
    x: Math.round(Math.max(area.x, Math.min(x, maxX))),
    y: Math.round(Math.max(area.y, Math.min(y, maxY))),
    width,
    height
  }
}

export function getSavedSubtitleBounds(display: Electron.Display): Electron.Rectangle {
  return getSubtitleBounds(display, store.get('subtitlePositions')?.[String(display.id)], store.get('subtitleSettings')?.position)
}

function prioritizeWindowsControls(ctx: AppContext): void {
  const controls = ctx.mainWindow
  if (process.platform !== 'win32' || !controls?.isFocused() || !ctx.subtitleWindow?.isVisible()) return
  if (!controls.isAlwaysOnTop()) controls.setAlwaysOnTop(true, 'screen-saver')
  controls.moveTop()
}

/** Keep the overlay above playback, and keep its own focused controls reachable. */
export function raiseSubtitleWindow(ctx: AppContext, prioritizeSubtitle = false): void {
  ctx.subtitleWindow?.setAlwaysOnTop(true, 'screen-saver')
  if (prioritizeSubtitle && process.platform === 'win32') ctx.subtitleWindow?.moveTop()
  else prioritizeWindowsControls(ctx)
}

export function createMainWindow(ctx: AppContext, show = true): void {
  ctx.mainWindow = new BrowserWindow({
    show: show && !isUiTest,
    width: 520,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    ctx.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    ctx.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const controls = ctx.mainWindow
  if (process.platform === 'win32') {
    controls.on('focus', () => prioritizeWindowsControls(ctx))
    controls.on('blur', () => {
      if (controls.isAlwaysOnTop()) controls.setAlwaysOnTop(false)
    })
  }
  ctx.mainWindow.on('closed', () => {
    ctx.mainWindow = null
    ctx.subtitleWindow?.close()
  })
}

export function createSubtitleWindow(ctx: AppContext, show = true): void {
  const displays = screen.getAllDisplays()
  const savedDisplayId = store.get('selectedDisplay')
  const savedDisplay = savedDisplayId ? displays.find((d) => d.id === savedDisplayId) : null
  const primaryId = screen.getPrimaryDisplay().id
  const externalDisplay = displays.find((d) => d.id !== primaryId)
  const targetDisplay = savedDisplay || externalDisplay || displays[0]

  const window = new BrowserWindow({
    show: show && !isUiTest,
    ...getSavedSubtitleBounds(targetDisplay),
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      // Captions must keep painting while the user watches another application.
      backgroundThrottling: false,
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  ctx.subtitleWindow = window

  window.setIgnoreMouseEvents(true, { forward: process.platform === 'darwin' })
  // Windows can lose the constructor's topmost style when click-through is set.
  // Apply the level after that change and restore it whenever the overlay shows.
  const keepOnTop = (): void => raiseSubtitleWindow(ctx)
  keepOnTop()
  window.on('show', keepOnTop)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/subtitle`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/subtitle' })
  }

  window.on('closed', () => {
    if (ctx.subtitleWindow === window) ctx.subtitleWindow = null
  })
}

export function syncDesktopSubtitleWindow(ctx: AppContext, show = true): void {
  const window = ctx.subtitleWindow
  if (store.get('obsHideDesktopOverlay') && obsCaptionStatus().mode !== 'off') {
    if (window && !window.isDestroyed()) {
      window.destroy()
      ctx.mainWindow?.webContents.send('drag-mode-changed', false)
      ctx.mainWindow?.webContents.send('edit-mode-changed', false)
    }
    return
  }
  if (ctx.mainWindow && (!window || window.isDestroyed())) {
    createSubtitleWindow(ctx, show && !ctx.extensionConnected)
  }
}

/** Browser captions need no renderer, desktop microphone or audio device
 * enumeration. Settings, desktop capture and TTS create their windows on demand. */
export function ensureDesktopWindows(ctx: AppContext, show = true): BrowserWindow {
  if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
    createMainWindow(ctx, show)
  }
  syncDesktopSubtitleWindow(ctx, show)
  if (show && !isUiTest) { ctx.mainWindow!.show(); ctx.mainWindow!.focus() }
  return ctx.mainWindow!
}

/** Register display-change event handlers. Returns a cleanup function that removes the listeners. */
export function registerDisplayHandlers(ctx: AppContext): () => void {
  // #46: reposition subtitle window when external display is disconnected
  const onDisplayRemoved = (_event: Electron.Event, removed: Electron.Display): void => {
    if (!ctx.subtitleWindow) return
    const current = store.get('selectedDisplay')
    const bounds = ctx.subtitleWindow.getBounds()
    const wasSelected = current === removed.id || (
      !current && bounds.x >= removed.bounds.x && bounds.x < removed.bounds.x + removed.bounds.width &&
      bounds.y >= removed.bounds.y && bounds.y < removed.bounds.y + removed.bounds.height)
    if (wasSelected) {
      const primary = screen.getPrimaryDisplay()
      store.set('selectedDisplay', primary.id)
      ctx.subtitleWindow.setBounds(getSavedSubtitleBounds(primary))
      ctx.mainWindow?.webContents.send('subtitle-display-changed', primary.id)
    }
    ctx.mainWindow?.webContents.send('displays-changed')
  }

  const onDisplayAdded = (): void => {
    ctx.mainWindow?.webContents.send('displays-changed')
  }

  screen.on('display-removed', onDisplayRemoved)
  screen.on('display-added', onDisplayAdded)
  const onDisplayMetricsChanged = (_event: Electron.Event, display: Electron.Display): void => {
    const window = ctx.subtitleWindow
    if (window && screen.getDisplayMatching(window.getBounds()).id === display.id) {
      window.setBounds(getSavedSubtitleBounds(display))
    }
    onDisplayAdded()
  }
  screen.on('display-metrics-changed', onDisplayMetricsChanged)

  return () => {
    screen.removeListener('display-removed', onDisplayRemoved)
    screen.removeListener('display-added', onDisplayAdded)
    screen.removeListener('display-metrics-changed', onDisplayMetricsChanged)
  }
}
