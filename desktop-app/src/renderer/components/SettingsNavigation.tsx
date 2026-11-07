import { t } from '../ui-language'
import React from 'react'

export const SETTINGS_TABS = [
  { id: 'translate', label: 'Live translation' },
  { id: 'files', label: 'File translation' },
  { id: 'subtitles', label: 'Subtitles & OBS' },
  { id: 'models', label: 'Models' },
  { id: 'more', label: 'Advanced settings' }
] as const
export type SettingsTab = typeof SETTINGS_TABS[number]['id']

export function SettingsNavigation({ selected, onSelect }: {
  selected: SettingsTab
  onSelect: (tab: SettingsTab) => void
}): React.JSX.Element {
  return <nav className="settings-tabs" role="tablist" aria-label={t("Settings sections")}>
    {SETTINGS_TABS.map(({ id, label }, index) => <button
      key={id} id={`settings-tab-${id}`} type="button" role="tab"
      aria-selected={selected === id} aria-controls={`settings-panel-${id}`}
      tabIndex={selected === id ? 0 : -1}
      onClick={() => onSelect(id)}
      onKeyDown={(event) => {
        const next = ({ ArrowRight: (index + 1) % SETTINGS_TABS.length,
          ArrowLeft: (index + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length,
          Home: 0, End: SETTINGS_TABS.length - 1 } as Record<string, number>)[event.key]
        if (next === undefined) return
        event.preventDefault()
        const tab = SETTINGS_TABS[next].id
        onSelect(tab)
        document.getElementById(`settings-tab-${tab}`)?.focus()
      }}
    >{t(label)}</button>)}
  </nav>
}
