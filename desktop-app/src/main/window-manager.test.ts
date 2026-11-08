import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>>, obs: false, obsOnly: false }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    webContents = { send: vi.fn() }
    show = vi.fn(); focus = vi.fn(); hide = vi.fn()
    isDestroyed = () => false
    isFocused = vi.fn(() => false)
    isAlwaysOnTop = vi.fn(() => false)
    isVisible = vi.fn(() => true)
    moveTop = vi.fn()
    loadURL = vi.fn(); loadFile = vi.fn(); setIgnoreMouseEvents = vi.fn(); setAlwaysOnTop = vi.fn()
    close() { this.emit('closed') }
    destroy() { this.close() }
    constructor(options: Record<string, unknown>) { super(); state.options.push(options) }
  },
  screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 } }], getPrimaryDisplay: () => ({ id: 1 }) }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./ui-test-mode', () => ({ isUiTest: false }))
vi.mock('./store', () => ({ store: { get: (key: string) => key === 'obsHideDesktopOverlay' ? state.obsOnly : undefined } }))
vi.mock('./obs-captions', () => ({ obsCaptionStatus: () => ({ mode: state.obs ? 'bilingual' : 'off' }) }))
import { ensureDesktopWindows, getSubtitleBounds, raiseSubtitleWindow, syncDesktopSubtitleWindow } from './window-manager'
import { createAppContext } from './app-context'
beforeEach(() => { state.options.length = 0; state.obs = false; state.obsOnly = false; vi.clearAllMocks() })

it('clamps saved caption positions above the taskbar and within a moved monitor', () => {
  const display = { bounds: { x: 0, y: 0, width: 1536, height: 864 }, workArea: { x: 0, y: 0, width: 1536, height: 824 }, scaleFactor: 1.25 } as Electron.Display
  expect(getSubtitleBounds(display, { x: 5000, y: 614 })).toEqual({ x: 246, y: 574, width: 1290, height: 250 })
  expect(getSubtitleBounds(display, { x: 83, y: 278 })).toMatchObject({ x: 83, y: 278 })
  expect(getSubtitleBounds(display, { x: 0, y: -1000 }).y).toBe(0)
  expect(getSubtitleBounds(display, undefined, 'top')).toMatchObject({ x: 123, y: 0 })
})

it('creates a hidden TTS renderer on demand and never duplicates windows', () => {
  const ctx = createAppContext()
  expect(ctx.mainWindow).toBeNull()
  ensureDesktopWindows(ctx, false)
  expect(state.options.map(options => options.show)).toEqual([false, false])
  expect(state.options[1].webPreferences).toMatchObject({ backgroundThrottling: false })
  expect(ctx.subtitleWindow!.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  ensureDesktopWindows(ctx, false)
  expect(state.options).toHaveLength(2)
  ensureDesktopWindows(ctx)
  expect(ctx.mainWindow!.show).toHaveBeenCalledTimes(1)
  expect(ctx.mainWindow!.focus).toHaveBeenCalledTimes(1)
})

it('opens settings during browser capture without showing a duplicate desktop subtitle overlay', () => {
  const ctx = createAppContext(); ctx.extensionConnected = true
  ensureDesktopWindows(ctx)
  expect(state.options.map(options => options.show)).toEqual([true, false])
  ctx.mainWindow!.close()
  expect(ctx.mainWindow).toBeNull(); expect(ctx.subtitleWindow).toBeNull()
  ensureDesktopWindows(ctx)
  expect(state.options).toHaveLength(4)
})

it.skipIf(process.platform !== 'win32')('keeps focused controls clickable when a subtitle changes its hit area', () => {
  const ctx = createAppContext()
  ensureDesktopWindows(ctx, false)
  const controls = ctx.mainWindow!
  vi.mocked(controls.isFocused).mockReturnValue(true)
  raiseSubtitleWindow(ctx)
  expect(ctx.subtitleWindow!.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  expect(controls.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  expect(controls.moveTop).toHaveBeenCalledOnce()
  vi.mocked(controls.isAlwaysOnTop).mockReturnValue(true)
  controls.emit('blur')
  expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
})

it('releases the desktop overlay during OBS-only output and restores it when OBS stops', () => {
  const ctx = createAppContext()
  state.obs = true
  state.obsOnly = true
  ensureDesktopWindows(ctx)
  expect(state.options).toHaveLength(1)
  expect(ctx.subtitleWindow).toBeNull()

  state.obs = false
  syncDesktopSubtitleWindow(ctx)
  expect(ctx.subtitleWindow).not.toBeNull()
  state.obs = true
  syncDesktopSubtitleWindow(ctx)
  expect(ctx.subtitleWindow).toBeNull()
  expect(ctx.mainWindow).not.toBeNull()

  state.obsOnly = false
  syncDesktopSubtitleWindow(ctx)
  expect(ctx.subtitleWindow).not.toBeNull()
})
