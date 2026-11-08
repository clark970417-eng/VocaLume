import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiLanguageChoice } from './interface-language'

const settings = vi.hoisted(() => {
  let choice: { preference: string; changedAt: number } | undefined
  return {
    get: () => choice,
    set: (_key: string, value: typeof choice) => { choice = value },
    has: () => choice !== undefined
  }
})

const electron = vi.hoisted(() => ({
  app: { getPreferredSystemLanguages: () => ['en-US', 'ja-JP'] },
  net: { fetch: vi.fn<typeof fetch>() }
}))
vi.mock('electron', () => electron)
vi.mock('./store', () => ({ store: settings }))

describe('desktop interface language', () => {
  beforeEach(() => {
    vi.resetModules()
    electron.net.fetch.mockReset()
    settings.set('uiLanguageChoice', undefined)
  })

  it('resolves the IP region once for both renderer windows and notifies them together', async () => {
    electron.net.fetch.mockResolvedValue(Response.json({ language: 'ko' }))
    const language = await import('./interface-language')
    const settingsWindow = vi.fn()
    const subtitleWindow = vi.fn()
    language.onUiLanguageStateChanged(settingsWindow)
    language.onUiLanguageStateChanged(subtitleWindow)

    expect(language.getUiLanguageState()).toEqual({ preference: 'auto', changedAt: 0, locale: 'en' })
    expect(language.getUiLanguageState().locale).toBe('en')
    expect(electron.net.fetch).toHaveBeenCalledTimes(1)
    expect(electron.net.fetch).toHaveBeenCalledWith('https://vocalume.vercel.app/api/site-language',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store' }))
    const state = { preference: 'auto', changedAt: 0, locale: 'ko' }
    await vi.waitFor(() => expect(settingsWindow).toHaveBeenCalledExactlyOnceWith(state))
    expect(subtitleWindow).toHaveBeenCalledExactlyOnceWith(state)
  })

  it('keeps manual settings when a pending automatic lookup completes', async () => {
    let resolve!: (response: Response) => void
    electron.net.fetch.mockReturnValue(new Promise(accept => { resolve = accept }))
    const language = await import('./interface-language')
    const listener = vi.fn()
    language.onUiLanguageStateChanged(listener)
    expect(language.getUiLanguageState().locale).toBe('en')
    expect(language.setUiLanguagePreference('ja').locale).toBe('ja')
    resolve(Response.json({ language: 'ko' }))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(language.getUiLanguageState().locale).toBe('ja')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('uses the system language offline and retries when returning to Auto', async () => {
    electron.net.fetch.mockRejectedValueOnce(new Error('Offline'))
    const language = await import('./interface-language')
    const listener = vi.fn()
    language.onUiLanguageStateChanged(listener)
    expect(language.getUiLanguageState().locale).toBe('en')
    expect(language.setUiLanguagePreference('ja').locale).toBe('ja')
    electron.net.fetch.mockResolvedValue(Response.json({ language: 'zh-Hans' }))
    expect(language.setUiLanguagePreference('auto').locale).toBe('en')
    await vi.waitFor(() => expect(listener).toHaveBeenLastCalledWith({
      preference: 'auto', changedAt: expect.any(Number), locale: 'zh-CN'
    }))
    expect(electron.net.fetch).toHaveBeenCalledTimes(2)
  })

  it('migrates an existing manual setting and retains the newest cross-app choice', async () => {
    const language = await import('./interface-language')
    const listener = vi.fn<(choice: UiLanguageChoice) => void>()
    const unsubscribe = language.onUiLanguageChoiceChanged(listener)
    expect(language.updateUiLanguageChoice({ preference: 'ko', changedAt: 0 }).preference).toBe('ko')
    expect(language.updateUiLanguageChoice({ preference: 'ja', changedAt: 0 }).preference).toBe('ko')
    expect(language.updateUiLanguageChoice({ preference: 'ja', changedAt: 10 }).preference).toBe('ja')
    expect(language.updateUiLanguageChoice({ preference: 'en', changedAt: 9 }).preference).toBe('ja')
    expect(() => language.updateUiLanguageChoice({ preference: 'invalid', changedAt: 11 })).toThrow()
    expect(() => language.updateUiLanguageChoice({ preference: 'auto', changedAt: 1.5 })).toThrow()
    expect(listener.mock.calls.map(([choice]) => choice.preference)).toEqual(['ko', 'ja'])
    unsubscribe()
    language.updateUiLanguageChoice({ preference: 'en', changedAt: 11 })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
