import { configureObsCaptions, configureObsCaptionTransport, obsCaptionStatus } from '../obs-captions'
import { app, ipcMain, dialog, shell } from 'electron'
import { arch, platform, release, totalmem } from 'os'
import { readFile, writeFile } from 'fs/promises'
import { store } from '../store'
import type { SubtitleSettings, CorrectionEntry } from '../store'
import { validateSubtitleSettings } from '../ipc-validators'
import type { AppContext } from '../app-context'
import { syncDesktopSubtitleWindow } from '../window-manager'
import { createLogger } from '../logger'
import { resetSubtitlePosition } from './display-ipc'
import { resizeSubtitleWindow } from '../window-manager'
import { isSpeechToneMode } from '../../pipeline/SpeechTone'
import { normalizeMacSttEngine, type SttEngineType } from '../../engine-selection'
import { getMacEngineAvailability } from '../mac-engine-availability'
import { localizedWebsiteUrl } from '../../../../extension/website-language.mjs'
import { translateUiText, uiLanguagePreference } from '../../../../extension/ui-language.mjs'
import {
  getUiLanguageState,
  onUiLanguageStateChanged,
  setUiLanguagePreference,
  updateUiLanguageChoice
} from '../interface-language'
import {
  parseGlossary,
  detectGlossaryFormat,
  exportJsonGlossary,
  exportCsvGlossary,
  mergeGlossaries
} from '../../engines/translator/glossary-manager'

const _log = createLogger('ipc:settings')

