import { expect, it, vi } from 'vitest'
import type { AppContext } from './app-context'

const { handlers, updater, openExternal, setStore } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  updater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  },
  openExternal: vi.fn(),
  setStore: vi.fn()
}))

vi.mock('electron-updater', () => ({ autoUpdater: updater }))
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1.0.0' },
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) },
  shell: { openExternal }
}))
vi.mock('./store', () => ({ store: { get: () => 'stable', set: setStore } }))
vi.mock('./mdm-config', () => ({ getMdmConfig: () => ({ autoUpdateDisabled: true }) }))
vi.mock('./logger', () => ({ createLogger: () => ({ info: vi.fn() }) }))

import { initAutoUpdater, registerUpdateHandlers } from './auto-updater'

it('blocks automatic and renderer-initiated update actions under machine policy', async () => {
  const ctx = { mainWindow: null } as AppContext
  initAutoUpdater(ctx)
  registerUpdateHandlers(ctx)

  expect(updater.autoInstallOnAppQuit).toBe(false)
  expect(updater.on).not.toHaveBeenCalled()
  expect(handlers.get('update-get-status')?.()).toMatchObject({ managedDisabled: true })
  for (const channel of ['update-check', 'update-download', 'update-install', 'update-set-channel']) {
    expect(await handlers.get(channel)?.(null, 'beta')).toEqual({ error: 'Auto-updates managed by organization' })
  }
  expect(updater.checkForUpdates).not.toHaveBeenCalled()
  expect(updater.downloadUpdate).not.toHaveBeenCalled()
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  expect(openExternal).not.toHaveBeenCalled()
  expect(setStore).not.toHaveBeenCalled()
})
