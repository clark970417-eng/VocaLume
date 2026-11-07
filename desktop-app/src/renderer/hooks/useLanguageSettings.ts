import { useEffect, useState } from 'react'
import { str } from './settingsCastUtils'
import type { Language, SourceLanguage, SttEngineType, WhisperVariantType } from '../components/settings/shared'

export interface LanguageSettingsState {
  sourceLanguage: SourceLanguage
  setSourceLanguage: (v: SourceLanguage) => void
  targetLanguage: Language
  setTargetLanguage: (v: Language) => void
  sttEngine: SttEngineType
  setSttEngine: (v: SttEngineType) => void
  whisperVariant: WhisperVariantType
  setWhisperVariant: (v: WhisperVariantType) => void
  platform: string
  /** Whether the current system is macOS 26+ (Tahoe), enabling Apple SpeechTranscriber */
  isMacOS26: boolean
  draftSttEnabled: boolean
  setDraftSttEnabled: (v: boolean) => void
  speakerDiarizationEnabled: boolean
  setSpeakerDiarizationEnabled: (v: boolean) => void
}

export function useLanguageSettings(): LanguageSettingsState {
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('auto')
  const [targetLanguage, setTargetLanguage] = useState<Language>('en')
  const [sttEngine, setSttEngine] = useState<SttEngineType>('whisper-local')
  const [whisperVariant, setWhisperVariant] = useState<WhisperVariantType>('kotoba-v2.0')
  const [platform, setPlatform] = useState('')
  const [isMacOS26, setIsMacOS26] = useState(false)
  const [draftSttEnabled, setDraftSttEnabled] = useState(false)
  const [speakerDiarizationEnabled, setSpeakerDiarizationEnabled] = useState(false)

  // Load language/STT settings on mount
  useEffect(() => {
    const savedSettings = window.api.getSettings()
    savedSettings.then((s) => {
      if (s.whisperVariant) setWhisperVariant(str(s.whisperVariant, 'kotoba-v2.0') as WhisperVariantType)
      if (s.sourceLanguage) setSourceLanguage(str(s.sourceLanguage, 'auto') as SourceLanguage)
      if (s.targetLanguage) setTargetLanguage(str(s.targetLanguage, 'en') as Language)
      if (s.draftSttEnabled !== undefined) setDraftSttEnabled(!!s.draftSttEnabled)
      if (s.speakerDiarizationEnabled !== undefined) setSpeakerDiarizationEnabled(!!s.speakerDiarizationEnabled)
    }).catch((e) => console.warn('[settings] Failed to load language settings:', e))

    // Set platform-aware STT default and detect macOS version
    window.api.getPlatform().then(async (p) => {
      setPlatform(p)
      const macVer = p === 'darwin' ? await window.api.getMacOSVersion().catch(() => null) : null
      // macOS 26+ (Tahoe) enables Apple SpeechTranscriber as primary STT (#548)
      const isTahoe = macVer !== null && parseInt(macVer.split('.')[0], 10) >= 26
      setIsMacOS26(isTahoe)
      const storedEngine = str((await savedSettings).sttEngine, '')
      if (p !== 'darwin' && ['mlx-whisper', 'kotoba-whisper', 'apple-speech-transcriber', 'qwen3-asr'].includes(storedEngine)) {
        setSttEngine('whisper-local')
        setWhisperVariant('base')
      } else if (storedEngine) {
        setSttEngine(storedEngine as SttEngineType)
      } else if (p === 'darwin') {
        setSttEngine(isTahoe ? 'apple-speech-transcriber' : 'mlx-whisper')
      }
    }).catch((e) => console.warn('[settings] Failed to load platform/settings:', e))
  }, [])

  return {
    sourceLanguage, setSourceLanguage,
    targetLanguage, setTargetLanguage,
    sttEngine, setSttEngine,
    whisperVariant, setWhisperVariant,
    platform,
    isMacOS26,
    draftSttEnabled, setDraftSttEnabled,
    speakerDiarizationEnabled, setSpeakerDiarizationEnabled
  }
}
