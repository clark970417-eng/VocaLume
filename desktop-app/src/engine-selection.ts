export type EngineMode = 'auto' | 'rotation' | 'online' | 'online-public' | 'online-deepl' | 'online-gemini' | 'online-microsoft' | 'offline-hymt15' | 'offline-hymt2' | 'offline-hunyuan-mt' | 'offline-apple'
export type SttEngineType = 'haas-ja-recommended' | 'haas-ja-fast' | 'whisper-local' | 'mlx-whisper' | 'kotoba-whisper' | 'qwen3-asr' | 'sensevoice-sherpa' | 'apple-speech-transcriber'

export interface MacEngineAvailability {
  appleSilicon: boolean
  haasJa: boolean
  qwenAsr: boolean
  appleSpeech: boolean
  appleTranslate: boolean
  speakerIdentification: boolean
}

export function normalizeMacSttEngine(engine: SttEngineType, available: MacEngineAvailability): SttEngineType {
  if ((!available.appleSilicon && (engine === 'mlx-whisper' || engine === 'kotoba-whisper')) ||
      (!available.haasJa && (engine === 'haas-ja-recommended' || engine === 'haas-ja-fast')) ||
      (!available.qwenAsr && engine === 'qwen3-asr') ||
      (!available.appleSpeech && engine === 'apple-speech-transcriber')) {
    return available.appleSilicon ? 'mlx-whisper' : 'whisper-local'
  }
  return engine
}

/** Route explicit speech languages to compatible local recognition engines. */
export function resolveSpeechEngine(
  language: string,
  selected: SttEngineType,
  supportsHaas: boolean,
  fallback: SttEngineType = 'whisper-local'
): SttEngineType {
  const usesHaas = selected === 'haas-ja-recommended' || selected === 'haas-ja-fast'
  if (language === 'ja' && selected === 'sensevoice-sherpa') return selected
  if (language === 'ja' && supportsHaas) {
    return usesHaas ? selected : 'haas-ja-fast'
  }
  if (/^(zh|yue|en|ko)(?:-|$)/i.test(language)) return 'sensevoice-sherpa'
  if (usesHaas || (selected === 'sensevoice-sherpa' && language !== 'auto' && language !== 'ja') ||
      (selected === 'kotoba-whisper' && language !== 'ja' && language !== 'auto')) return fallback
  return selected
}

/** Haas availability is checked before startup. On smaller Windows machines
 * prefer the already-installed, measured low-latency fallback for Japanese. */
export function resolveWindowsJapaneseFallback(resources: {
  logicalCpus: number
  totalMemoryBytes: number
  senseVoiceInstalled: boolean
}): 'sensevoice-sherpa' | 'whisper-local' {
  const constrained = resources.logicalCpus <= 4 || resources.totalMemoryBytes <= 8 * 1024 ** 3
  return constrained && resources.senseVoiceInstalled ? 'sensevoice-sherpa' : 'whisper-local'
}

/** Match the native Japanese fallback on Macs without the separately installed Haas runtime. */
export function resolveMacSpeechEngine(
  language: string, selected: SttEngineType, available: MacEngineAvailability
): SttEngineType {
  if (language === 'ja' && available.appleSilicon && !available.haasJa) return 'kotoba-whisper'
  const fallback = available.appleSilicon ? 'mlx-whisper' : 'whisper-local'
  return resolveSpeechEngine(language, normalizeMacSttEngine(selected, available), available.appleSilicon, fallback)
}

/** Resolve 'auto' engine mode to a concrete mode based on available keys and GPU */
export function resolveEngineMode(
  mode: EngineMode,
  apiKeys: { apiKey: string; deeplApiKey: string; geminiApiKey: string; microsoftApiKey: string; microsoftRegion: string },
  gpuInfo: { hasGpu: boolean } | null,
  platform?: string
): EngineMode {
  if (mode === 'offline-apple' && platform === 'win32') return 'offline-hymt15'
  if (mode !== 'auto') return mode
  const hasKeys = !!(apiKeys.apiKey || apiKeys.deeplApiKey || apiKeys.geminiApiKey || (apiKeys.microsoftApiKey && apiKeys.microsoftRegion))
  if (hasKeys) return 'rotation'
  // Use the compact model for automatic live translation on known desktop platforms.
  if (platform === 'win32' || platform === 'darwin') return 'offline-hymt15'
  if (gpuInfo?.hasGpu) return 'offline-hunyuan-mt'
  return 'offline-hymt15'
}

