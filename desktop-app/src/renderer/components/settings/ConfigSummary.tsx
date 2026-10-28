import { t } from '../../ui-language'
import React from 'react'
import {
  LANGUAGE_LABELS,
  getEngineDisplayName,
  getSttDisplayName
} from './shared'
import type {
  EngineMode,
  Language,
  SourceLanguage,
  SttEngineType,
  WhisperVariantType
} from './shared'

interface ConfigSummaryProps {
  sttEngine: SttEngineType
  whisperVariant: WhisperVariantType
  engineMode: EngineMode
  sourceLanguage: SourceLanguage
  targetLanguage: Language
  gpuInfo: { hasGpu: boolean; gpuNames: string[] } | null
}

export function ConfigSummary({
  sttEngine,
  whisperVariant,
  engineMode,
  sourceLanguage,
  targetLanguage,
  gpuInfo
}: ConfigSummaryProps): React.JSX.Element {
  const src = sourceLanguage === 'auto' ? 'Auto-detect' : LANGUAGE_LABELS[sourceLanguage]
  const tgt = LANGUAGE_LABELS[targetLanguage]

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: '8px',
      padding: '10px 14px',
      marginBottom: '16px',
      fontSize: '12px',
      color: '#94a3b8'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span>{t("Speech Recognition")}</span>
        <span style={{ color: '#e2e8f0' }}>{t(getSttDisplayName(sttEngine, whisperVariant))}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{t("Translation")}</span>
        <span style={{ color: '#e2e8f0' }}>{t(getEngineDisplayName(engineMode))}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span>{t("Language")}</span>
        <span style={{ color: '#e2e8f0' }}>{t(src)} → {t(tgt)}</span>
      </div>
      {gpuInfo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span>GPU</span>
          <span style={{ color: gpuInfo.hasGpu ? '#22c55e' : '#f59e0b' }}>
            {gpuInfo.hasGpu ? gpuInfo.gpuNames.join(', ') : t("Not detected")}
          </span>
        </div>
      )}
    </div>
  )
}
