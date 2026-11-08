import type { SpeechEvidence, TTSPlaybackData, TtsVoiceOption } from '../engines/types'
import type { MediaFileCue } from '../media-transcript'
import type { UiLanguageChoice, UiLanguageState } from './ui-language'

export interface ElectronAPI {
  pipelineStart: (config: unknown, captureAudio?: boolean) => Promise<{ success?: boolean; error?: string }>
  pipelineStop: () => Promise<{ logPath?: string }>
  processAudio: (audioData: number[]) => Promise<unknown>
  processAudioStreaming: (audioData: number[] | Float32Array, evidence?: SpeechEvidence) => Promise<unknown>
  getAudioPreviewDelay: () => Promise<number>
  processAudioPreview: (audioData: Float32Array, evidence?: SpeechEvidence) => Promise<number>
  finalizeStreaming: (audioData: number[] | Float32Array, evidence?: SpeechEvidence) => Promise<unknown>
  getPathForFile: (file: File) => string
  decodeMediaFile: (path: string) => Promise<Uint8Array>
  exportFileTranscript: (contents: string) => Promise<void>
  translateText: (text: string, sourceLanguage: string, targetLanguage: string) => Promise<string>
  chooseMediaFolder: () => Promise<string | null>
  scanMediaFolder: () => Promise<{ files: { path: string; name: string; revision: string }[]; eventDriven: boolean } | null>
  stopMediaFolderWatch: () => Promise<void>
  onMediaFolderChanged: (callback: () => void) => (() => void)
  processMediaFile: (path: string, jobId: string, review?: boolean, expectedRevision?: string) => Promise<{ processedSeconds: number; cancelled: boolean }>
  cancelMediaFile: (jobId: string) => Promise<{ cancelled: boolean }>
  onMediaFileProgress: (callback: (data: { jobId: string; processedSeconds: number }) => void) => (() => void)
  onMediaFileCue: (callback: (cue: MediaFileCue) => void) => (() => void)
  pushRealtimeAudio: (audioData: Float32Array | number[]) => Promise<unknown>
  speechBoundary: (boundary: 'start' | 'end') => Promise<unknown>
  onTranslationResult: (callback: (data: unknown) => void) => (() => void)
  onInterimResult: (callback: (data: unknown) => void) => (() => void)
  onSubtitleActivity: (callback: (at: number) => void) => (() => void)
  onDraftResult: (callback: (data: unknown) => void) => (() => void)
  onStatusUpdate: (callback: (message: string) => void) => (() => void)
  getSessionStartTime: () => Promise<number | null>
  getDisplays: () => Promise<
    Array<{
      id: number
      label: string
      bounds: { x: number; y: number; width: number; height: number }
    }>
  >
  moveSubtitleToDisplay: (displayId: number) => void
  getUiLanguage: (legacyPreference: UiLanguageChoice['preference']) => Promise<UiLanguageState>
  setUiLanguage: (preference: UiLanguageChoice['preference']) => Promise<UiLanguageState>
  onUiLanguageChanged: (callback: (state: UiLanguageState) => void) => (() => void)
  getSettings: () => Promise<Record<string, unknown>>
  saveSettings: (settings: Record<string, unknown>) => Promise<void>
  getCrashedSession: () => Promise<{ config: Record<string, unknown>; startedAt: number } | null>
  listSessions: () => Promise<Array<{ id: string; startedAt: number; endedAt?: number; engineMode: string; entryCount: number }>>
  loadSession: (id: string) => Promise<unknown>
  searchSessions: (query: string) => Promise<Array<{ sessionId: string; matches: unknown[] }>>
  deleteSession: (id: string) => Promise<{ success: boolean }>
  exportSession: (id: string, format: string) => Promise<{ content?: string; ext?: string; error?: string }>
  getGgufVariants: (modelSize?: string) => Promise<Array<{ key: string; label: string; filename: string; sizeMB: number; downloaded: boolean }>>
  listPlugins: () => Promise<Array<{ name: string; version: string; engineType: string; engineId: string }>>
  getSessionLogs: () => Promise<Array<{ startedAt: number; endedAt: number; engineMode: string; durationMs: number }>>
  generateSummary: (transcriptPath: string) => Promise<{ summary?: string; error?: string }>
  detectGpu: () => Promise<{ hasGpu: boolean; gpuNames: string[] }>
  saveSubtitleSettings: (settings: Record<string, unknown>) => Promise<void>
  setSubtitleHoverRegion: (region: Electron.Rectangle | null) => void
  onSubtitlePointerNear: (callback: (near: boolean) => void) => (() => void)
  onSubtitleSettingsChanged: (callback: (settings: unknown) => void) => (() => void)
  onDisplaysChanged: (callback: () => void) => (() => void)
  getWhisperVariants: () => Promise<Array<{ key: string; label: string; description: string; filename: string; sizeMB: number; downloaded: boolean }>>
  getPlatform: () => Promise<string>
  getMacOSVersion: () => Promise<string | null>
  saveGlossary: (terms: Array<{ source: string; target: string }>) => Promise<void>
  saveOrgGlossary: (terms: Array<{ source: string; target: string }>) => Promise<void>
  importGlossary: (target: 'personal' | 'org') => Promise<{
    entries?: Array<{ source: string; target: string }>
    count?: number
    canceled?: boolean
    error?: string
  }>
  exportGlossary: (target: 'personal' | 'org', format: 'json' | 'csv') => Promise<{
    success?: boolean
    path?: string
    count?: number
    canceled?: boolean
    error?: string
  }>
  getMergedGlossary: () => Promise<{
    merged: Array<{ source: string; target: string }>
    conflicts: Array<{ source: string; personalTarget: string; orgTarget: string }>
    personalCount: number
    orgCount: number
  }>
  isDraftModelAvailable: (engine?: string) => Promise<boolean>
  wsAudioStart: (port?: number) => Promise<void>
  wsAudioStop: () => Promise<void>
  wsAudioGetStatus: () => Promise<{ running: boolean; connected: boolean; port: number | null }>
  onWsAudioStatus: (callback: (status: { running: boolean; connected: boolean; port: number | null }) => void) => (() => void)
  // System audio loopback (#501)
  enableLoopbackAudio: () => Promise<void>
  disableLoopbackAudio: () => Promise<void>
  // TTS (#508)
  ttsSetEnabled: (enabled: boolean) => Promise<{ success?: boolean; error?: string }>
  ttsSetVoice: (voiceId: string) => Promise<void>
  ttsSetVolume: (volume: number) => Promise<void>
  ttsSetOutputDevice: (deviceId: string) => Promise<void>
  ttsGetSettings: () => Promise<{ enabled: boolean; voice: string; outputDevice: string; volume: number }>
  ttsGetVoices: () => Promise<TtsVoiceOption[]>
  onTtsError: (callback: (message: string) => void) => (() => void)
  onTtsAudio: (callback: (data: TTSPlaybackData) => void) => (() => void)
  onTtsStop: (callback: () => void) => (() => void)

