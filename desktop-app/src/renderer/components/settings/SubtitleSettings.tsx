import { t } from '../../ui-language'
import React, { useCallback, useEffect, useState } from 'react'
import { Section } from './Section'
import { buttonStyle, colorInputStyle, selectStyle, sliderLabelStyle } from './shared'
import type { DisplayInfo, SubtitlePositionType } from './shared'

interface SubtitleSettingsProps {
  fontSize: number
  onFontSizeChange: (v: number) => void
  sourceColor: string
  onSourceColorChange: (v: string) => void
  translatedColor: string
  onTranslatedColorChange: (v: string) => void
  bgOpacity: number
  onBgOpacityChange: (v: number) => void
  position: SubtitlePositionType
  onPositionChange: (v: SubtitlePositionType) => void
  lowPowerRendering: boolean
  onLowPowerRenderingChange: (v: boolean) => void
  captionMode?: 'realtime' | 'record'
  onCaptionModeChange: (mode: 'realtime' | 'record') => void
  supportsHideOnHover: boolean
  hideOnHover: boolean
  onHideOnHoverChange: (v: boolean) => void
  showConfidenceIndicator: boolean
  onShowConfidenceIndicatorChange: (v: boolean) => void
  displays: DisplayInfo[]
  selectedDisplay: number
  onDisplayChange: (displayId: number) => void
}

export function SubtitleSettings({
  fontSize,
  onFontSizeChange,
  sourceColor,
  onSourceColorChange,
  translatedColor,
  onTranslatedColorChange,
  bgOpacity,
  onBgOpacityChange,
  position,
  onPositionChange,
  lowPowerRendering,
  onLowPowerRenderingChange,
  captionMode,
  onCaptionModeChange,
  supportsHideOnHover,
  hideOnHover,
  onHideOnHoverChange,
  showConfidenceIndicator,
  onShowConfidenceIndicatorChange,
  displays,
  selectedDisplay,
  onDisplayChange
}: SubtitleSettingsProps): React.JSX.Element {
  const [isDragMode, setIsDragMode] = useState(false)
  useEffect(() => {
    let active = true
    const unsubscribe = window.api.onDragModeChanged?.(setIsDragMode)
    void window.api.getSubtitleInteractionMode?.().then(mode => { if (active) setIsDragMode(mode === 'drag') })
    return () => { active = false; unsubscribe?.() }
  }, [])

  const handleToggleDragMode = useCallback(() => {
    void window.api.toggleSubtitleDragMode?.(!isDragMode)
  }, [isDragMode])

  const handleResetPosition = useCallback(() => {
    void window.api.resetSubtitlePosition?.()
    if (isDragMode) void window.api.toggleSubtitleDragMode?.(false)
  }, [isDragMode])

  return (
    <>
      <Section label={t("Subtitle Appearance")}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label>
            <input type="checkbox" checked={lowPowerRendering} onChange={event => onLowPowerRenderingChange(event.target.checked)} />
            {' '}{t('Low-power subtitle display')}
          </label>
          {captionMode && (
            <label>
              {t('字幕顯示')}{' '}
              <select value={captionMode} onChange={event => onCaptionModeChange(event.target.value === 'record' ? 'record' : 'realtime')}>
                <option value="realtime">{t('單組字幕 · 等待完整譯文')}</option>
                <option value="record">{t('四組字幕 · 保留完整記錄')}</option>
              </select>
            </label>
          )}
          {supportsHideOnHover && (
            <label>
              <input type="checkbox" checked={hideOnHover} onChange={event => onHideOnHoverChange(event.target.checked)} />
              {' '}{t('Hide subtitles when the pointer is nearby')}
            </label>
          )}
          <div>
            <div style={sliderLabelStyle}>{t("Font Size:")} {fontSize}px</div>
            <input
              type="range"
              aria-label={t("Subtitle font size")}
              min={20}
              max={48}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={sliderLabelStyle}>{t("Source Text")}</div>
              <input
                type="color"
                value={sourceColor}
                onChange={(e) => onSourceColorChange(e.target.value)}
                aria-label={t("Source text color")}
                style={colorInputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={sliderLabelStyle}>{t("Translated Text")}</div>
              <input
                type="color"
                value={translatedColor}
                onChange={(e) => onTranslatedColorChange(e.target.value)}
                aria-label={t("Translated text color")}
                style={colorInputStyle}
              />
            </div>
          </div>
          <div>
            <div style={sliderLabelStyle}>{t("Background Opacity:")} {bgOpacity}%</div>
            <input
              type="range"
              aria-label={t("Subtitle background opacity")}
              min={0}
              max={100}
              value={bgOpacity}
              onChange={(e) => onBgOpacityChange(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={sliderLabelStyle}>{t("Position")}</div>
            <select
              value={position}
              onChange={(e) => onPositionChange(e.target.value as SubtitlePositionType)}
              aria-label={t("Subtitle position")}
              style={selectStyle}
            >
              <option value="bottom">{t("Bottom")}</option>
              <option value="top">{t("Top")}</option>
            </select>
          </div>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '4px',
            fontSize: '13px',
            color: '#94a3b8',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showConfidenceIndicator}
              onChange={(e) => onShowConfidenceIndicatorChange(e.target.checked)}
              aria-label={t("Show confidence indicator")}
            />
            <span>{t("Show confidence indicator")}</span>
          </label>
        </div>
      </Section>

      {/* Speaker color palette preview (#509) */}
      <Section label={t("Subtitle Display")}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <select
            value={selectedDisplay}
            onChange={(e) => onDisplayChange(Number(e.target.value))}
            style={selectStyle}
            aria-label={t("Subtitle display")}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>

          {/* Drag mode toggle and reset position (#509) */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleToggleDragMode}
              style={{
                ...buttonStyle,
                flex: 1,
                fontSize: '13px',
                padding: '8px 12px',
                marginTop: 0,
                background: isDragMode ? '#dc2626' : '#334155',
                fontWeight: 600
              }}
            >
              {isDragMode ? t("Done Repositioning") : t("Reposition Subtitles")}
            </button>
            <button
              onClick={handleResetPosition}
              style={{
                ...buttonStyle,
                flex: 0,
                whiteSpace: 'nowrap',
                fontSize: '13px',
                padding: '8px 12px',
                marginTop: 0,
                background: '#334155',
                fontWeight: 500
              }}
            >{t("Reset")} </button>
          </div>
          {isDragMode && (
            <div style={{ fontSize: '11px', color: '#f59e0b' }}>{t("Drag the subtitle overlay to your preferred position, then click \"Done Repositioning\"")} </div>
          )}
          {!isDragMode && (
            <span className="settings-note">
              {t(supportsHideOnHover && hideOnHover
                ? 'Use Reposition Subtitles to move the box while hover hiding is on.'
                : 'Press and drag the subtitle box to move it. The position is saved for each display.')}
            </span>
          )}
        </div>
      </Section>
    </>
  )
}
