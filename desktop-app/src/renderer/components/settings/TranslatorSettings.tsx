import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'
import { LLM_ENGINE_MODES, disclosureArrowStyle, disclosureToggleStyle, inputStyle, radioLabelStyle, selectStyle } from './shared'
import type { EngineMode } from './shared'

interface TranslatorSettingsProps {
  engineMode: EngineMode
  onEngineModeChange: (v: EngineMode) => void
  platform: string
  disabled: boolean
  // GPU info
  gpuInfo: { hasGpu: boolean; gpuNames: string[] } | null
  // SLM options (for Hunyuan-MT)
  slmKvCacheQuant: boolean
  onSlmKvCacheQuantChange: (v: boolean) => void
  slmSpeculativeDecoding: boolean
  onSlmSpeculativeDecodingChange: (v: boolean) => void
  simulMtEnabled: boolean
  onSimulMtEnabledChange: (v: boolean) => void
  simulMtWaitK: number
  onSimulMtWaitKChange: (v: number) => void
  // Adaptive routing (#547)
  adaptiveRoutingEnabled: boolean
  onAdaptiveRoutingEnabledChange: (v: boolean) => void
  adaptiveRoutingShortThreshold: number
  onAdaptiveRoutingShortThresholdChange: (v: number) => void
  adaptiveRoutingLongThreshold: number
  onAdaptiveRoutingLongThresholdChange: (v: number) => void
  adaptiveRoutingQualityEngine: string
  onAdaptiveRoutingQualityEngineChange: (v: string) => void
  // API keys
  apiKey: string
  onApiKeyChange: (v: string) => void
  deeplApiKey: string
  onDeeplApiKeyChange: (v: string) => void
  geminiApiKey: string
  onGeminiApiKeyChange: (v: string) => void
  microsoftApiKey: string
  onMicrosoftApiKeyChange: (v: string) => void
  microsoftRegion: string
  onMicrosoftRegionChange: (v: string) => void
  // Cloud realtime interpretation (#722, BYOK)
  openaiApiKey: string
  onOpenaiApiKeyChange: (v: string) => void
  cloudRealtimeEnabled: boolean
  onCloudRealtimeEnabledChange: (v: boolean) => void
  // Gemini Live realtime interpretation (#723, BYOK, preview)
  geminiLiveApiKey: string
  onGeminiLiveApiKeyChange: (v: string) => void
  geminiLiveEnabled: boolean
  onGeminiLiveEnabledChange: (v: boolean) => void
  // API options visibility (controlled by parent for settings restore)
  showApiOptions: boolean
  onShowApiOptionsChange: (v: boolean) => void
}

