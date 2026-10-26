import React from 'react'

export const SETTINGS_TABS = [
  { id: 'translate', label: 'Translate' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'models', label: 'Models' },
  { id: 'more', label: 'More' }
] as const
export type SettingsTab = typeof SETTINGS_TABS[number]['id']

export function SettingsNavigation({ selected, onSelect }: {
  selected: SettingsTab
  onSelect: (tab: SettingsTab) => void
}): React.JSX.Element {
  return <nav className="settings-tabs" role="tablist" aria-label="Settings sections">
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
    >{label}</button>)}
  </nav>
}
