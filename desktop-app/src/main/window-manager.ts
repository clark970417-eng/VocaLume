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

  const subtitleHeight = getSubtitleHeight(targetDisplay)

  // Restore saved position for this display if available (#509)
  const savedPositions = (store.get('subtitlePositions' as never) as Record<string, { x: number; y: number }> | undefined) || {}
  const savedPos = savedPositions[String(targetDisplay.id)]
  const initialX = savedPos?.x ?? targetDisplay.bounds.x
  const initialY = savedPos?.y ?? (targetDisplay.bounds.y + targetDisplay.bounds.height - subtitleHeight)

  const window = new BrowserWindow({
    show: show && !isUiTest,
    x: initialX,
    y: initialY,
    width: targetDisplay.bounds.width,
    height: subtitleHeight,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  ctx.subtitleWindow = window

  window.setIgnoreMouseEvents(true, { forward: true })

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
  const onDisplayRemoved = (): void => {
    if (!ctx.subtitleWindow) return
    const primaryDisplay = screen.getPrimaryDisplay()
    const h = getSubtitleHeight(primaryDisplay)
    ctx.subtitleWindow.setBounds({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y + primaryDisplay.bounds.height - h,
      width: primaryDisplay.bounds.width,
      height: h
    })
    // #64: notify renderer to refresh display list
    ctx.mainWindow?.webContents.send('displays-changed')
  }

  const onDisplayAdded = (): void => {
    ctx.mainWindow?.webContents.send('displays-changed')
  }

  screen.on('display-removed', onDisplayRemoved)
  screen.on('display-added', onDisplayAdded)

  return () => {
    screen.removeListener('display-removed', onDisplayRemoved)
    screen.removeListener('display-added', onDisplayAdded)
  }
}
