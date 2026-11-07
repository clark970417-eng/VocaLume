import { GlossarySettings } from './settings/GlossarySettings'
import { FileTranslationSettings } from './settings/FileTranslationSettings'
import { useFileTranslation } from '../hooks/useFileTranslation'
import { ObsCaptionSettings } from './settings/ObsCaptionSettings'
import { t } from '../ui-language'
import React, { useEffect, useRef, useState } from 'react'
import { useSettingsState } from '../hooks/useSettingsState'
import { SettingsNavigation, type SettingsTab } from './SettingsNavigation'
import './settings-panel.css'
import { Onboarding } from './Onboarding'
import { InterfaceLanguage } from './InterfaceLanguage'
import { useUiLanguage } from '../ui-language'
import { SpeechToneSettings } from './settings/SpeechToneSettings'
import {
  AudioSettings,
  LanguageSettings,
  STTSettings,
  TranslatorSettings,
  SubtitleSettings,
  TTSSettings,
  SessionControls,
  UpdateStatus,
  SupportSettings,
  CrashRecoveryBanner,
  ConfigSummary,
  EnterpriseSettings,
  KeyboardShortcuts,
  AccessibilitySettings,
  SpeakerSettings,
  CorrectionHistory,
  ModelDownloadProgress
} from './settings'

