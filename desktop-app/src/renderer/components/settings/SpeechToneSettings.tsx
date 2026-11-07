import { t } from '../../ui-language'
import React, { useEffect, useState } from 'react'
import { Section } from './Section'
import { isSpeechToneMode, type SpeechToneMode } from '../../../pipeline/SpeechTone'

export function SpeechToneSettings(): React.JSX.Element {
  const [mode, setMode] = useState<SpeechToneMode>('off')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    window.api.getSettings().then(settings => {
      if (isSpeechToneMode(settings.speechToneMode)) setMode(settings.speechToneMode)
    }).catch(() => setError('Unable to load tone settings.')).finally(() => setBusy(false))
  }, [])
  const change = async (value: string): Promise<void> => {
    if (!isSpeechToneMode(value)) return
    setBusy(true); setError('')
    try { await window.api.saveSettings({ speechToneMode: value }); setMode(value) }
    catch { setError('Unable to save. Please try again.') }
    finally { setBusy(false) }
  }
  return <Section label={t("Tone & laughter")}>
    <label htmlFor="speech-tone">{t("Laughter style")}</label>
    <select id="speech-tone" value={mode} disabled={busy} onChange={event => void change(event.target.value)}
      style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, background: '#1e293b', color: '#f1f5f9', borderRadius: 8 }}>
      <option value="off">{t("Off")}</option><option value="natural">{t("Natural laughter markers")}</option>
      <option value="ww">{t("ww")}</option><option value="笑">笑</option><option value="草">草</option>
    </select>
    {error && <p role="alert">{t(error)}</p>}
  </Section>
}
