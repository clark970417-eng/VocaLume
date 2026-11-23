import { t } from '../../ui-language'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LANGUAGE_LABELS, type TtsVoiceOption } from '../../../engines/types'
import { verifyTtsOutputDevice } from '../../hooks/TtsPlayback'
import { Section } from './Section'
import { VirtualMicSettings } from './VirtualMicSettings'
import { buttonStyle, errorContainerStyle, selectStyle, sliderLabelStyle, warningContainerStyle } from './shared'

/** Voice options by language group */
const TTS_VOICES: Record<string, Array<{ id: string; label: string }>> = {
  en: [
    { id: 'af_heart', label: 'Heart (F)' },
    { id: 'af_bella', label: 'Bella (F)' },
    { id: 'af_nova', label: 'Nova (F)' },
    { id: 'af_sarah', label: 'Sarah (F)' },
    { id: 'af_sky', label: 'Sky (F)' },
    { id: 'am_adam', label: 'Adam (M)' },
    { id: 'am_echo', label: 'Echo (M)' },
    { id: 'am_michael', label: 'Michael (M)' },
    { id: 'bf_alice', label: 'Alice (F, British)' },
    { id: 'bf_emma', label: 'Emma (F, British)' },
    { id: 'bm_daniel', label: 'Daniel (M, British)' },
    { id: 'bm_george', label: 'George (M, British)' }
  ],
  ja: [
    { id: 'jf_alpha', label: 'Alpha (F)' },
    { id: 'jf_gongitsune', label: 'Gongitsune (F)' },
    { id: 'jf_nezumi', label: 'Nezumi (F)' },
    { id: 'jf_tebukuro', label: 'Tebukuro (F)' },
    { id: 'jm_kumo', label: 'Kumo (M)' }
  ],
  zh: [
    { id: 'zf_xiaobei', label: 'Xiaobei (F)' },
    { id: 'zf_xiaoni', label: 'Xiaoni (F)' },
    { id: 'zm_yunjian', label: 'Yunjian (M)' },
    { id: 'zm_yunxi', label: 'Yunxi (M)' }
  ],
  fr: [{ id: 'ff_siwis', label: 'Siwis (F)' }],
  es: [{ id: 'ef_dora', label: 'Dora (F)' }],
  it: [{ id: 'if_sara', label: 'Sara (F)' }],
  pt: [{ id: 'pf_dora', label: 'Dora (F)' }]
}

/** All voices flattened for the selector */
const ALL_VOICES = [
  { group: 'English', voices: TTS_VOICES.en! },
  { group: 'Japanese', voices: TTS_VOICES.ja! },
  { group: 'Chinese', voices: TTS_VOICES.zh! },
  { group: 'French', voices: TTS_VOICES.fr! },
  { group: 'Spanish', voices: TTS_VOICES.es! },
  { group: 'Italian', voices: TTS_VOICES.it! },
  { group: 'Portuguese', voices: TTS_VOICES.pt! }
]

interface TTSSettingsProps {
  disabled: boolean
  platform: string
}