function SettingsPanel(): React.JSX.Element {
  useUiLanguage()
  const s = useSettingsState()
  const [selectedTab, setSelectedTab] = useState<SettingsTab>('translate')
  const [visited, setVisited] = useState<Partial<Record<SettingsTab, boolean>>>({ translate: true })
  const contentRef = useRef<HTMLElement>(null)
  const selectTab = (tab: SettingsTab): void => {
    setSelectedTab(tab)
    setVisited(previous => ({ ...previous, [tab]: true }))
    if (contentRef.current) contentRef.current.scrollTop = 0
  }
  const [gerEnabled, setGerEnabled] = useState(false)
  useEffect(() => { window.api.getSettings().then(v => setGerEnabled(!!v.gerEnabled)) }, [])
  const disabled = s.isRunning || s.isStarting
  const { mediaJobId, translatePath, cancelMediaFile, watchFolder, toggleWatchFolder, rows, editCue, reviewFile, setReviewFile } =
    useFileTranslation({ disabled, handleStart: s.handleStart, handleStop: s.handleStop, setStatus: s.setStatus })

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)

  // Decide whether to show the first-run Onboarding (#708)
  useEffect(() => {
    window.api.quickStartIsCompleted().then((completed) => {
      setShowOnboarding(!completed)
      setOnboardingChecked(true)
    }).catch(() => {
      setOnboardingChecked(true)
    })
  }, [])

  // Listen for global shortcut actions from main process (#551)
  useEffect(() => {
    const unsub = window.api.onShortcutAction?.((action: string) => {
      if (action === 'toggle-capture-start' && !s.isRunning && !s.isStarting) {
        s.handleStart()
      } else if (action === 'toggle-capture-stop' && s.isRunning) {
        s.handleStop()
      }
    })
    const unsubLang = window.api.onLanguageSwitched?.((data: { sourceLanguage: string; targetLanguage: string }) => {
      s.setSourceLanguage(data.sourceLanguage as never)
      s.setTargetLanguage(data.targetLanguage as never)
    })
    return () => {
      unsub?.()
      unsubLang?.()
    }
  }, [s.isRunning, s.isStarting, s.handleStart, s.handleStop])

  // Show nothing until we know whether to show Onboarding
  if (!onboardingChecked) {
    return <div style={containerStyle} />
  }

  // Show the three-step onboarding for first-time users (#708)
  if (showOnboarding) {
    return (
      <div style={containerStyle}>
        <InterfaceLanguage />
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </div>
    )
  }

  return (
    <div className="settings-shell">
      <header className="settings-header">
        <InterfaceLanguage />
        <h1>VocaLume</h1>
      </header>
      <SettingsNavigation selected={selectedTab} onSelect={selectTab} />
      <main className="settings-content" ref={contentRef}>
        {disabled && <div className="settings-notice">{t("Translation is active. Stop to change languages or models; subtitle appearance can be adjusted now.")}</div>}
        {s.crashedSession && !s.isRunning && <CrashRecoveryBanner isStarting={s.isStarting} onResume={s.handleResume} onDismiss={s.handleDismissResume} />}
      <ModelDownloadProgress
        onSwitchToLocal={(engine) => {
          s.setEngineMode(engine as never)
          window.api.saveSettings({ translationEngine: engine })
        }}
        onDismiss={() => {
          // No-op: banner hides itself
        }}
        disabled={disabled}
      />

        <section id="settings-panel-translate" role="tabpanel" aria-labelledby="settings-tab-translate" tabIndex={0} hidden={selectedTab !== 'translate'}>
          <h2>{t("What would you like to translate?")}</h2>
          <LanguageSettings
            sourceLanguage={s.sourceLanguage}
            onSourceLanguageChange={s.setSourceLanguage}
            targetLanguage={s.targetLanguage}
            onTargetLanguageChange={s.setTargetLanguage}
            disabled={disabled}
          />

      <AudioSettings
        showLevel={selectedTab === 'translate'}
        audio={s.audio}
        disabled={disabled}
        noiseSuppressionEnabled={s.noiseSuppression.enabled}
        onNoiseSuppressionChange={s.noiseSuppression.setEnabled}
        platform={s.platform}
        streamingIntervalMs={s.streamingIntervalMs}
        onStreamingIntervalChange={(v) => {
          s.setStreamingIntervalMs(v)
          window.api.saveSettings({ streamingIntervalMs: v })
        }}
      />

          <GlossarySettings
            disabled={disabled || mediaJobId !== null}
            glossaryTerms={s.glossaryTerms}
            onGlossaryTermsChange={s.setGlossaryTerms}
            orgGlossaryTerms={s.orgGlossaryTerms}
            onOrgGlossaryTermsChange={s.setOrgGlossaryTerms}
          />

        </section>
        <section id="settings-panel-files" role="tabpanel" aria-labelledby="settings-tab-files" tabIndex={0} hidden={selectedTab !== 'files'}>
          {visited.files && <FileTranslationSettings
            disabled={disabled || mediaJobId !== null}
            jobId={mediaJobId}
            watchFolder={watchFolder}
            onToggleWatchFolder={toggleWatchFolder}
            onTranslateFile={file => translatePath(window.api.getPathForFile(file), file.name)}
            onCancel={cancelMediaFile}
            rows={rows}
            onEditCue={editCue}
            review={reviewFile}
            onReview={setReviewFile}
          />}
        </section>
        <section id="settings-panel-subtitles" role="tabpanel" aria-labelledby="settings-tab-subtitles" tabIndex={0} hidden={selectedTab !== 'subtitles'}>
          {visited.subtitles && <>
            <h2>{t("Subtitles & OBS")}</h2>
          <SubtitleSettings
            fontSize={s.subtitleFontSize}
            onFontSizeChange={(v) => { s.setSubtitleFontSize(v); s.pushSubtitleSettings({ fontSize: v }) }}
            sourceColor={s.subtitleSourceColor}
            onSourceColorChange={(v) => { s.setSubtitleSourceColor(v); s.pushSubtitleSettings({ sourceTextColor: v }) }}
            translatedColor={s.subtitleTranslatedColor}
            onTranslatedColorChange={(v) => { s.setSubtitleTranslatedColor(v); s.pushSubtitleSettings({ translatedTextColor: v }) }}
            bgOpacity={s.subtitleBgOpacity}
            onBgOpacityChange={(v) => { s.setSubtitleBgOpacity(v); s.pushSubtitleSettings({ backgroundOpacity: v }) }}
            position={s.subtitlePosition}
            onPositionChange={(v) => { s.setSubtitlePosition(v); s.pushSubtitleSettings({ position: v }) }}
            lowPowerRendering={s.lowPowerRendering}
            onLowPowerRenderingChange={(v) => { s.setLowPowerRendering(v); s.pushSubtitleSettings({ lowPowerRendering: v }) }}
            showConfidenceIndicator={s.showConfidenceIndicator}
            onShowConfidenceIndicatorChange={(v) => {
              s.setShowConfidenceIndicator(v)
              s.pushSubtitleSettings({ showConfidenceIndicator: v })
              window.api.saveSettings({ showConfidenceIndicator: v })
            }}
            displays={s.displays}
            selectedDisplay={s.selectedDisplay}
            onDisplayChange={s.handleDisplayChange}
          />

            <ObsCaptionSettings />
            <details className="settings-disclosure"><summary>{t("Reading & accessibility")}</summary>
          <AccessibilitySettings
            highContrast={s.accessibility.highContrast}
            onHighContrastChange={(v) => { s.accessibility.setHighContrast(v); s.pushSubtitleSettings({ accessibility: { highContrast: v, dyslexiaFont: s.accessibility.dyslexiaFont, reducedMotion: s.accessibility.reducedMotion, letterSpacing: s.accessibility.letterSpacing, wordSpacing: s.accessibility.wordSpacing } }) }}
            dyslexiaFont={s.accessibility.dyslexiaFont}
            onDyslexiaFontChange={(v) => { s.accessibility.setDyslexiaFont(v); s.pushSubtitleSettings({ accessibility: { highContrast: s.accessibility.highContrast, dyslexiaFont: v, reducedMotion: s.accessibility.reducedMotion, letterSpacing: s.accessibility.letterSpacing, wordSpacing: s.accessibility.wordSpacing } }) }}
            reducedMotion={s.accessibility.reducedMotion}
            onReducedMotionChange={(v) => { s.accessibility.setReducedMotion(v); s.pushSubtitleSettings({ accessibility: { highContrast: s.accessibility.highContrast, dyslexiaFont: s.accessibility.dyslexiaFont, reducedMotion: v, letterSpacing: s.accessibility.letterSpacing, wordSpacing: s.accessibility.wordSpacing } }) }}
            letterSpacing={s.accessibility.letterSpacing}
            onLetterSpacingChange={(v) => { s.accessibility.setLetterSpacing(v); s.pushSubtitleSettings({ accessibility: { highContrast: s.accessibility.highContrast, dyslexiaFont: s.accessibility.dyslexiaFont, reducedMotion: s.accessibility.reducedMotion, letterSpacing: v, wordSpacing: s.accessibility.wordSpacing } }) }}
            wordSpacing={s.accessibility.wordSpacing}
            onWordSpacingChange={(v) => { s.accessibility.setWordSpacing(v); s.pushSubtitleSettings({ accessibility: { highContrast: s.accessibility.highContrast, dyslexiaFont: s.accessibility.dyslexiaFont, reducedMotion: s.accessibility.reducedMotion, letterSpacing: s.accessibility.letterSpacing, wordSpacing: v } }) }}
          />

            </details>
          </>}
        </section>
        <section id="settings-panel-models" role="tabpanel" aria-labelledby="settings-tab-models" tabIndex={0} hidden={selectedTab !== 'models'}>
          {visited.models && <>
            <h2>{t("Models & translation quality")}</h2>
      <ConfigSummary
        sttEngine={s.sttEngine}
        whisperVariant={s.whisperVariant}
        engineMode={s.engineMode}
        sourceLanguage={s.sourceLanguage}
        targetLanguage={s.targetLanguage}
        gpuInfo={s.gpuInfo}
      />

          <STTSettings
            sttEngine={s.sttEngine}
            onSttEngineChange={s.setSttEngine}
            whisperVariant={s.whisperVariant}
            onWhisperVariantChange={s.setWhisperVariant}
            platform={s.platform}
            isMacOS26={s.isMacOS26}
            disabled={disabled}
            sourceLanguage={s.sourceLanguage}
            draftSttEnabled={s.draftSttEnabled}
            onDraftSttEnabledChange={s.setDraftSttEnabled}
          />

          <TranslatorSettings
            engineMode={s.engineMode}
            onEngineModeChange={s.setEngineMode}
            platform={s.platform}
            disabled={disabled}
            gpuInfo={s.gpuInfo}
            slmKvCacheQuant={s.slmKvCacheQuant}
            onSlmKvCacheQuantChange={s.setSlmKvCacheQuant}
            slmSpeculativeDecoding={s.slmSpeculativeDecoding}
            onSlmSpeculativeDecodingChange={s.setSlmSpeculativeDecoding}
            simulMtEnabled={s.simulMtEnabled}
            onSimulMtEnabledChange={s.setSimulMtEnabled}
            simulMtWaitK={s.simulMtWaitK}
            onSimulMtWaitKChange={s.setSimulMtWaitK}
            adaptiveRoutingEnabled={s.adaptiveRoutingEnabled}
            onAdaptiveRoutingEnabledChange={s.setAdaptiveRoutingEnabled}
            adaptiveRoutingShortThreshold={s.adaptiveRoutingShortThreshold}
            onAdaptiveRoutingShortThresholdChange={s.setAdaptiveRoutingShortThreshold}
            adaptiveRoutingLongThreshold={s.adaptiveRoutingLongThreshold}
            onAdaptiveRoutingLongThresholdChange={s.setAdaptiveRoutingLongThreshold}
            adaptiveRoutingQualityEngine={s.adaptiveRoutingQualityEngine}
            onAdaptiveRoutingQualityEngineChange={s.setAdaptiveRoutingQualityEngine}
            apiKey={s.apiKey}
            onApiKeyChange={s.setApiKey}
            deeplApiKey={s.deeplApiKey}
            onDeeplApiKeyChange={s.setDeeplApiKey}
            geminiApiKey={s.geminiApiKey}
            onGeminiApiKeyChange={s.setGeminiApiKey}
            microsoftApiKey={s.microsoftApiKey}
            onMicrosoftApiKeyChange={s.setMicrosoftApiKey}
            microsoftRegion={s.microsoftRegion}
            onMicrosoftRegionChange={s.setMicrosoftRegion}
            openaiApiKey={s.openaiApiKey}
            onOpenaiApiKeyChange={s.setOpenaiApiKey}
            cloudRealtimeEnabled={s.cloudRealtimeEnabled}
            onCloudRealtimeEnabledChange={s.setCloudRealtimeEnabled}
            geminiLiveApiKey={s.geminiLiveApiKey}
            onGeminiLiveApiKeyChange={s.setGeminiLiveApiKey}
            geminiLiveEnabled={s.geminiLiveEnabled}
            onGeminiLiveEnabledChange={s.setGeminiLiveEnabled}
            showApiOptions={s.showApiOptions}
            onShowApiOptionsChange={s.setShowApiOptions}
          />

            <details className="settings-disclosure"><summary>{t("Recognition corrections & speakers")}</summary>
      <label style={{ display: 'block', marginTop: 12 }}>
        <input type="checkbox" checked={gerEnabled} onChange={async e => {
          const enabled = e.target.checked
          try { await window.api.saveSettings({gerEnabled: enabled}); setGerEnabled(enabled); s.setStatus('Correction setting saved. Restart captions to apply.') }
          catch (error) { s.setStatus(`Could not save: ${String(error)}`) }
        }} /> {t("Correct uncertain recognition (experimental; uses extra processing)")} </label>

              <CorrectionHistory />
          <SpeakerSettings
            speakerDiarizationEnabled={s.speakerDiarizationEnabled}
            onSpeakerDiarizationEnabledChange={s.setSpeakerDiarizationEnabled}
            platform={s.platform}
            disabled={disabled}
          />

            </details>
          </>}
        </section>
        <section id="settings-panel-more" role="tabpanel" aria-labelledby="settings-tab-more" tabIndex={0} hidden={selectedTab !== 'more'}>
          {visited.more && <>
            <h2>{t("More settings")}</h2>
            <details className="settings-disclosure"><summary>{t("Copyright & use")}</summary><p>© 2026 Clark · VocaLume</p><p>{t("Free for noncommercial use. Commercial use and resale require permission. Derivative versions must credit VocaLume in their README and About interface. Third-party licenses remain unchanged.")}</p><a href="https://github.com/clark970417-eng/VocaLume/blob/main/LICENSE" target="_blank" rel="noreferrer">{t("License")} ↗</a></details>
            <details className="settings-disclosure"><summary>{t("Tone & laughter")}</summary><SpeechToneSettings /></details>
            {s.platform && <details className="settings-disclosure"><summary>{t("Voice playback & virtual microphone")}</summary><TTSSettings disabled={disabled} platform={s.platform} /></details>}
            <details className="settings-disclosure"><summary>{t("Saved sessions & summaries")}</summary>
      <SessionControls view="history"
        isRunning={s.isRunning}
        isStarting={s.isStarting}
        engineMode={s.engineMode}
        apiKey={s.apiKey}
        deeplApiKey={s.deeplApiKey}
        geminiApiKey={s.geminiApiKey}
        microsoftApiKey={s.microsoftApiKey}
        microsoftRegion={s.microsoftRegion}
        status={s.status}
        sessionDuration={s.sessionDuration}
        onStart={s.handleStart}
        onStop={s.handleStop}
        lastTranscriptPath={s.lastTranscriptPath}
        summaryText={s.summaryText}
        isSummarizing={s.isSummarizing}
        onGenerateSummary={s.handleGenerateSummary}
        onSetStatus={s.setStatus}
        sessions={s.sessions}
      />

              {!s.sessions.length && !s.lastTranscriptPath && <p className="settings-intro">{t("Completed sessions will appear here.")}</p>}
            </details>
            <details className="settings-disclosure"><summary>{t("Keyboard shortcuts")}</summary><KeyboardShortcuts /></details>
            <details className="settings-disclosure"><summary>{t("Help & updates")}</summary><UpdateStatus /><SupportSettings /></details>
            <details className="settings-disclosure"><summary>{t("Organization & privacy")}</summary><EnterpriseSettings disabled={disabled} /></details>
          </>}
        </section>
      </main>
      <footer className="settings-footer">
        <div className="settings-footer-actions">
          <div>
            <button type="button" className="settings-save" onClick={s.handleSaveSettings} disabled={s.isStarting}>{t("Save settings")}</button>
          </div>
          <div>
      <SessionControls view="controls"
        isRunning={s.isRunning}
        isStarting={s.isStarting}
        engineMode={s.engineMode}
        apiKey={s.apiKey}
        deeplApiKey={s.deeplApiKey}
        geminiApiKey={s.geminiApiKey}
        microsoftApiKey={s.microsoftApiKey}
        microsoftRegion={s.microsoftRegion}
        status={s.status}
        sessionDuration={s.sessionDuration}
        onStart={s.handleStart}
        onStop={mediaJobId ? cancelMediaFile : s.handleStop}
        lastTranscriptPath={s.lastTranscriptPath}
        summaryText={s.summaryText}
        isSummarizing={s.isSummarizing}
        onGenerateSummary={s.handleGenerateSummary}
        onSetStatus={s.setStatus}
        sessions={s.sessions}
      />

          </div>
        </div>
      </footer>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  padding: '1.25rem 1.5rem',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: '#e2e8f0',
  background: '#0f172a',
  minHeight: '100%',
  fontSize: '0.875rem'
}


export default SettingsPanel
