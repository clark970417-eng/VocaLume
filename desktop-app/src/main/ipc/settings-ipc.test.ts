import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ values: new Map<string, unknown>(), handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({ app: { getPath: () => '' }, ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => state.handlers.set(name, handler) }, dialog: {}, shell: {} }))
vi.mock('../store', () => ({
  store: {
    get store() { return Object.fromEntries(state.values) },
    set(settings: Record<string, unknown>) {
      for (const [key, value] of Object.entries(settings)) state.values.set(key, value)
    }
  }
}))
vi.mock('../obs-captions', () => ({ configureObsCaptions: vi.fn(), obsCaptionStatus: vi.fn() }))
vi.mock('./display-ipc', () => ({ resetSubtitlePosition: vi.fn() }))
import { registerSettingsIpc } from './settings-ipc'
import type { AppContext } from '../app-context'

it('returns the saved system audio preference to the renderer after restart', () => {
  registerSettingsIpc({} as AppContext)
  state.handlers.get('save-settings')!({}, { audioSource: 'system' })
  // A new renderer reloads preferences through get-settings, not through the store.
  expect(state.handlers.get('get-settings')!({}).audioSource).toBe('system')
})