  // Virtual Mic (#515)
  virtualMicGetStatus: () => Promise<{
    enabled: boolean
    activeDeviceId: number | null
    activeDeviceName: string | null
    availableDevices: Array<{ id: number; name: string; maxOutputChannels: number; defaultSampleRate: number }>
  }>
  virtualMicEnable: (deviceId: number) => Promise<{ success?: boolean; error?: string }>
  virtualMicDisable: () => Promise<{ success?: boolean; error?: string }>
  virtualMicRefreshDevices: () => Promise<Array<{ id: number; name: string; maxOutputChannels: number; defaultSampleRate: number }>>

  // Quick Start onboarding (#510)
  quickStartRecommend: () => Promise<{
    sttEngine: string
    translationEngine: string
    whisperVariant: string
    downloads: Array<{ type: string; key: string; filename: string; url: string; sizeMB: number; label: string }>
    totalDownloadMB: number
    needsDownload: boolean
    fallbackEngine: string | null
    reason: string
  }>
  quickStartApply: (options: { sourceLanguage: string; targetLanguage: string; recommendation: unknown }) => Promise<{ success: boolean }>
  quickStartIsCompleted: () => Promise<boolean>
  quickStartSkip: () => Promise<{ success: boolean }>
  quickStartSystemInfo: () => Promise<{ platform: string; totalMemoryMB: number; gpuInfo: { hasGpu: boolean; gpuNames: string[] } }>

  // Enterprise features (#519)
  enterpriseGetUsageSummary: (days?: number) => Promise<{
    periodStart: string
    periodEnd: string
    totalSessions: number
    totalDurationMs: number
    totalCharacters: number
    averageSessionDurationMs: number
    engineBreakdown: Record<string, number>
    languagePairBreakdown: Record<string, number>
    dailyStats: Array<{
      date: string
      totalSessionCount: number
      totalDurationMs: number
      totalCharacterCount: number
      engineUsage: Record<string, number>
      languagePairs: Record<string, number>
    }>
    error?: string
  }>
  enterpriseGetQuickStats: () => Promise<{ totalSessions: number; totalDurationMs: number }>
  enterpriseGetMdmConfig: () => Promise<{
    lockedEngine: string | null
    lockedSttEngine: string | null
    telemetryDisabled: boolean
    hasManagedApiKey: boolean
    hasManagedDeeplApiKey: boolean
    hasManagedGeminiApiKey: boolean
    hasManagedMicrosoftApiKey: boolean
    managedMicrosoftRegion: string | null
    organizationName: string | null
    autoUpdateDisabled: boolean
  }>
  enterpriseGetTelemetryConsent: () => Promise<{
    consent: boolean
    consentShown: boolean
    mdmDisabled: boolean
  }>
  enterpriseSetTelemetryConsent: (consent: boolean) => Promise<{ success: boolean; reason?: string }>