export function TTSSettings({ disabled, platform }: TTSSettingsProps): React.JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [voice, setVoice] = useState('auto')
  const [volume, setVolume] = useState(0.8)
  const [outputDevice, setOutputDevice] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [windowsVoices, setWindowsVoices] = useState<TtsVoiceOption[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [scanning, setScanning] = useState(true)
  const [routing, setRouting] = useState(false)
  const [outputError, setOutputError] = useState<{ message: string; detail: string } | null>(null)
  const scanId = useRef(0)

  // Load saved settings on mount
  useEffect(() => {
    let active = true
    window.api.ttsGetSettings().then((settings) => {
      if (!active) return
      setEnabled(settings.enabled)
      setVoice(settings.voice)
      setVolume(settings.volume)
      setOutputDevice(settings.outputDevice)
    }).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err))
      console.warn('[tts-settings] Failed to load TTS settings:', e.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => window.api.onTtsError(setSpeechError), [])

  useEffect(() => {
    if (!enabled || platform !== 'win32') return
    let active = true
    setLoadingVoices(true)
    window.api.ttsGetVoices().then(voices => {
      if (active) setWindowsVoices(voices)
    }).catch(() => {
      if (active) setSpeechError('Unable to list installed Windows speech voices.')
    }).finally(() => {
      if (active) setLoadingVoices(false)
    })
    return () => { active = false }
  }, [enabled, platform])

  const refreshDevices = useCallback(async () => {
    const id = ++scanId.current
    setScanning(true)
    setOutputError(null)
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      if (id === scanId.current) setDevices(all)
    } catch (error: unknown) {
      if (id === scanId.current) setOutputError({
        message: 'Unable to enumerate virtual audio devices: {0}',
        detail: error instanceof Error ? error.message : String(error)
      })
    } finally {
      if (id === scanId.current) setScanning(false)
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices)
    return () => {
      ++scanId.current
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices)
    }
  }, [refreshDevices])

  const requestAccess = useCallback(async () => {
    setRouting(true)
    setOutputError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      await refreshDevices()
    } catch (error: unknown) {
      setOutputError({
        message: 'Unable to access audio devices: {0}',
        detail: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setRouting(false)
    }
  }, [refreshDevices])

  const handleToggle = useCallback(async (checked: boolean) => {
    setLoading(true)
    try {
      const result = await window.api.ttsSetEnabled(checked)
      if (result.error) {
        console.error('[tts-settings] TTS enable failed:', result.error)
        setEnabled(false)
      } else {
        setEnabled(checked)
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      console.warn('[tts-settings] TTS toggle failed:', e.message)
      setEnabled(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleVoiceChange = useCallback((voiceId: string) => {
    setVoice(voiceId)
    setSpeechError('')
    void window.api.ttsSetVoice(voiceId).catch(() => setSpeechError('Unable to save the speech voice.'))
  }, [])

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value)
    window.api.ttsSetVolume(value)
  }, [])

  const handleOutputDeviceChange = useCallback(async (deviceId: string) => {
    setRouting(true)
    setOutputError(null)
    try {
      await verifyTtsOutputDevice(deviceId)
      await window.api.ttsSetOutputDevice(deviceId)
      setOutputDevice(deviceId)
    } catch (error: unknown) {
      setOutputError({
        message: 'Unable to route translated speech: {0}',
        detail: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setRouting(false)
    }
  }, [])

  const outputDevices = devices.filter(device => device.kind === 'audiooutput' && device.deviceId && device.deviceId !== 'default')
  const outputBusy = loading || scanning || routing
  const outputUnavailable = !outputBusy && outputDevice !== '' && outputDevice !== 'default' &&
    !outputDevices.some(device => device.deviceId === outputDevice)
  const voiceGroups = platform === 'win32' ? Object.entries(LANGUAGE_LABELS).flatMap(([language, group]) => {
    const voices = windowsVoices.filter(option => option.language === language)
    return voices.length ? [{ group, voices }] : []
  }) : ALL_VOICES
  const voiceUnavailable = voice !== 'auto' && !voiceGroups.some(group => group.voices.some(option => option.id === voice))

  return (<>
    <Section label={t("Text-to-Speech")}>
      {/* Enable/disable toggle */}
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '13px',
        color: '#94a3b8',
        cursor: disabled || loading ? 'default' : 'pointer',
        marginBottom: '8px'
      }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={disabled || loading}
          aria-label={t("Enable text-to-speech")}
        />
        <span>
          {loading ? t('Loading speech settings...') : platform === 'win32' ? t('Speak translated text') : t("Speak translated text (Kokoro-82M)")}
        </span>
      </label>

      {enabled && (
        <>
          {/* Voice selector */}
          <div style={sliderLabelStyle}>{t("Voice")}</div>
          <select
            value={voiceUnavailable ? 'auto' : voice}
            onChange={(e) => handleVoiceChange(e.target.value)}
            style={{ ...selectStyle, marginBottom: '8px' }}
            disabled={disabled || loadingVoices}
            aria-label={t("TTS voice")}
          >
            <option value="auto">{t("Automatic for translation language")}</option>
            {voiceGroups.map((group) => (
              <optgroup key={group.group} label={t(group.group)}>
                {group.voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Volume slider */}
          <div style={sliderLabelStyle}>{t("Volume:")} {Math.round(volume * 100)}%</div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            style={{ width: '100%', marginBottom: '8px' }}
            disabled={disabled}
            aria-label={t("TTS volume")}
          />

          {/* Output device selector */}
          {outputDevices.length > 0 && (
            <>
              <div style={sliderLabelStyle}>{t("Output Device")}</div>
              <select
                value={outputDevice === 'default' ? '' : outputDevice}
                onChange={(e) => handleOutputDeviceChange(e.target.value)}
                style={selectStyle}
                disabled={disabled || outputBusy}
                aria-label={t("TTS output device")}
              >
                <option value="">{t("Default")}</option>
                {outputUnavailable && <option value={outputDevice} disabled>{t('Selected audio output unavailable')}</option>}
                {outputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}

      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>{platform === 'win32'
        ? t('Uses installed Windows speech voices. Kokoro is available for English.')
        : t("Offline TTS via Kokoro-82M (ONNX). Model downloads on first use (~80MB).")} </div>
      {enabled && speechError && <div role="alert" style={errorContainerStyle}>{t(speechError)}</div>}
    </Section>
    <VirtualMicSettings disabled={disabled} platform={platform} ttsEnabled={enabled} devices={devices}
      outputDevice={outputDevice} loading={outputBusy} refresh={refreshDevices}
      requestAccess={requestAccess} selectDevice={handleOutputDeviceChange} />
    {outputUnavailable && <div role="status" style={warningContainerStyle}>
      <span>{t('Selected audio output unavailable')}</span>{' '}
      <button type="button" style={buttonStyle} disabled={disabled}
        onClick={() => void handleOutputDeviceChange('')}>{t('Use default audio output')}</button>
    </div>}
    {outputError && <div role="alert" style={errorContainerStyle}>{t(outputError.message, [outputError.detail])}</div>}
  </>)
}
