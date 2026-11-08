import type { UiLocale } from '../../../extension/ui-language.mjs'

export interface UiLanguageChoice {
  preference: UiLocale | 'auto'
  changedAt: number
}

export interface UiLanguageState extends UiLanguageChoice {
  locale: UiLocale
}
