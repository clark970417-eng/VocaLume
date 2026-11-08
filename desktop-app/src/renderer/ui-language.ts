import { useSyncExternalStore } from 'react'
import { UI_LANGUAGE_KEY, resolveUiLanguage, uiLanguagePreference, translateUiText, type UiLocale } from '../../../extension/ui-language.mjs'
import type { UiLanguageState } from '../preload/ui-language'

export type UiLanguagePreference = UiLanguageState['preference']
const listeners = new Set<() => void>()
let preference: UiLanguagePreference = 'auto'
let resolvedLocale: UiLocale | undefined
let revision = 0
try { preference = uiLanguagePreference(localStorage.getItem(UI_LANGUAGE_KEY)) } catch { /* Storage may be unavailable. */ }
const languages = (): readonly string[] => typeof navigator === 'undefined' ? ['en'] : navigator.languages?.length ? navigator.languages : [navigator.language]
export const uiLocale = (): UiLocale => resolvedLocale ?? resolveUiLanguage(preference, languages())
const notify = (): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = uiLocale()
  listeners.forEach(listener => listener())
}
export const t = (message: string, values: readonly unknown[] = []): string => translateUiText(message, uiLocale(), values)

function storeLegacyPreference(): void {
  try { localStorage.setItem(UI_LANGUAGE_KEY, preference) } catch { /* Keep this session usable. */ }
}

function applyState(state: UiLanguageState): void {
  revision++
  preference = state.preference
  resolvedLocale = state.locale
  storeLegacyPreference()
  notify()
}

export function setUiLanguage(value: UiLanguagePreference): void {
  const requestRevision = ++revision
  preference = uiLanguagePreference(value)
  resolvedLocale = undefined
  storeLegacyPreference()
  notify()
  void window.api?.setUiLanguage?.(preference).then(state => {
    if (revision === requestRevision) applyState(state)
  }).catch(() => { /* The renderer can keep using the chosen language. */ })
}
export function useUiLanguage(): UiLanguagePreference {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => `${preference}:${uiLocale()}`)
  return preference
}
if (typeof window !== 'undefined') {
  const api = (window as { api?: Partial<Window['api']> }).api
  api?.onUiLanguageChanged?.(applyState)
  const refresh = (): void => {
    const requestRevision = revision
    void api?.getUiLanguage?.(preference).then(state => {
      if (revision === requestRevision) applyState(state)
    }).catch(() => { /* The browser language is the fallback. */ })
  }
  window.addEventListener('storage', event => {
    if (api?.getUiLanguage || (event.key !== UI_LANGUAGE_KEY && event.key !== null)) return
    try { preference = uiLanguagePreference(localStorage.getItem(UI_LANGUAGE_KEY)) } catch { preference = 'auto' }
    notify()
  })
  window.addEventListener('languagechange', () => {
    if (preference !== 'auto') return
    if (api?.getUiLanguage) refresh()
    else notify()
  })
  notify()
  refresh()
}
