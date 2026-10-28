import { useSyncExternalStore } from 'react'
import { UI_LANGUAGE_KEY, resolveUiLanguage, uiLanguagePreference, translateUiText } from '../../../extension/ui-language.mjs'

export type UiLanguagePreference = 'auto' | 'zh-TW' | 'en'
const listeners = new Set<() => void>()
let preference: UiLanguagePreference = 'auto'
try { preference = uiLanguagePreference(localStorage.getItem(UI_LANGUAGE_KEY)) } catch { /* Storage may be unavailable. */ }
const languages = (): readonly string[] => typeof navigator === 'undefined' ? ['en'] : navigator.languages?.length ? navigator.languages : [navigator.language]
export const uiLocale = (): string => resolveUiLanguage(preference, languages())
const notify = (): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = uiLocale()
  listeners.forEach(listener => listener())
}
export const t = (message: string, values: readonly unknown[] = []): string => translateUiText(message, uiLocale(), values)
export function setUiLanguage(value: UiLanguagePreference): void {
  preference = uiLanguagePreference(value)
  try { localStorage.setItem(UI_LANGUAGE_KEY, preference) } catch { /* Keep this session usable. */ }
  notify()
}
export function useUiLanguage(): UiLanguagePreference {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => `${preference}:${uiLocale()}`)
  return preference
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== UI_LANGUAGE_KEY && event.key !== null) return
    try { preference = uiLanguagePreference(localStorage.getItem(UI_LANGUAGE_KEY)) } catch { preference = 'auto' }
    notify()
  })
  window.addEventListener('languagechange', () => { if (preference === 'auto') notify() })
  notify()
}
