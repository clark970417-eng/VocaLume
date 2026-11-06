import { resolveSpeechEngine } from '../../../engine-selection'
import { t } from '../../ui-language'
import React from 'react'
import { Section } from './Section'
import { selectStyle } from './shared'
import type { SttEngineType, WhisperVariantType, SourceLanguage } from './shared'

interface STTSettingsProps {
  sttEngine: SttEngineType
  onSttEngineChange: (v: SttEngineType) => void
  whisperVariant: WhisperVariantType
  onWhisperVariantChange: (v: WhisperVariantType) => void
  platform: string
  isMacOS26: boolean
  disabled: boolean
  sourceLanguage: SourceLanguage
  draftSttEnabled: boolean
  onDraftSttEnabledChange: (v: boolean) => void
}

export function STTSettings({
  sttEngine,
  onSttEngineChange,
  whisperVariant,
  onWhisperVariantChange,
  platform,
  isMacOS26,
  disabled,
  sourceLanguage,
  draftSttEnabled,
  onDraftSttEnabledChange
}: STTSettingsProps): React.JSX.Element {
  // Kotoba-Whisper outputs JA only — show when source is JA or auto, on Apple Silicon
  const showKotobaWhisper = platform === 'darwin' && (sourceLanguage === 'ja' || sourceLanguage === 'auto')

  const effectiveEngine = resolveSpeechEngine(sourceLanguage, sttEngine, platform === 'darwin' || platform === 'win32')
  const usesHaas = effectiveEngine.startsWith('haas-ja-')
  const usesSenseVoice = /^(zh|yue|en|ko)(?:-|$)/i.test(sourceLanguage)
  const automaticEngine = usesHaas || usesSenseVoice

  return (
    <Section label={t("Speech Recognition")} helpText={t("Choose a speech recognition engine. Whisper Local is recommended for most users.")}>
      <select
        value={effectiveEngine}
        onChange={(e) => onSttEngineChange(e.target.value as SttEngineType)}
        style={selectStyle}
        disabled={disabled || automaticEngine}
        aria-label={t("STT engine")}
      >
        {(platform === 'darwin' || platform === 'win32') && sourceLanguage === 'ja' && <>
          <option value="haas-ja-recommended">Haas-ja Q8_0 · {t("Recommended")}</option>
          <option value="haas-ja-fast">Haas-ja Q8_0 · {t("Fastest recognition")}</option>
        </>}
        {isMacOS26 && (
          <option value="apple-speech-transcriber">{t("Apple Speech (Zero Setup, macOS 26+)")}</option>
        )}
        {showKotobaWhisper && (
          <option value="kotoba-whisper">{t("Kotoba-Whisper v2.0 (JA-optimized, Apple Silicon)")}</option>
        )}
        <option value="sensevoice-sherpa">{t("SenseVoice Small (Offline)")}</option>
        {platform === 'darwin' && (
          <option value="qwen3-asr">{t("Qwen3-ASR 0.6B (Best accuracy, Apple Silicon)")}</option>
        )}
        {platform === 'darwin' && (
          <option value="mlx-whisper">{t("mlx-whisper (Apple Silicon, recommended)")}</option>
        )}
        <option value="whisper-local">{t("Whisper (whisper.cpp)")}</option>
      </select>
      {usesHaas && <label>
        <input type="checkbox" disabled={disabled} checked={effectiveEngine === 'haas-ja-recommended'}
          onChange={event => onSttEngineChange(event.target.checked ? 'haas-ja-recommended' : 'haas-ja-fast')} />
        {t("Use limited phrase hints")}
      </label>}
      {effectiveEngine === 'whisper-local' && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>{t("Whisper Model")} </div>
          <select
            value={whisperVariant}
            onChange={(e) => onWhisperVariantChange(e.target.value as WhisperVariantType)}
            style={selectStyle}
            disabled={disabled}
            aria-label={t("Whisper model variant")}
          >
            <option value="kotoba-v2.0">{t("Kotoba Whisper v2.0 (Japanese-optimized, ~540MB)")}</option>
            <option value="large-v3-turbo">{t("Large v3 Turbo (Multilingual, 6x faster, ~600MB)")}</option>
            <option value="distil-large-v3">{t("Distil Large v3 (5x faster, ~1.5GB)")}</option>
            <option value="small">{t("Small (Fast mode, ~466MB)")}</option>
            <option value="base">{t("Base (Fastest mode, ~142MB)")}</option>
          </select>
          {whisperVariant === 'large-v3-turbo' && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("OpenAI large-v3-turbo: 809M params, 4 decoder layers, within 1-2% WER of large-v3.")} </div>
          )}
          {whisperVariant === 'distil-large-v3' && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("HuggingFace distil-large-v3: 756M params, 2 decoder layers, 5x faster with only 1% WER degradation vs large-v3.")} </div>
          )}
          {whisperVariant === 'small' && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#f59e0b' }}>{t("Fast mode: lower latency (~1-2s) but reduced accuracy. Good for real-time with acceptable quality.")} </div>
          )}
          {whisperVariant === 'base' && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#f59e0b' }}>{t("Fastest mode: minimal latency (<1s) but significantly lower accuracy. Best for speed-critical use cases.")} </div>
          )}
        </div>
      )}
      {sttEngine === 'kotoba-whisper' && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("Kotoba-Whisper v2.0: JA CER 5.6% (31% better than MLX Whisper). Japanese output only.")} {sourceLanguage === 'auto' && (
            <span style={{ color: '#f59e0b' }}>
              {' '}{t("Warning: this model only outputs Japanese. Set source language to JA for best results.")} </span>
          )}
        </div>
      )}
      {sttEngine === 'sensevoice-sherpa' && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("SenseVoice Small: non-autoregressive, ~70ms for 10s audio (15x faster than Whisper-Large). 229MB int8 model, supports JA/EN/ZH/KO with auto language detection. Requires")}{' '}
          <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{t("sherpa-onnx-node")}</span>{t(". Model (~229MB) auto-downloads on first use.")} <div style={{ marginTop: '2px', color: '#22c55e' }}>{t("Benchmark pending — accuracy to be validated against Whisper baselines (#692).")} </div>
        </div>
      )}
      {sttEngine === 'qwen3-asr' && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("Qwen3-ASR 0.6B: JA CER 6.8%, EN WER 1.9% — best combined JA+EN accuracy. Requires")}{' '}
          <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{t("speech-swift")}</span>
          {' '}(
          <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{t("brew tap soniqo/speech https://github.com/soniqo/speech-swift && brew install speech")} </span>{t("). Model (~600MB) auto-downloads on first use.")} <div style={{ marginTop: '2px', color: '#f59e0b' }}>{t("Latency: ~2.2s per chunk (65% slower than MLX Whisper ~1.3s). Best for accuracy over speed.")} </div>
        </div>
      )}
      {sttEngine === 'apple-speech-transcriber' && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("Apple SpeechTranscriber: zero model management, ANE-optimized, 2.2x faster than Whisper Turbo. 40+ languages. Requires")}{' '}
          <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{t("apple-stt")}</span>
          {' '}{t("CLI (")} <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{t("cd scripts/apple-stt && swift build -c release && cp .build/release/apple-stt /opt/homebrew/bin/")} </span>
          ).
        </div>
      )}
      {sttEngine === 'mlx-whisper' && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("MLX Whisper runs locally on Apple Silicon. Recognition speed and accuracy depend on the audio and current device load.")} </div>
      )}
      {(sourceLanguage === 'ja' || sourceLanguage === 'auto') && (
        <div style={{ marginTop: '12px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e2e8f0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draftSttEnabled}
              onChange={(e) => onDraftSttEnabledChange(e.target.checked)}
              disabled={disabled}
              style={{ width: '16px', height: '16px' }}
            />{t("Fast interim results (Moonshine Tiny JA)")} </label>
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>{t("Shows an early Japanese draft while the primary recognizer prepares the result. Experimental: uses extra memory and may revise words.")} </div>
          {draftSttEnabled && sourceLanguage === 'auto' && (
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#f59e0b' }}>{t("Warning: draft STT outputs Japanese only. Non-JA audio will produce incorrect interim results.")} </div>
          )}
        </div>
      )}
    </Section>
  )
}