export function TranslatorSettings({
  engineMode,
  onEngineModeChange,
  platform,
  disabled,
  gpuInfo,
  slmKvCacheQuant,
  onSlmKvCacheQuantChange,
  slmSpeculativeDecoding,
  onSlmSpeculativeDecodingChange,
  simulMtEnabled,
  onSimulMtEnabledChange,
  simulMtWaitK,
  onSimulMtWaitKChange,
  adaptiveRoutingEnabled,
  onAdaptiveRoutingEnabledChange,
  adaptiveRoutingShortThreshold,
  onAdaptiveRoutingShortThresholdChange,
  adaptiveRoutingLongThreshold,
  onAdaptiveRoutingLongThresholdChange,
  adaptiveRoutingQualityEngine,
  onAdaptiveRoutingQualityEngineChange,
  apiKey,
  onApiKeyChange,
  deeplApiKey,
  onDeeplApiKeyChange,
  geminiApiKey,
  onGeminiApiKeyChange,
  microsoftApiKey,
  onMicrosoftApiKeyChange,
  microsoftRegion,
  onMicrosoftRegionChange,
  openaiApiKey,
  onOpenaiApiKeyChange,
  cloudRealtimeEnabled,
  onCloudRealtimeEnabledChange,
  geminiLiveApiKey,
  onGeminiLiveApiKeyChange,
  geminiLiveEnabled,
  onGeminiLiveEnabledChange,
  showApiOptions,
  onShowApiOptionsChange
}: TranslatorSettingsProps): React.JSX.Element {
  const showLlmOptions = LLM_ENGINE_MODES.includes(engineMode)

  // 'rotation' (API auto) requires at least one API key — disabled when none configured
  const hasAnyApiKey = !!(apiKey || deeplApiKey || geminiApiKey || (microsoftApiKey && microsoftRegion))

  // #722: cloud realtime interpretation needs an OpenAI key (BYOK)
  const hasOpenaiKey = !!openaiApiKey

  // #723: the Gemini Live path needs its own Live-enabled key (BYOK)
  const hasGeminiLiveKey = !!geminiLiveApiKey
  // Only one e2e path can own a session and the cloud realtime toggle owns the
  // decision outright when set (see buildEngineConfig), so the preview toggle is
  // inert while it is on — mirror that here rather than letting the checkbox imply
  // it has an effect.
  const geminiLiveSupersededByOpenai = cloudRealtimeEnabled

  return (
    <>
      <Section label={t("Translation Engine")} helpText={t("Auto picks the best engine for your setup. HY-MT 1.5 is the recommended offline default.")}>
        <fieldset role="radiogroup" aria-label={t("Translation Engine")} style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}>
        <legend style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>{t("Translation Engine")}</legend>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="engine"
            checked={engineMode === 'auto'}
            onChange={() => onEngineModeChange('auto')}
            disabled={disabled}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Auto (Recommended)")}</div>
          </div>
        </label>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="engine"
            checked={engineMode === 'offline-hymt15'}
            onChange={() => onEngineModeChange('offline-hymt15')}
            disabled={disabled}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("HY-MT 1.5 (Offline default)")}</div>
          </div>
        </label>
        <label style={radioLabelStyle}>
          <input type="radio" name="engine" checked={engineMode === 'offline-hymt2'}
            onChange={() => onEngineModeChange('offline-hymt2')} disabled={disabled} />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Hy-MT2 7B (Offline)")}</div>
          </div>
        </label>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="engine"
            checked={engineMode === 'offline-hunyuan-mt'}
            onChange={() => onEngineModeChange('offline-hunyuan-mt')}
            disabled={disabled}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Hunyuan-MT 7B (High Quality, GPU recommended)")}</div>
          </div>
        </label>
        {platform === 'darwin' && (
          <label style={radioLabelStyle}>
            <input
              type="radio"
              name="engine"
              checked={engineMode === 'offline-apple'}
              onChange={() => onEngineModeChange('offline-apple')}
              disabled={disabled}
            />
            <div>
              <div style={{ fontWeight: 500 }}>{t("Apple Translate (Built-in, macOS 15+)")}</div>
            </div>
          </label>
        )}
        <label style={{ ...radioLabelStyle, opacity: hasAnyApiKey ? 1 : 0.5 }}>
          <input
            type="radio"
            name="engine"
            checked={engineMode === 'rotation'}
            onChange={() => onEngineModeChange('rotation')}
            disabled={disabled || !hasAnyApiKey}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Online API (Auto Rotation)")}</div>
            {!hasAnyApiKey && <div>{t("Configure an API key below to enable cloud translation")}</div>}
          </div>
        </label>

        {/* LLM sub-options for HY-MT 1.5 and Hunyuan-MT 7B */}
        {showLlmOptions && (
          <>
            {gpuInfo && !gpuInfo.hasGpu && (
              <div style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 0 4px 24px' }}>{t("No GPU detected — translation may be slow on CPU-only systems")} </div>
            )}
            <label style={{ ...radioLabelStyle, paddingLeft: '24px' }}>
              <input
                type="checkbox"
                checked={slmKvCacheQuant}
                onChange={(e) => onSlmKvCacheQuantChange(e.target.checked)}
                disabled={disabled}
              />
              <div>
                <div style={{ fontWeight: 500, fontSize: '12px' }}>{t("KV cache quantization (Q8_0)")}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t("Reduces VRAM ~50%")}</div>
              </div>
            </label>
            {(engineMode === 'offline-hymt15' || engineMode === 'offline-hymt2' || engineMode === 'offline-hunyuan-mt') && (
              <label style={{ ...radioLabelStyle, paddingLeft: '24px' }}>
                <input
                  type="checkbox"
                  checked={slmSpeculativeDecoding}
                  onChange={(e) => onSlmSpeculativeDecodingChange(e.target.checked)}
                  disabled={disabled}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '12px' }}>{t("Speculative decoding (LFM2 draft)")}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t("LFM2-350M proposes draft tokens for the main model to verify. Speed gains depend on the selected model and input.")} </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>{t("Requires LFM2 model (~230MB). Extra memory: ~230MB on top of the main model.")} </div>
                </div>
              </label>
            )}
            <label style={{ ...radioLabelStyle, paddingLeft: '24px' }}>
              <input
                type="checkbox"
                checked={simulMtEnabled}
                onChange={(e) => onSimulMtEnabledChange(e.target.checked)}
                disabled={disabled}
              />
              <div>
                <div style={{ fontWeight: 500, fontSize: '12px' }}>{t("Conversational SimulMT (recommended for live streams)")}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t("Show an early provisional translation with KV cache reuse, then correct it when the sentence completes.")}</div>
              </div>
            </label>
            {simulMtEnabled && (
              <div style={{ paddingLeft: '48px', marginTop: '-4px', marginBottom: '4px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>{t("Wait-k: start after")} {simulMtWaitK} {t("words/chars")} </div>
                <input
                  type="range"
                  aria-label={t("Wait-k value")}
                  min={1}
                  max={10}
                  value={simulMtWaitK}
                  onChange={(e) => onSimulMtWaitKChange(Number(e.target.value))}
                  disabled={disabled}
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </>
        )}

        {/* Adaptive Quality Routing (#547) — only for offline LLM engines */}
        {showLlmOptions && (
          <div style={{ marginTop: '8px', paddingLeft: '24px' }}>
            <label style={radioLabelStyle}>
              <input
                type="checkbox"
                checked={adaptiveRoutingEnabled}
                onChange={(e) => onAdaptiveRoutingEnabledChange(e.target.checked)}
                disabled={disabled}
              />
              <div>
                <div style={{ fontWeight: 500, fontSize: '12px' }}>{t("Adaptive quality routing")}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t("Auto-route: short sentences use fast engine, complex ones use quality engine")} </div>
              </div>
            </label>
            {adaptiveRoutingEnabled && (
              <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{t("Quality engine")} </div>
                  <select
                    value={adaptiveRoutingQualityEngine}
                    onChange={(e) => onAdaptiveRoutingQualityEngineChange(e.target.value)}
                    disabled={disabled}
                    style={{ ...selectStyle, fontSize: '12px', padding: '6px 8px' }}
                  >
                    <option value="hunyuan-mt">{t("Hunyuan-MT 7B (Quality, ~4GB)")}</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{t("Fast-only threshold: <")}{adaptiveRoutingShortThreshold} {t("tokens")} </div>
                  <input
                    type="range"
                    aria-label={t("Short threshold")}
                    min={3}
                    max={30}
                    value={adaptiveRoutingShortThreshold}
                    onChange={(e) => onAdaptiveRoutingShortThresholdChange(Number(e.target.value))}
                    disabled={disabled}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{t("Quality threshold: >")}{adaptiveRoutingLongThreshold} {t("tokens")} </div>
                  <input
                    type="range"
                    aria-label={t("Long threshold")}
                    min={20}
                    max={100}
                    value={adaptiveRoutingLongThreshold}
                    onChange={(e) => onAdaptiveRoutingLongThresholdChange(Number(e.target.value))}
                    disabled={disabled}
                    style={{ width: '100%' }}
                  />
                </div>
                {adaptiveRoutingShortThreshold >= adaptiveRoutingLongThreshold && (
                  <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px' }}>{t("Warning: thresholds overlap — all text will use the fast engine only")} </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* API Keys — collapsed by default. Enables 'Online API' option above. */}
        <div style={{ marginTop: '12px' }}>
          <button
            onClick={() => onShowApiOptionsChange(!showApiOptions)}
            aria-expanded={showApiOptions}
            style={disclosureToggleStyle}
          >
            <span style={disclosureArrowStyle(showApiOptions)}>
              ▶
            </span>{t("API Keys (optional — enables online translation)")} </button>

          {showApiOptions && (
            <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={t("Google Cloud Translation key")}
                aria-label={t("Google Cloud Translation API key")}
                style={inputStyle}
                disabled={disabled}
              />
              <input
                type="password"
                value={deeplApiKey}
                onChange={(e) => onDeeplApiKeyChange(e.target.value)}
                placeholder={t("DeepL API key")}
                aria-label={t("DeepL API key")}
                style={inputStyle}
                disabled={disabled}
              />
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => onGeminiApiKeyChange(e.target.value)}
                placeholder={t("Gemini API key")}
                aria-label={t("Gemini API key")}
                style={inputStyle}
                disabled={disabled}
              />
              <input
                type="password"
                value={microsoftApiKey}
                onChange={(e) => onMicrosoftApiKeyChange(e.target.value)}
                placeholder={t("Azure Microsoft Translator key")}
                aria-label={t("Azure Microsoft Translator key")}
                style={inputStyle}
                disabled={disabled}
              />
              <input
                type="text"
                value={microsoftRegion}
                onChange={(e) => onMicrosoftRegionChange(e.target.value)}
                placeholder={t("Azure region (e.g. eastus)")}
                aria-label={t("Azure region")}
                style={inputStyle}
                disabled={disabled}
              />
              <div style={{ marginTop: '6px', padding: '8px', border: '1px solid #334155', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>{t("Use one provider directly")} </div>
                {([
                  ['online', 'Google Cloud Translation', !!apiKey],
                  ['online-deepl', 'DeepL', !!deeplApiKey],
                  ['online-gemini', 'Gemini 2.5 Flash', !!geminiApiKey],
                  ['online-microsoft', 'Microsoft Translator', !!(microsoftApiKey && microsoftRegion)]
                ] as Array<[EngineMode, string, boolean]>).map(([mode, label, available]) => (
                  <label key={mode} style={{ ...radioLabelStyle, opacity: available ? 1 : 0.5 }}>
                    <input
                      type="radio"
                      name="engine"
                      checked={engineMode === mode}
                      onChange={() => onEngineModeChange(mode)}
                      disabled={disabled || !available}
                    />
                    <div>
                      <div style={{ fontWeight: 500 }}>{label}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {available ? t("Use this provider only") : t("Add the required key above")}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => onOpenaiApiKeyChange(e.target.value)}
                placeholder={t("OpenAI API key (realtime interpretation)")}
                aria-label={t("OpenAI API key")}
                style={inputStyle}
                disabled={disabled}
              />
              <input
                type="password"
                value={geminiLiveApiKey}
                onChange={(e) => onGeminiLiveApiKeyChange(e.target.value)}
                placeholder={t("Gemini Live API key (realtime interpretation)")}
                aria-label={t("Gemini Live API key")}
                style={inputStyle}
                disabled={disabled}
              />
            </div>
          )}
        </div>
        </fieldset>
      </Section>

      {/* #722: Cloud realtime interpretation — a separate capability axis from the
          engine radios above, so the 4-engine UI cap is respected. Opt-in, BYOK,
          off by default (local-first stays Core Value ①). */}
      <Section
        label={t("Realtime Interpretation (Cloud)")}
        helpText={t("Speech-native low-latency translation via OpenAI gpt-realtime-translate. Requires an OpenAI API key and sends audio to the cloud — off by default to keep the offline local-first engines as the default.")}
      >
        <label style={{ ...radioLabelStyle, opacity: hasOpenaiKey ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={cloudRealtimeEnabled}
            onChange={(e) => onCloudRealtimeEnabledChange(e.target.checked)}
            disabled={disabled || !hasOpenaiKey}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Enable cloud realtime interpretation (BYOK)")}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {hasOpenaiKey
                ? t("Overrides the engine above while active. Cloud — audio leaves your device. ~$0.034/min. Output language follows your target-language setting.")
                : t("Add an OpenAI API key in \"API Keys\" above to enable cloud realtime interpretation.")}
            </div>
          </div>
        </label>
        {cloudRealtimeEnabled && hasOpenaiKey && (
          <div style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 0 0 24px' }}>{t("Cloud mode active — the offline engine selection above is bypassed while this is on.")} </div>
        )}
      </Section>

      {/* #723: second cloud realtime path, for comparison against gpt-realtime-translate.
          Preview model — flagged experimental and never a default. */}
      <Section
        label={t("Realtime Interpretation (Gemini Live)")}
        helpText={t("Experimental second cloud path via Google's gemini-3.5-live-translate-preview. Preview models can change or break without notice, so this is for comparison — not for production meetings. Requires a Gemini Live API key and sends audio to the cloud.")}
      >
        <div
          style={{
            display: 'inline-block',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: '#f59e0b',
            border: '1px solid #f59e0b',
            borderRadius: '3px',
            padding: '1px 5px',
            marginBottom: '6px'
          }}
        >{t("EXPERIMENTAL · PREVIEW")} </div>
        <label style={{ ...radioLabelStyle, opacity: hasGeminiLiveKey ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={geminiLiveEnabled}
            onChange={(e) => onGeminiLiveEnabledChange(e.target.checked)}
            disabled={disabled || !hasGeminiLiveKey}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{t("Enable Gemini Live interpretation (BYOK, preview)")}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {hasGeminiLiveKey
                ? t("Preview model — quality and availability may change without notice. Cloud — audio leaves your device. ~$0.0368/min. Output language follows your target-language setting.")
                : t("Add a Gemini Live API key in \"API Keys\" above to enable this experimental path.")}
            </div>
          </div>
        </label>
        {geminiLiveEnabled && hasGeminiLiveKey && geminiLiveSupersededByOpenai && (
          <div style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 0 0 24px' }}>
            {hasOpenaiKey
              ? t("Inactive — \"Realtime Interpretation (Cloud)\" takes precedence. Turn that off to run Gemini Live.")
              : t("Inactive — \"Realtime Interpretation (Cloud)\" is on but has no API key, so the offline engine is translating. Turn that off to run Gemini Live.")}
          </div>
        )}
        {geminiLiveEnabled && hasGeminiLiveKey && !geminiLiveSupersededByOpenai && (
          <div style={{ fontSize: '11px', color: '#f59e0b', padding: '4px 0 0 24px' }}>{t("Preview cloud mode active — the offline engine selection above is bypassed while this is on.")} </div>
        )}
      </Section>

    </>
  )
}
