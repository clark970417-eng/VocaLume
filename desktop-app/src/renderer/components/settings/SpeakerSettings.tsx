import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'

interface SpeakerSettingsProps {
  speakerDiarizationEnabled: boolean
  onSpeakerDiarizationEnabledChange: (v: boolean) => void
  platform: string
  disabled: boolean
}

/**
 * Speaker diarization settings panel (#549).
 * Uses local speaker models on macOS and Windows.
 */
export function SpeakerSettings({
  speakerDiarizationEnabled,
  onSpeakerDiarizationEnabledChange,
  platform,
  disabled
}: SpeakerSettingsProps): React.JSX.Element | null {
  if (platform !== 'darwin' && platform !== 'win32') return null

  return (
    <Section label={t("Speaker Diarization")}>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        color: '#e2e8f0',
        cursor: 'pointer'
      }}>
        <input
          type="checkbox"
          checked={speakerDiarizationEnabled}
          onChange={(e) => onSpeakerDiarizationEnabledChange(e.target.checked)}
          disabled={disabled}
          style={{ width: '16px', height: '16px' }}
        />{t("Enable speaker identification")} </label>
      <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{platform === 'win32'
        ? t('Identifies speakers locally. Color-coded labels appear on completed subtitles. Downloads about 28 MB on first use.')
        : t("Identifies speakers via FluidAudio (CoreML). Color-coded labels appear on subtitles. Downloads about 32 MB of model data. Speaker labels are estimates.")} </div>
    </Section>
  )
}