  // Subtitle drag mode (#509)
  toggleSubtitleDragMode: (enabled: boolean) => Promise<void>
  getSubtitleInteractionMode: () => Promise<'view' | 'drag' | 'edit'>
  setSubtitleCaptionArea: (area: { x: number; y: number; width: number; height: number } | null, hideOnHover: boolean) => void
  setSubtitleCaptionHover: (hovered: boolean) => void
  onSubtitleHoverHidden: (callback: (hidden: boolean) => void) => (() => void)
  subtitlePointerDrag: (phase: 'start' | 'move' | 'end', x: number, y: number) => void
  onSubtitleDisplayChanged: (callback: (displayId: number) => void) => (() => void)
  resetSubtitlePosition: () => Promise<void>
  onDragModeChanged: (callback: (enabled: boolean) => void) => (() => void)

  // Subtitle edit mode (#590)
  toggleSubtitleEditMode: (enabled: boolean) => Promise<boolean>
  onEditModeChanged: (callback: (enabled: boolean) => void) => (() => void)
  saveCorrection: (correction: {
    sourceText: string
    originalTranslation: string
    correctedTranslation: string
  }) => Promise<{ success?: boolean; error?: string; glossaryCount?: number }>
  getCorrectionHistory: () => Promise<Array<{
    sourceText: string
    originalTranslation: string
    correctedTranslation: string
    timestamp: number
  }>>
  clearCorrectionHistory: () => Promise<{ success: boolean }>

  // Onboarding: cloud-first progressive download (#575)
  onboardingGetStatus: () => Promise<{
    tier: number | null
    status: string
    progress: number
    tier1Ready: boolean
    tier2Ready: boolean
    currentLabel: string
    currentTierSizeMB: number
    error?: string
  }>
  onboardingStartDownload: () => Promise<{ success: boolean; engineMode?: string }>
  onboardingSwitchToLocal: () => Promise<{ success?: boolean; engine?: string; tier?: number; error?: string }>
  onboardingUpgradeToTier2: () => Promise<{ success?: boolean; engine?: string; tier?: number; error?: string }>
  onboardingDismiss: () => Promise<{ success: boolean }>
  onboardingSetPreferredEngine: (engine: string) => Promise<{ success?: boolean; error?: string }>
  onboardingIsFirstRun: () => Promise<boolean>
  onOnboardingDownloadProgress: (callback: (data: {
    status: string
    progress: number
    tier?: number | null
    tier1Ready?: boolean
    tier2Ready?: boolean
    message?: string
    error?: string
  }) => void) => (() => void)

  // Keyboard shortcuts (#509)
  getShortcutLabels: () => Promise<Record<string, { action: string; shortcut: string }>>
  onShortcutAction: (callback: (action: string) => void) => (() => void)
  onLanguageSwitched: (callback: (data: { sourceLanguage: string; targetLanguage: string }) => void) => (() => void)

  // Auto-update (#314)
  updateCheck: () => Promise<{ success?: boolean; error?: string }>
  updateDownload: () => Promise<{ success?: boolean; openedBrowser?: boolean; error?: string }>
  updateInstall: () => Promise<{ success?: boolean; deferred?: boolean }>
  updateSetChannel: (channel: 'stable' | 'beta') => Promise<{ success?: boolean; error?: string }>
  updateGetStatus: () => Promise<{ state: string; version?: string; progress?: number; error?: string; currentVersion?: string; channel?: 'stable' | 'beta'; installMode?: 'automatic' | 'browser'; releaseUrl?: string; managedDisabled?: boolean }>
  obsCaptionStatus: () => Promise<{ mode: 'off' | 'translation' | 'bilingual'; transport: 'file' | 'push';
    source: string; pushAvailable: boolean; path: string; error: string; hideDesktopOverlay: boolean }>
  configureObsCaptions: (mode: 'off' | 'translation' | 'bilingual') => ReturnType<ElectronAPI['obsCaptionStatus']>
  configureObsCaptionTransport: (transport: 'file' | 'push', source: string) => ReturnType<ElectronAPI['obsCaptionStatus']>
  setObsOnly: (enabled: boolean) => ReturnType<ElectronAPI['obsCaptionStatus']>
  exportDiagnostics: () => Promise<{ success?: boolean; canceled?: boolean; path?: string; error?: string }>
  openSupportUrl: (url: string) => Promise<{ success?: boolean; error?: string }>
  onUpdateStatus: (callback: (status: { state: string; version?: string; progress?: number; error?: string; currentVersion?: string; channel?: 'stable' | 'beta'; installMode?: 'automatic' | 'browser'; releaseUrl?: string }) => void) => (() => void)
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
