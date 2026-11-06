import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }))
vi.mock('electron', () => ({
  BrowserWindow: class extends EventEmitter {
    webContents = new EventEmitter()
    show = vi.fn(); focus = vi.fn(); hide = vi.fn()
    isDestroyed = () => false
    loadURL = vi.fn(); loadFile = vi.fn(); setIgnoreMouseEvents = vi.fn()
    close() { this.emit('closed') }
    constructor(options: Record<string, unknown>) { super(); state.options.push(options) }
  },
  screen: { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 } }], getPrimaryDisplay: () => ({ id: 1 }) }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./ui-test-mode', () => ({ isUiTest: false }))
vi.mock('./store', () => ({ store: { get: () => undefined } }))
import { ensureDesktopWindows } from './window-manager'
import { createAppContext } from './app-context'
beforeEach(() => { state.options.length = 0; vi.clearAllMocks() })

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
