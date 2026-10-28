import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'
import { ALL_LANGUAGES, LANGUAGE_LABELS, selectStyle } from './shared'
import type { Language, SourceLanguage } from './shared'

interface LanguageSettingsProps {
  sourceLanguage: SourceLanguage
  onSourceLanguageChange: (v: SourceLanguage) => void
  targetLanguage: Language
  onTargetLanguageChange: (v: Language) => void
  disabled: boolean
}

export function LanguageSettings({
  sourceLanguage,
  onSourceLanguageChange,
  targetLanguage,
  onTargetLanguageChange,
  disabled
}: LanguageSettingsProps): React.JSX.Element {
  return (
    <Section label={t("Language")}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>{t("Spoken language")} </div>
          <select
            value={sourceLanguage}
            onChange={(e) => {
              const newSource = e.target.value as SourceLanguage
              onSourceLanguageChange(newSource)
              if (newSource !== 'auto' && newSource === targetLanguage) {
                onTargetLanguageChange(newSource === 'en' ? 'ja' : 'en')
              }
            }}
            style={selectStyle}
            disabled={disabled}
            aria-label={t("Source language")}
          >
            <option value="auto">{t("Auto-detect")}</option>
            {ALL_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{t(LANGUAGE_LABELS[lang])}</option>
            ))}
          </select>
        </div>
        <button type="button" aria-label={t("Swap translation languages")}
          title={sourceLanguage === 'auto' ? t("Choose a spoken language before swapping") : t("Swap languages")}
          disabled={disabled || sourceLanguage === 'auto'}
          onClick={() => {
            if (sourceLanguage === 'auto') return
            onSourceLanguageChange(targetLanguage)
            onTargetLanguageChange(sourceLanguage)
          }}
          style={{ minWidth: 36, height: 40, padding: 0, background: 'transparent', border: 0, color: '#8ce4d4', fontSize: 22, cursor: 'pointer' }}>⇄</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>{t("Translate into")} </div>
          <select
            value={targetLanguage}
            onChange={(e) => {
              const newTarget = e.target.value as Language
              onTargetLanguageChange(newTarget)
              if (sourceLanguage !== 'auto' && sourceLanguage === newTarget) {
                onSourceLanguageChange(newTarget === 'en' ? 'ja' : 'en')
              }
            }}
            style={selectStyle}
            disabled={disabled}
            aria-label={t("Target language")}
          >
            {ALL_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{t(LANGUAGE_LABELS[lang])}</option>
            ))}
          </select>
        </div>
      </div>
    </Section>
  )
}