/** Build pipeline config from resolved engine mode and settings */
export function buildEngineConfig(
  resolvedMode: EngineMode,
  sttEngine: SttEngineType,
  apiKeys: {
    apiKey: string
    deeplApiKey: string
    geminiApiKey: string
    microsoftApiKey: string
    microsoftRegion: string
    openaiApiKey?: string
    geminiLiveApiKey?: string
  },
  /**
   * Realtime cloud toggles. An object rather than positional booleans: these route
   * where a user's audio is sent, and two adjacent same-typed flags are swappable
   * at a call site without any type error.
   */
  realtime: { cloudRealtimeEnabled?: boolean; geminiLiveEnabled?: boolean } = {}
): Record<string, unknown> {
  // #722/#723: Cloud realtime interpretation is a separate capability axis, not an
  // extra translation engine — when enabled (with the matching BYOK key) it
  // overrides the cascade engine selection and runs a speech-native e2e path.
  // Both default off, keeping the local-first cascade as Core Value ①.
  //
  // Only ONE e2e path can own a session. gpt-realtime-translate outranks Gemini
  // Live, whose model is Preview and may change or break without notice, so its
  // toggle is checked first and owns the decision outright: a cloudRealtime user
  // whose OpenAI key is missing falls back to the LOCAL cascade, never sideways to
  // the other vendor. "Enabled but unusable" is a misconfiguration, not consent to
  // ship audio to a cloud the user did not choose.
  if (realtime.cloudRealtimeEnabled) {
    if (apiKeys.openaiApiKey) {
      return {
        mode: 'e2e' as const,
        e2eEngineId: 'cloud-realtime-e2e',
        openaiApiKey: apiKeys.openaiApiKey
      }
    }
  } else if (realtime.geminiLiveEnabled && apiKeys.geminiLiveApiKey) {
    return {
      mode: 'e2e' as const,
      e2eEngineId: 'gemini-live-e2e',
      geminiLiveApiKey: apiKeys.geminiLiveApiKey
    }
  }

  const base = { mode: 'cascade' as const, sttEngineId: sttEngine }

  switch (resolvedMode) {
    case 'online-public':
      return { ...base, translatorEngineId: 'google-public-translate' }
    case 'rotation':
      return {
        ...base,
        translatorEngineId: 'rotation-controller',
        ...(apiKeys.apiKey && { apiKey: apiKeys.apiKey }),
        ...(apiKeys.deeplApiKey && { deeplApiKey: apiKeys.deeplApiKey }),
        ...(apiKeys.geminiApiKey && { geminiApiKey: apiKeys.geminiApiKey }),
        ...(apiKeys.microsoftApiKey && apiKeys.microsoftRegion && { microsoftApiKey: apiKeys.microsoftApiKey, microsoftRegion: apiKeys.microsoftRegion })
      }
    case 'online':
      return { ...base, translatorEngineId: 'google-translate', apiKey: apiKeys.apiKey }
    case 'online-deepl':
      return { ...base, translatorEngineId: 'deepl-translate', deeplApiKey: apiKeys.deeplApiKey }
    case 'online-gemini':
      return { ...base, translatorEngineId: 'gemini-translate', geminiApiKey: apiKeys.geminiApiKey }
    case 'online-microsoft':
      return {
        ...base,
        translatorEngineId: 'microsoft-translate',
        microsoftApiKey: apiKeys.microsoftApiKey,
        microsoftRegion: apiKeys.microsoftRegion
      }
    case 'offline-hymt2':
      return { ...base, translatorEngineId: 'hunyuan-mt-2' }
    case 'offline-hunyuan-mt':
      return { ...base, translatorEngineId: 'hunyuan-mt' }
    case 'offline-apple':
      return { ...base, translatorEngineId: 'apple-translate' }
    case 'offline-hymt15':
    default:
      // 'offline-hymt15' is the fast offline default; any unknown legacy ID falls back here.
      return { ...base, translatorEngineId: 'hunyuan-mt-15' }
  }
}
/** Cascaded network translators that do not contend for the local model. */
export function isNetworkCascadeTranslator(id: unknown): boolean {
  return id === 'google-translate' || id === 'google-public-translate' ||
    id === 'deepl-translate' || id === 'microsoft-translate' || id === 'gemini-translate'
}
