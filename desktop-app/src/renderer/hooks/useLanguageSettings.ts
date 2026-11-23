import { useEffect, useState } from 'react'
import { str } from './settingsCastUtils'
import type { MacEngineAvailability } from '../../engine-selection'
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
  macEngines: MacEngineAvailability | null
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
  const [macEngines, setMacEngines] = useState<MacEngineAvailability | null>(null)
  const [draftSttEnabled, setDraftSttEnabled] = useState(false)
  const [speakerDiarizationEnabled, setSpeakerDiarizationEnabled] = useState(false)

  // Load language/STT settings on mount
  useEffect(() => {
    Promise.all([window.api.getSettings(), window.api.getPlatform()]).then(([s, p]) => {
      setPlatform(p)
      const available = (s.macEngines ?? null) as MacEngineAvailability | null
      setMacEngines(available)
      const savedStt = str(s.sttEngine, available?.appleSilicon ? 'mlx-whisper' : 'whisper-local')
      if (p !== 'darwin' && ['mlx-whisper', 'kotoba-whisper', 'apple-speech-transcriber', 'qwen3-asr'].includes(savedStt)) {
        setSttEngine('whisper-local')
        setWhisperVariant('base')
      } else {
        setSttEngine(savedStt as SttEngineType)
        if (s.whisperVariant) setWhisperVariant(str(s.whisperVariant, 'kotoba-v2.0') as WhisperVariantType)
      }
      if (s.sourceLanguage) setSourceLanguage(str(s.sourceLanguage, 'auto') as SourceLanguage)
      if (s.targetLanguage) setTargetLanguage(str(s.targetLanguage, 'en') as Language)
      if (s.draftSttEnabled !== undefined) setDraftSttEnabled(!!s.draftSttEnabled)
      if (s.speakerDiarizationEnabled !== undefined) setSpeakerDiarizationEnabled(!!s.speakerDiarizationEnabled)
    }).catch((e) => console.warn('[settings] Failed to load platform/settings:', e))
  }, [])

  return {
    sourceLanguage, setSourceLanguage,
    targetLanguage, setTargetLanguage,
    sttEngine, setSttEngine,
    whisperVariant, setWhisperVariant,
    platform,
    macEngines,
    draftSttEnabled, setDraftSttEnabled,
    speakerDiarizationEnabled, setSpeakerDiarizationEnabled
  }
}
