import { t } from '../../ui-language'
import React, { useState } from 'react'
import { Section } from './Section'

const links = {
  bug: 'https://github.com/clark970417-eng/VocaLume/issues/new?template=bug-report.yml',
  translation: 'https://github.com/clark970417-eng/VocaLume/issues/new?template=translation-quality.yml',
  privacy: 'https://github.com/clark970417-eng/VocaLume/blob/main/docs/legal/privacy.md'
}

const actionStyle: React.CSSProperties = {
  minHeight: '40px', padding: '7px 10px', borderRadius: '6px', border: '1px solid #475569',
  background: '#1e293b', color: '#e2e8f0', cursor: 'pointer', fontSize: '12px'
}

export function SupportSettings(): React.JSX.Element {
  const [message, setMessage] = useState('')
  const open = async (url: string): Promise<void> => {
    const result = await window.api.openSupportUrl(url)
    if (result.error) setMessage(result.error)
  }
  const exportDiagnostics = async (): Promise<void> => {
    const result = await window.api.exportDiagnostics()
    if (result.success) setMessage('Diagnostics exported. Review the file before attaching it to a report.')
    else if (result.error) setMessage(result.error)
  }
  return (
    <Section label={t("Support & Privacy")}>
      <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.5 }}>{t("Diagnostic exports exclude API keys, microphone audio, captions, and translation text.")} </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button style={actionStyle} onClick={exportDiagnostics}>{t("Export Diagnostics")}</button>
        <button style={actionStyle} onClick={() => open(links.bug)}>{t("Report a Problem")}</button>
        <button style={actionStyle} onClick={() => open(links.translation)}>{t("Report Translation Quality")}</button>
        <button style={actionStyle} onClick={() => open(links.privacy)}>{t("Privacy Information")}</button>
      </div>
      {message && <p role="status" style={{ color: '#93c5fd', fontSize: '12px' }}>{t(message)}</p>}
    </Section>
  )
}
