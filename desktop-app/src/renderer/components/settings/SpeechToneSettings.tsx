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
  return <Section label="Speech tone · 語氣與笑聲">
    <label htmlFor="speech-tone">Laughter style · 笑聲樣式</label>
    <select id="speech-tone" value={mode} disabled={busy} onChange={event => void change(event.target.value)}
      style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, background: '#1e293b', color: '#f1f5f9', borderRadius: 8 }}>
      <option value="off">Off · 關閉</option><option value="natural">Natural · 自然標記（笑）</option>
      <option value="ww">ww</option><option value="笑">笑</option><option value="草">草</option>
    </select>
    <p style={{ color: '#94a3b8', fontSize: 13 }}>Preserves ? and ! from recognized speech. macOS also checks for clear laughter locally; other systems use explicit transcript markers. Pauses audio analysis when the computer is hot. Cannot identify who is laughing.</p>
    {error && <p role="alert">{error}</p>}
  </Section>
}
