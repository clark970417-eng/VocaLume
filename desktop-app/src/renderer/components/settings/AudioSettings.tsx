import { t } from '../../ui-language'
import React, { useSyncExternalStore } from 'react'
import { Section } from './Section'
import { selectStyle, sliderLabelStyle } from './shared'
import type { UseAudioCaptureReturn, AudioSource } from '../../hooks/useAudioCapture'
import type { AudioLevel } from '../../hooks/audioLevel'

/** Audio source display labels */
const AUDIO_SOURCE_OPTIONS: Array<{ value: AudioSource; label: string }> = [
  { value: 'microphone', label: 'Microphone' },
  { value: 'system', label: 'System Audio' },
  { value: 'both', label: 'Microphone + System' }
]

interface AudioSettingsProps {
  audio: UseAudioCaptureReturn
  showLevel: boolean
  disabled: boolean
  /** #313: Noise suppression enabled state */
  noiseSuppressionEnabled: boolean
  onNoiseSuppressionChange: (enabled: boolean) => void
  /** macOS requires Screen Recording permission for system audio (#501) */
  platform: string
  /** #606: Streaming chunk interval in ms */
  streamingIntervalMs: number
  onStreamingIntervalChange: (ms: number) => void
}

function AudioLevelMeter({ level }: { level: AudioLevel }): React.JSX.Element {
  const percent = useSyncExternalStore(level.subscribe, level.read)
  return <>
    <div style={{ marginTop: '6px', height: '4px', background: '#1e293b', borderRadius: '2px' }}>
      <div
        role="progressbar"
        aria-label={t('Volume level')}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: '100%',
          width: `${percent}%`,
          background: percent > 70 ? '#ef4444' : '#22c55e',
          borderRadius: '2px',
          transition: 'width 0.1s'
        }}
      />
    </div>
    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{t('Input level:')} {percent}%</div>
  </>
}

export function AudioSettings({ audio, showLevel, disabled, noiseSuppressionEnabled, onNoiseSuppressionChange, platform, streamingIntervalMs, onStreamingIntervalChange }: AudioSettingsProps): React.JSX.Element {
  const showMicSelector = audio.audioSource !== 'system'
  const showWindowsLoopback = platform === 'win32' && audio.audioSource !== 'microphone'
  const loopbackInputs = audio.systemLoopbackInputs.filter(input => audio.audioSource !== 'both' || input.deviceId !== audio.selectedDevice)

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
      {audio.audioSource !== 'microphone' && platform === 'darwin' && (
        <p className="settings-notice">{t("Screen Recording permission is required.")}</p>
      )}
      {showWindowsLoopback && (
        <label className="settings-field">
          {t('Windows system audio input')}
          <select
            value={audio.systemLoopbackDeviceId}
            onChange={event => audio.setSystemLoopbackDeviceId(event.target.value)}
            style={selectStyle}
            disabled={disabled}
          >
            <option value="">{t('Screen-sharing audio')}</option>
            {audio.systemLoopbackDeviceId && !loopbackInputs.some(input => input.deviceId === audio.systemLoopbackDeviceId) && (
              <option value={audio.systemLoopbackDeviceId}>{t('Previously selected audio input')}</option>
            )}
            {loopbackInputs.map(input => <option key={input.deviceId} value={input.deviceId}>{input.label}</option>)}
          </select>
          <span className="settings-note">{t('Use Stereo Mix or a routed virtual cable for audio-only capture. Screen sharing is used if the input is unavailable.')}</span>
        </label>
      )}
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
      {showLevel ? <AudioLevelMeter level={audio.level} /> : null}
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
      {audio.permissionError && (
        <div role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#ef4444' }}>
          {t(audio.permissionError)}
        </div>
      )}
    </Section>
  )
}
