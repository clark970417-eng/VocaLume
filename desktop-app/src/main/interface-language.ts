import { app, net } from 'electron'
import {
  lookupRegionalUiLanguage,
  resolveUiLanguage,
  uiLanguagePreference,
  type UiLocale
} from '../../../extension/ui-language.mjs'
import { store } from './store'
import type { UiLanguageChoice, UiLanguageState } from '../preload/ui-language'
export type { UiLanguageChoice, UiLanguageState } from '../preload/ui-language'

const choiceListeners = new Set<(choice: UiLanguageChoice) => void>()
const stateListeners = new Set<(state: UiLanguageState) => void>()
let regionalLocale: UiLocale | null = null
let regionalLookup: Promise<void> | undefined

export function getUiLanguageChoice(): UiLanguageChoice {
  return store.get('uiLanguageChoice') ?? { preference: 'auto', changedAt: 0 }
}

/** Incoming browser choices and existing renderer preferences share the same
 * persisted setting. Ignore stale updates and avoid echoing equal choices. */
export function updateUiLanguageChoice(value: unknown): UiLanguageChoice {
  if (typeof value !== 'object' || value === null || !('preference' in value) || !('changedAt' in value)) {
    throw new Error('Invalid interface language choice')
  }
  const { preference, changedAt } = value
  if (uiLanguagePreference(preference) !== preference || typeof changedAt !== 'number'
    || !Number.isSafeInteger(changedAt) || changedAt < 0 || changedAt >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid interface language choice')
  }
  const current = getUiLanguageChoice()
  const legacyChoice = changedAt === 0 && preference !== 'auto' && !store.has('uiLanguageChoice')
  if (changedAt <= current.changedAt && !legacyChoice) return current

  const next = { preference: preference as UiLanguageChoice['preference'], changedAt }
  store.set('uiLanguageChoice', next)
  if (preference === 'auto' && current.preference !== 'auto') {
    regionalLocale = null
    regionalLookup = undefined
  }
  choiceListeners.forEach(listener => listener(next))
  publishState()
  return next
}

export function setUiLanguagePreference(value: unknown): UiLanguageState {
  updateUiLanguageChoice({
    preference: value,
    changedAt: Math.max(Date.now(), getUiLanguageChoice().changedAt + 1)
  })
  return getUiLanguageState()
}

export function onUiLanguageChoiceChanged(listener: (choice: UiLanguageChoice) => void): () => void {
  choiceListeners.add(listener)
  return () => { choiceListeners.delete(listener) }
}

export function onUiLanguageStateChanged(listener: (state: UiLanguageState) => void): () => void {
  stateListeners.add(listener)
  return () => { stateListeners.delete(listener) }
}

export function getUiLanguageState(): UiLanguageState {
  const choice = getUiLanguageChoice()
  if (choice.preference === 'auto' && !regionalLookup) {
    const lookup = lookupRegionalUiLanguage({ fetch: (url, options) => net.fetch(String(url), options) })
      .then(locale => {
        if (regionalLookup !== lookup) return
        regionalLocale = locale
        if (locale && getUiLanguageChoice().preference === 'auto') publishState()
      })
    regionalLookup = lookup
  }
  return {
    ...choice,
    locale: choice.preference === 'auto' && regionalLocale
      ? regionalLocale
      : resolveUiLanguage(choice.preference, app.getPreferredSystemLanguages())
  }
}

function publishState(): void {
  if (!stateListeners.size) return
  const state = getUiLanguageState()
  stateListeners.forEach(listener => listener(state))
}
