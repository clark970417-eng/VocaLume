import { screen, ipcMain, type BrowserWindow } from 'electron'
import type { AppContext } from '../app-context'
import { store } from '../store'
import { getSavedSubtitleBounds, getSubtitleBounds, raiseSubtitleWindow } from '../window-manager'
import { createLogger } from '../logger'

const log = createLogger('ipc:display')

type SubtitleInteractionMode = 'view' | 'drag' | 'edit'
interface Interaction {
  mode: SubtitleInteractionMode
  area: Electron.Rectangle | null
  hovered: boolean
  ignore?: boolean
  shape?: string
  drag?: { x: number; y: number; bounds: Electron.Rectangle }
}
const interactions = new WeakMap<BrowserWindow, Interaction>()
function interactionFor(window: BrowserWindow): Interaction {
  let interaction = interactions.get(window)
  if (!interaction) {
    interaction = { mode: 'view', area: null, hovered: false }
    interactions.set(window, interaction)
  }
  return interaction
}

function updateSubtitleInput(ctx: AppContext, window: BrowserWindow, interaction: Interaction): void {
  const explicit = interaction.mode !== 'view'
  const windows = process.platform === 'win32'
  const area = windows && !explicit ? interaction.area : null
  const ignore = !(explicit || interaction.drag || (windows ? area : interaction.hovered))
  const shape = area ? `${area.x},${area.y},${area.width},${area.height}` : ''
  if (ignore && interaction.ignore !== true) {
    window.setIgnoreMouseEvents(true, { forward: process.platform === 'darwin' })
  }
  if (windows && interaction.shape !== shape) window.setShape(area ? [area] : [])
  if (!ignore && interaction.ignore !== false) window.setIgnoreMouseEvents(false)
  if (windows && (interaction.ignore !== ignore || interaction.shape !== shape)) {
    raiseSubtitleWindow(ctx)
  }
  interaction.ignore = ignore
  interaction.shape = shape
}

export function setSubtitleInteractionMode(ctx: AppContext, mode: SubtitleInteractionMode, enabled: boolean): boolean {
  const window = ctx.subtitleWindow
  if (!window) return false
  const interaction = interactionFor(window)
  const next = enabled ? mode : interaction.mode === mode ? 'view' : interaction.mode
  if (next !== interaction.mode && interaction.drag) {
    interaction.drag = undefined
    rememberSubtitlePosition(ctx, window)
  }
  interaction.mode = next
  interaction.hovered = false
  if (next === 'drag') window.showInactive()
  updateSubtitleInput(ctx, window, interaction)
  for (const target of [window, ctx.mainWindow]) {
    target?.webContents.send('drag-mode-changed', next === 'drag')
    target?.webContents.send('edit-mode-changed', next === 'edit')
  }
  return next === mode
}

export function toggleSubtitleEditMode(ctx: AppContext): boolean {
  const window = ctx.subtitleWindow
  return !!window && setSubtitleInteractionMode(ctx, 'edit', interactionFor(window).mode !== 'edit')
}

function rememberSubtitlePosition(ctx: AppContext, window: BrowserWindow): void {
  const current = window.getBounds()
  const display = screen.getDisplayMatching(current)
  const bounds = getSubtitleBounds(display, current)
  if (bounds.x !== current.x || bounds.y !== current.y || bounds.width !== current.width || bounds.height !== current.height) {
    window.setBounds(bounds)
  }
  const positions = store.get('subtitlePositions') ?? {}
  store.set('subtitlePositions', { ...positions, [String(display.id)]: { x: bounds.x, y: bounds.y } })
  if (store.get('selectedDisplay') !== display.id) {
    store.set('selectedDisplay', display.id)
    ctx.mainWindow?.webContents.send('subtitle-display-changed', display.id)
  }
}

export function resetSubtitlePosition(ctx: AppContext): void {
  const window = ctx.subtitleWindow
  if (!window) return
  const interaction = interactionFor(window)
  interaction.drag = undefined
  const display = screen.getDisplayMatching(window.getBounds())
  const positions = { ...store.get('subtitlePositions') }
  if (String(display.id) in positions) {
    delete positions[String(display.id)]
    store.set('subtitlePositions', positions)
  }
  window.setBounds(getSavedSubtitleBounds(display))
  updateSubtitleInput(ctx, window, interaction)
}

