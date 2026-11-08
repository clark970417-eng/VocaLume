import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>>, obs: false, obsOnly: false }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    webContents = { send: vi.fn() }
    show = vi.fn(); focus = vi.fn(); hide = vi.fn()
    isDestroyed = () => false
    loadURL = vi.fn(); loadFile = vi.fn(); setIgnoreMouseEvents = vi.fn()
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
import { ensureDesktopWindows, syncDesktopSubtitleWindow } from './window-manager'
import { createAppContext } from './app-context'
beforeEach(() => { state.options.length = 0; state.obs = false; state.obsOnly = false; vi.clearAllMocks() })

it('creates a hidden TTS renderer on demand and never duplicates windows', () => {
  const ctx = createAppContext()
  expect(ctx.mainWindow).toBeNull()
  ensureDesktopWindows(ctx, false)
  expect(state.options.map(options => options.show)).toEqual([false, false])
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
