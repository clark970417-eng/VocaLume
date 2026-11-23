import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'
import { selectStyle, warningContainerStyle } from './shared'

interface VirtualMicSettingsProps {
  disabled: boolean
  platform: string
  ttsEnabled: boolean
  devices: MediaDeviceInfo[]
  outputDevice: string
  loading: boolean
  refresh: () => Promise<void>
  requestAccess: () => Promise<void>
  selectDevice: (deviceId: string) => Promise<void>
}

const VIRTUAL_DEVICE_PATTERNS = [
  'blackhole', 'soundflower', 'loopback', 'virtual cable', 'vb-cable',
  'vb-audio', 'voicemeeter', 'roc virtual', 'existential audio'
]

export function isVirtualAudioDevice(label: string, platform?: string): boolean {
  const normalized = label.toLowerCase()
  if (platform === 'win32') {
    const cable = normalized.match(/^(?:cable(?:-[a-z0-9]+)?|hi-fi cable) (input|output)\b/)
    if (cable) return cable[1] === 'input'
  }
  return VIRTUAL_DEVICE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

/** The Chromium default/communications IDs can silently follow a physical speaker. */
export function getVirtualAudioOutputs(devices: MediaDeviceInfo[], platform: string): MediaDeviceInfo[] {
  return devices.filter(device => device.kind === 'audiooutput' && device.deviceId &&
    device.deviceId !== 'default' && device.deviceId !== 'communications' &&
    isVirtualAudioDevice(device.label, platform))
}

export function getVirtualRecordingLabel(
  output: MediaDeviceInfo,
  devices: MediaDeviceInfo[],
  platform: string
): string | undefined {
  if (platform !== 'win32') return output.label
  const playback = output.label.match(/^((?:CABLE(?:-[A-Z0-9]+)?|Hi-Fi Cable)) Input(?:\s*(\d+ch))?\b/i)
  if (playback) {
    const expected = `${playback[1]} Output${playback[2] ? ` ${playback[2]}` : ''}`
    return devices.find(device => device.kind === 'audioinput' &&
      (device.label.toLowerCase() === expected.toLowerCase() ||
        device.label.toLowerCase().startsWith(`${expected.toLowerCase()} (`)))?.label ?? expected
  }
  // When a driver exposes different endpoint names, match only an unambiguous input in the same group.
  if (!output.groupId) return undefined
  const paired = devices.filter(device => device.kind === 'audioinput' && device.groupId === output.groupId &&
    device.deviceId !== 'default' && device.deviceId !== 'communications' && device.label)
  return paired.length === 1 ? paired[0]?.label : undefined
}

/** Use the same playback sink as the TTS selector for virtual meeting audio. */
export function VirtualMicSettings({
  disabled, platform, ttsEnabled, devices, outputDevice, loading, refresh, requestAccess, selectDevice
}: VirtualMicSettingsProps): React.JSX.Element {
  const windows = platform === 'win32'
  const virtualDevices = getVirtualAudioOutputs(devices, platform)
  const activeDevice = virtualDevices.find(device => device.deviceId === outputDevice)
  const enabled = activeDevice !== undefined
  const deviceLabel = activeDevice?.label ?? t('Virtual audio device')
  const recordingLabel = activeDevice ? getVirtualRecordingLabel(activeDevice, devices, platform) : undefined
  const showAccessButton = !devices.some(device => device.kind === 'audiooutput' && device.deviceId &&
    device.deviceId !== 'default' && device.deviceId !== 'communications' && device.label)
  const helpText = windows
    ? t('Send translated speech to a Windows virtual audio cable.')
    : t('Send translated speech to a virtual audio device such as BlackHole.')

  return (
    <Section label={t("Virtual Microphone (Meeting Sharing)")} helpText={helpText}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8', cursor: disabled || loading ? 'default' : 'pointer', marginBottom: '8px' }}>
        <input type="checkbox" checked={enabled}
          onChange={(event) => void selectDevice(event.target.checked ? (virtualDevices[0]?.deviceId ?? '') : '')}
          disabled={disabled || loading || virtualDevices.length === 0} aria-label={t("Enable virtual microphone output")} />
        <span>{loading ? t("Detecting virtual audio devices...") : enabled
          ? t("Virtual microphone output selected: {0}", [deviceLabel])
          : t("Route translated speech to a virtual microphone")}</span>
      </label>

      {virtualDevices.length > 1 && (
        <select value={activeDevice?.deviceId ?? ''} onChange={(event) => void selectDevice(event.target.value)}
          style={{ ...selectStyle, marginBottom: '8px' }} disabled={disabled || loading} aria-label={t("Virtual audio device")}>
          <option value="">{t("Disabled")}</option>
          {virtualDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
        </select>
      )}

      {enabled && <div role="status" style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
        {!ttsEnabled && <div>{t('Enable text-to-speech to send translated speech to the virtual microphone.')}</div>}
        {recordingLabel
          ? t("Select {0} as the microphone in Discord, OBS, Zoom or Meet.", [recordingLabel])
          : t('Select the matching recording device as the microphone in your meeting app.')}
      </div>}

      {!loading && virtualDevices.length === 0 && <div role="status" style={warningContainerStyle}>
        {windows && t('VB-CABLE uses CABLE Input for VocaLume playback and CABLE Output for the meeting microphone.')}
        {windows && ' '}
        {showAccessButton
          ? t("No virtual output is visible. Allow microphone access, then press Refresh Devices.")
          : t('No virtual audio cable detected. Connect a compatible virtual audio device, then refresh.')}
      </div>}

      {showAccessButton && <button type="button" onClick={() => void requestAccess()} disabled={disabled || loading}>
        {t('Allow microphone access')}
      </button>}
      <button type="button" onClick={() => void refresh()} disabled={disabled || loading}
        style={{ fontSize: '12px', color: '#94a3b8', background: 'transparent', border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', cursor: disabled || loading ? 'default' : 'pointer', marginBottom: '6px' }}>{t("Refresh Devices")} </button>
    </Section>
  )
}
