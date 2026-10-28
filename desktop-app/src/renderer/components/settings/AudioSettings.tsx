import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'
import { buttonStyle, selectStyle, sliderLabelStyle } from './shared'
import type { UseAudioCaptureReturn, AudioSource } from '../../hooks/useAudioCapture'
import { MEDIA_FILE_ACCEPT } from '../../../media-formats'

/** Audio source display labels */
const AUDIO_SOURCE_OPTIONS: Array<{ value: AudioSource; label: string; description: string }> = [
  { value: 'microphone', label: 'Microphone', description: 'Capture from microphone only' },
  { value: 'system', label: 'System Audio', description: 'Capture system audio (Zoom, YouTube, etc.)' },
  { value: 'both', label: 'Microphone + System', description: 'Mix microphone and system audio' }
]

interface AudioSettingsProps {
  audio: UseAudioCaptureReturn
  disabled: boolean
  /** #313: Noise suppression enabled state */
  noiseSuppressionEnabled: boolean
  onNoiseSuppressionChange: (enabled: boolean) => void
  /** macOS requires Screen Recording permission for system audio (#501) */
  platform: string
  /** #606: Streaming chunk interval in ms */
  streamingIntervalMs: number
  onStreamingIntervalChange: (ms: number) => void
  onTranslateFile: (file: File) => Promise<void>
  mediaImportActive: boolean
  onCancelMediaImport: () => Promise<void>
}

export function AudioSettings({ audio, disabled, noiseSuppressionEnabled, onNoiseSuppressionChange, platform, streamingIntervalMs, onStreamingIntervalChange, onTranslateFile, mediaImportActive, onCancelMediaImport }: AudioSettingsProps): React.JSX.Element {
  const showMicSelector = audio.audioSource !== 'system'

  return (
    <Section label={t("Sound source")}>
      {/* #501: Audio source selector */}
      <select
        value={audio.audioSource}
        onChange={(e) => audio.setAudioSource(e.target.value as AudioSource)}
        style={{ ...selectStyle, marginBottom: '8px' }}
        disabled={disabled}
        aria-label={t("Audio source")}
      >
        {AUDIO_SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.label)}
          </option>
        ))}
      </select>
      {/* Description for selected audio source */}
      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
        {t(AUDIO_SOURCE_OPTIONS.find((o) => o.value === audio.audioSource)?.description || '')}
        {audio.audioSource !== 'microphone' && platform === 'darwin' && (
          <span style={{ color: '#f59e0b' }}>
            {' '}{t("— Requires Screen Recording permission")} </span>
        )}
        {audio.audioSource !== 'microphone' && platform === 'win32' && (
          <span style={{ color: '#94a3b8' }}>
            {' '}{t("— Uses WASAPI loopback (no extra setup needed)")} </span>
        )}
      </div>
      {/* Microphone device selector — hidden when system-only mode */}
      {showMicSelector && (
        <select
          value={audio.selectedDevice}
          onChange={(e) => audio.setSelectedDevice(e.target.value)}
          style={selectStyle}
          disabled={disabled}
          aria-label={t("Microphone device")}
        >
          {audio.devices.length === 0 ? (
            <option value="" disabled>{t("No audio devices found")} </option>
          ) : (
            audio.devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))
          )}
        </select>
      )}
      {/* Volume meter */}
      <div style={{ marginTop: '6px', height: '4px', background: '#1e293b', borderRadius: '2px' }}>
        <div
          role="progressbar"
          aria-label={t("Volume level")}
          aria-valuenow={Math.round(audio.volume * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: '100%',
            width: `${audio.volume * 100}%`,
            background: audio.volume > 0.7 ? '#ef4444' : '#22c55e',
            borderRadius: '2px',
            transition: 'width 0.1s'
          }}
        />
      </div>
      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{t("Input level:")} {Math.round(audio.volume * 100)}%
      </div>
      <details className="settings-disclosure"><summary>{t("Audio options")}</summary>
      {/* #313: Noise suppression toggle — only relevant when microphone is active */}
      {showMicSelector && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '8px',
          fontSize: '13px',
          color: '#94a3b8',
          cursor: disabled ? 'default' : 'pointer'
        }}>
          <input
            type="checkbox"
            checked={noiseSuppressionEnabled}
            onChange={(e) => onNoiseSuppressionChange(e.target.checked)}
            disabled={disabled}
            aria-label={t("Enable noise suppression")}
          />
          <span>{t("Reduce microphone background noise")}</span>
        </label>
      )}
      {/* #606: Streaming interval slider */}
      <div style={{ marginTop: '10px' }}>
        <label style={sliderLabelStyle}>{t("Recognition update interval:")} {streamingIntervalMs}ms
        </label>
        <input
          type="range"
          min={500}
          max={3000}
          step={100}
          value={streamingIntervalMs}
          onChange={(e) => onStreamingIntervalChange(Number(e.target.value))}
          disabled={disabled}
          style={{ width: '100%' }}
          aria-label={t("Streaming interval in milliseconds")}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
          <span>{t("500ms (lower latency)")}</span>
          <span>{t("3000ms (less frequent updates)")}</span>
        </div>
      </div>
      </details>
      <details className="settings-disclosure">
        <summary>{t("Translate an audio or video file")}</summary>
        <label htmlFor="media-file" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#b5c4d8' }}>{t("Choose a file to begin translation")}</label>
        <input id="media-file" type="file" accept={MEDIA_FILE_ACCEPT} disabled={disabled}
          style={{ width: '100%', color: '#b5c4d8', fontSize: 12 }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onTranslateFile(file)
          }} />
        <p style={{ fontSize: 11, color: '#94a3b8' }}>{t("MP3, M4A, WAV, FLAC, WebM, MP4 and other common formats.")}</p>
      </details>
      {mediaImportActive && <button type="button" onClick={() => void onCancelMediaImport()}
        style={{ ...buttonStyle, background: '#7f1d1d', color: '#fecaca' }}>{t("Cancel file translation")}</button>}
      {audio.permissionError && (
        <div role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
          {audio.permissionError}
        </div>
      )}
    </Section>
  )
}