/** Register display and subtitle window IPC handlers */
export function registerDisplayIpc(ctx: AppContext): void {
  ipcMain.handle('get-displays', () => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: d.id === primary.id ? `Display ${i + 1} (Main)` : `Display ${i + 1} (External)`,
      bounds: d.bounds
    }))
  })

  ipcMain.on('move-subtitle-to-display', (_event, displayId: number) => {
    const display = screen.getAllDisplays().find((d) => d.id === displayId)
    if (!display) {
      log.warn(`Display ${displayId} not found, ignoring move request`)
      return
    }
    if (ctx.subtitleWindow) {
      ctx.subtitleWindow.setBounds(getSavedSubtitleBounds(display))
      store.set('selectedDisplay', display.id)
    }
  })

  ipcMain.handle('toggle-subtitle-drag-mode', (_event, enabled: boolean) => {
    if (typeof enabled === 'boolean') setSubtitleInteractionMode(ctx, 'drag', enabled)
  })

  ipcMain.handle('get-subtitle-interaction-mode', () =>
    ctx.subtitleWindow ? interactionFor(ctx.subtitleWindow).mode : 'view')

  ipcMain.on('set-subtitle-caption-area', (event, requested: Electron.Rectangle | null) => {
    const window = ctx.subtitleWindow
    if (!window || event.sender !== window.webContents || process.platform !== 'win32') return
    const interaction = interactionFor(window)
    let area: Electron.Rectangle | null = null
    if (requested && [requested.x, requested.y, requested.width, requested.height].every(Number.isFinite)) {
      const [width, height] = window.getContentSize()
      const x = Math.max(0, Math.floor(requested.x))
      const y = Math.max(0, Math.floor(requested.y))
      const right = Math.min(width, Math.ceil(requested.x + requested.width))
      const bottom = Math.min(height, Math.ceil(requested.y + requested.height))
      if (right > x && bottom > y) area = { x, y, width: right - x, height: bottom - y }
    }
    interaction.area = area
    updateSubtitleInput(ctx, window, interaction)
  })

  ipcMain.on('set-subtitle-caption-hover', (event, hovered: boolean) => {
    const window = ctx.subtitleWindow
    if (!window || event.sender !== window.webContents || process.platform !== 'darwin' || typeof hovered !== 'boolean') return
    const interaction = interactionFor(window)
    interaction.hovered = hovered
    updateSubtitleInput(ctx, window, interaction)
  })

  ipcMain.on('subtitle-pointer-drag', (event, phase: 'start' | 'move' | 'end', x: number, y: number) => {
    const window = ctx.subtitleWindow
    if (!window || event.sender !== window.webContents || !Number.isFinite(x) || !Number.isFinite(y) ||
        Math.abs(x) > 100_000 || Math.abs(y) > 100_000) return
    const interaction = interactionFor(window)
    if (phase === 'start') {
      if (interaction.mode !== 'edit') interaction.drag = { x, y, bounds: window.getBounds() }
      return
    }
    const drag = interaction.drag
    if (!drag || (phase !== 'move' && phase !== 'end')) return
    const nextX = Math.round(drag.bounds.x + x - drag.x)
    const nextY = Math.round(drag.bounds.y + y - drag.y)
    const [currentX, currentY] = window.getPosition()
    if (nextX !== currentX || nextY !== currentY) window.setPosition(nextX, nextY)
    if (phase === 'end') {
      interaction.drag = undefined
      if (nextX !== drag.bounds.x || nextY !== drag.bounds.y) rememberSubtitlePosition(ctx, window)
      updateSubtitleInput(ctx, window, interaction)
    }
  })

  // Reset subtitle position to default for the current display (#509)
  ipcMain.handle('reset-subtitle-position', () => resetSubtitlePosition(ctx))

  ipcMain.handle('toggle-subtitle-edit-mode', (_event, enabled: boolean) => {
    if (typeof enabled === 'boolean') setSubtitleInteractionMode(ctx, 'edit', enabled)
  })

  // Forward translation result to subtitle window (from renderer)
  ipcMain.on('translation-result', (_event, data) => {
    ctx.subtitleWindow?.webContents.send('translation-result', data)
  })
}