/** Register settings persistence IPC handlers */
export function registerSettingsIpc(ctx: AppContext): void {
  ipcMain.handle('get-ui-language', (_event, legacyPreference: unknown) => {
    const preference = uiLanguagePreference(legacyPreference)
    if (preference !== 'auto') updateUiLanguageChoice({ preference, changedAt: 0 })
    return getUiLanguageState()
  })
  ipcMain.handle('set-ui-language', (_event, preference: unknown) => setUiLanguagePreference(preference))
  onUiLanguageStateChanged(state => {
    for (const window of [ctx.mainWindow, ctx.subtitleWindow]) {
      if (window && !window.isDestroyed()) window.webContents.send('ui-language-changed', state)
    }
  })
  ipcMain.handle('configure-obs-caption-transport', (_event, transport: unknown, source: unknown) =>
    configureObsCaptionTransport(transport, source))
  ipcMain.handle('obs-caption-status', obsCaptionStatus)
  ipcMain.handle('configure-obs-captions', async (_event, mode: unknown) => {
    await configureObsCaptions(mode)
    syncDesktopSubtitleWindow(ctx)
    return obsCaptionStatus()
  })
  ipcMain.handle('set-obs-only', (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid OBS overlay preference')
    store.set('obsHideDesktopOverlay', enabled)
    syncDesktopSubtitleWindow(ctx)
    return obsCaptionStatus()
  })
  const supportUrls = new Set([
    'https://github.com/clark970417-eng/VocaLume/issues/new?template=bug-report.yml',
    'https://github.com/clark970417-eng/VocaLume/issues/new?template=translation-quality.yml',
    'https://github.com/clark970417-eng/VocaLume/blob/main/docs/legal/privacy.md',
    'https://github.com/clark970417-eng/VocaLume/releases',
    ...['auto', 'en', 'zh-TW', 'zh-CN', 'ja', 'ko'].map(localizedWebsiteUrl)
  ])

  ipcMain.handle('open-support-url', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !supportUrls.has(url)) return { error: 'Unsupported link' }
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle('export-diagnostics', async () => {
    if (!ctx.mainWindow) return { error: 'No main window' }
    const result = await dialog.showSaveDialog(ctx.mainWindow, {
      title: translateUiText('Export Diagnostics', getUiLanguageState().locale),
      defaultPath: `vocalume-diagnostics-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const diagnostics = {
      generatedAt: new Date().toISOString(),
      app: { version: app.getVersion(), packaged: app.isPackaged },
      system: { platform: platform(), release: release(), arch: arch(), memoryBytes: totalmem() },
      configuration: {
        updateChannel: store.get('updateChannel'),
        sttEngine: store.get('sttEngine'),
        translationEngine: store.get('translationEngine'),
        sourceLanguage: store.get('sourceLanguage'),
        targetLanguage: store.get('targetLanguage'),
        audioSource: store.get('audioSource'),
        streamingIntervalMs: store.get('streamingIntervalMs'),
        noiseSuppressionEnabled: store.get('noiseSuppressionEnabled'),
        simulMtEnabled: store.get('simulMtEnabled')
      },
      recentSessions: (store.get('sessionLogs') || []).slice(-20)
    }
    await writeFile(result.filePath, JSON.stringify(diagnostics, null, 2), 'utf-8')
    return { success: true, path: result.filePath }
  })

  ipcMain.handle('get-settings', async () => {
    const macEngines = await getMacEngineAvailability()
    const snapshot = store.store
    return {
      macEngines,
      speechToneMode: snapshot.speechToneMode,
      translationEngine: macEngines && !macEngines.appleTranslate && snapshot.translationEngine === 'offline-apple' ? 'offline-hymt15' : snapshot.translationEngine,
      googleApiKey: snapshot.googleApiKey,
      deeplApiKey: snapshot.deeplApiKey,
      geminiApiKey: snapshot.geminiApiKey,
      microsoftApiKey: snapshot.microsoftApiKey,
      microsoftRegion: snapshot.microsoftRegion,
      openaiApiKey: snapshot.openaiApiKey,
      cloudRealtimeEnabled: snapshot.cloudRealtimeEnabled,
      geminiLiveApiKey: snapshot.geminiLiveApiKey,
      geminiLiveEnabled: snapshot.geminiLiveEnabled,
      sttEngine: macEngines ? normalizeMacSttEngine(snapshot.sttEngine as SttEngineType, macEngines) : snapshot.sttEngine,
      audioSource: snapshot.audioSource,
      systemLoopbackDeviceId: snapshot.systemLoopbackDeviceId,
      selectedMicrophone: snapshot.selectedMicrophone,
      selectedDisplay: snapshot.selectedDisplay,
      subtitleSettings: snapshot.subtitleSettings,
      slmKvCacheQuant: snapshot.slmKvCacheQuant,
      slmModelSize: snapshot.slmModelSize,
      slmSpeculativeDecoding: snapshot.slmSpeculativeDecoding,
      glossaryTerms: snapshot.glossaryTerms || [],
      orgGlossaryTerms: snapshot.orgGlossaryTerms || [],
      gerEnabled: snapshot.gerEnabled,
      adaptiveRoutingEnabled: snapshot.adaptiveRoutingEnabled,
      adaptiveRoutingShortThreshold: snapshot.adaptiveRoutingShortThreshold,
      adaptiveRoutingLongThreshold: snapshot.adaptiveRoutingLongThreshold,
      adaptiveRoutingQualityEngine: snapshot.adaptiveRoutingQualityEngine,
      noiseSuppressionEnabled: snapshot.noiseSuppressionEnabled,
      streamingIntervalMs: snapshot.streamingIntervalMs,
      simulMtEnabled: snapshot.simulMtEnabled,
      simulMtWaitK: snapshot.simulMtWaitK,
      whisperVariant: snapshot.whisperVariant,
      moonshineVariant: snapshot.moonshineVariant,
      sherpaOnnxModel: snapshot.sherpaOnnxModel,
      sourceLanguage: snapshot.sourceLanguage,
      targetLanguage: snapshot.targetLanguage,
      wsAudioPort: snapshot.wsAudioPort,
      ttsEnabled: snapshot.ttsEnabled,
      ttsVoice: snapshot.ttsVoice,
      ttsOutputDevice: snapshot.ttsOutputDevice,
      ttsVolume: snapshot.ttsVolume,
      hasCompletedSetup: snapshot.hasCompletedSetup,
      draftSttEnabled: snapshot.draftSttEnabled,
      speakerDiarizationEnabled: (macEngines?.speakerIdentification ?? true) && snapshot.speakerDiarizationEnabled,
      telemetryConsent: snapshot.telemetryConsent,
      telemetryConsentShown: snapshot.telemetryConsentShown,
      showConfidenceIndicator: snapshot.showConfidenceIndicator,
      isFirstRun: snapshot.isFirstRun,
      onboardingModelStatus: snapshot.onboardingModelStatus,
      onboardingDownloadProgress: snapshot.onboardingDownloadProgress,
      preferredLocalEngine: snapshot.preferredLocalEngine,
      updateChannel: snapshot.updateChannel
    }
  })

  ipcMain.handle('save-subtitle-settings', (_event, settings: Record<string, unknown>) => {
    const validationError = validateSubtitleSettings(settings)
    if (validationError) {
      throw new Error(`Invalid subtitle settings: ${validationError}`)
    }
    const validated = { ...settings } as unknown as SubtitleSettings
    validated.hideOnHover ??= store.get('subtitleSettings').hideOnHover ?? false
    validated.captionMode ??= store.get('subtitleSettings').captionMode ?? 'realtime'
    const previous = store.get('subtitleSettings')
    store.set('subtitleSettings', validated)
    ctx.subtitleWindow?.webContents.send('subtitle-settings-changed', validated)
    if (validated.position !== previous?.position) resetSubtitlePosition(ctx)
    else if (process.platform === 'win32' && (validated.captionMode === 'record') !== (previous?.captionMode === 'record')) {
      resizeSubtitleWindow(ctx)
    }
  })

  ipcMain.handle('save-settings', (_event, settings: Record<string, unknown>) => {
    if ('speechToneMode' in settings && !isSpeechToneMode(settings.speechToneMode)) throw new Error('Invalid speech tone setting')
    if ('systemLoopbackDeviceId' in settings &&
      (typeof settings.systemLoopbackDeviceId !== 'string' || settings.systemLoopbackDeviceId.length > 512)) {
      throw new Error('Invalid system audio input')
    }
    // Conf decrypts and writes the complete store on every set. Commit the
    // renderer's settings together before starting the translation pipeline.
    store.set(settings as Parameters<typeof store.set>[0])
    if ('speechToneMode' in settings) ctx.pipeline?.setSpeechToneMode(settings.speechToneMode)
  })

  /** Sync the merged glossary (personal + org) to the running pipeline */
  function syncMergedGlossary(): void {
    if (!ctx.pipeline) return
    const personal = store.get('glossaryTerms') || []
    const org = store.get('orgGlossaryTerms') || []
    ctx.pipeline.setGlossary(mergeGlossaries(personal, org))
  }

  // Glossary terms persistence (#240)
  ipcMain.handle('save-glossary', (_event, terms: Array<{ source: string; target: string }>) => {
    store.set('glossaryTerms', terms)
    syncMergedGlossary()
  })

  // Organization glossary persistence (#517)
  ipcMain.handle('save-org-glossary', (_event, terms: Array<{ source: string; target: string }>) => {
    store.set('orgGlossaryTerms', terms)
    syncMergedGlossary()
  })

  // Import glossary from file via native dialog (#517)
  ipcMain.handle('import-glossary', async (_event, target: 'personal' | 'org') => {
    const win = ctx.mainWindow
    if (!win) return { error: 'No main window' }

    const result = await dialog.showOpenDialog(win, {
      title: translateUiText('Import JSON/CSV', getUiLanguageState().locale),
      filters: [
        { name: 'JSON / CSV', extensions: ['json', 'csv'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'CSV', extensions: ['csv'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    const filePath = result.filePaths[0]
    try {
      const format = detectGlossaryFormat(filePath)
      if (!format) {
        return { error: 'Unsupported file format. Use .json or .csv files.' }
      }

      const content = await readFile(filePath, 'utf-8')
      const entries = parseGlossary(content, format)

      if (entries.length === 0) {
        return { error: 'No valid glossary entries found in file.' }
      }

      const storeKey = target === 'org' ? 'orgGlossaryTerms' : 'glossaryTerms'
      store.set(storeKey, entries)
      syncMergedGlossary()

      _log.info(`Imported ${entries.length} ${target} glossary entries from ${filePath}`)
      return { entries, count: entries.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      _log.error(`Glossary import failed: ${message}`)
      return { error: `Import failed: ${message}` }
    }
  })

  // Export glossary to file via native dialog (#517)
  ipcMain.handle('export-glossary', async (_event, target: 'personal' | 'org', format: 'json' | 'csv') => {
    const win = ctx.mainWindow
    if (!win) return { error: 'No main window' }

    const storeKey = target === 'org' ? 'orgGlossaryTerms' : 'glossaryTerms'
    const terms = store.get(storeKey) || []

    if (terms.length === 0) {
      return { error: 'No glossary terms to export.' }
    }

    const ext = format === 'json' ? 'json' : 'csv'
    const result = await dialog.showSaveDialog(win, {
      title: translateUiText(format === 'json' ? 'Export JSON' : 'Export CSV', getUiLanguageState().locale),
      defaultPath: `glossary-${target}.${ext}`,
      filters: [
        { name: format === 'json' ? 'JSON' : 'CSV', extensions: [ext] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    try {
      const content = format === 'json'
        ? exportJsonGlossary(terms)
        : exportCsvGlossary(terms)
      await writeFile(result.filePath, content, 'utf-8')
      _log.info(`Exported ${terms.length} ${target} glossary entries to ${result.filePath}`)
      return { success: true, path: result.filePath, count: terms.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      _log.error(`Glossary export failed: ${message}`)
      return { error: `Export failed: ${message}` }
    }
  })

  // Get merged glossary preview (#517)
  ipcMain.handle('get-merged-glossary', () => {
    const personal = store.get('glossaryTerms') || []
    const org = store.get('orgGlossaryTerms') || []
    const merged = mergeGlossaries(personal, org)
    // Find conflicts: entries where same source exists in both with different targets
    const personalMap = new Map(personal.map((e) => [e.source, e.target]))
    const conflicts = org
      .filter((e) => personalMap.has(e.source) && personalMap.get(e.source) !== e.target)
      .map((e) => ({
        source: e.source,
        personalTarget: personalMap.get(e.source)!,
        orgTarget: e.target
      }))
    return { merged, conflicts, personalCount: personal.length, orgCount: org.length }
  })

  // Save a user correction as a glossary entry and record in correction history (#590)
  ipcMain.handle('save-correction', (_event, correction: {
    sourceText: string
    originalTranslation: string
    correctedTranslation: string
  }) => {
    const { sourceText, originalTranslation, correctedTranslation } = correction
    if (!sourceText?.trim() || !correctedTranslation?.trim()) {
      return { error: 'Source text and corrected translation are required' }
    }

    // Add to personal glossary (deduplicates by source term)
    const glossary = store.get('glossaryTerms') || []
    const existingIdx = glossary.findIndex((e) => e.source === sourceText)
    if (existingIdx >= 0) {
      glossary[existingIdx] = { source: sourceText, target: correctedTranslation }
    } else {
      glossary.push({ source: sourceText, target: correctedTranslation })
    }
    store.set('glossaryTerms', glossary)
    syncMergedGlossary()

    // Record in correction history
    const history = store.get('correctionHistory') || []
    const entry: CorrectionEntry = {
      sourceText,
      originalTranslation: originalTranslation || '',
      correctedTranslation,
      timestamp: Date.now()
    }
    // Keep last 500 entries to avoid unbounded growth
    history.push(entry)
    if (history.length > 500) history.splice(0, history.length - 500)
    store.set('correctionHistory', history)

    _log.info(`Correction saved: "${sourceText}" -> "${correctedTranslation}" (was: "${originalTranslation}")`)
    return { success: true, glossaryCount: glossary.length }
  })

  // Get correction history (#590)
  ipcMain.handle('get-correction-history', () => {
    return store.get('correctionHistory') || []
  })

  // Clear correction history (#590)
  ipcMain.handle('clear-correction-history', () => {
    store.set('correctionHistory', [])
    return { success: true }
  })

  // #54: crash recovery — check if previous session ended uncleanly
  ipcMain.handle('get-crashed-session', () => {
    const session = store.get('activeSession')
    if (session) {
      // Clear it so we don't keep detecting the same crash
      store.set('activeSession', null)
      // Validate config has required fields
      const config = session.config
      if (config && typeof config === 'object' && config.mode) {
        return session
      }
      _log.warn('Invalid session config, discarding:', config)
    }
    return null
  })
}
