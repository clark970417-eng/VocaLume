import React, { useRef } from 'react'
import { t } from '../../ui-language'
import { MEDIA_FILE_ACCEPT } from '../../../media-formats'
import type { MediaTranscriptRow } from '../../../media-transcript'
import { FileTranscript } from './FileTranscript'
import { buttonStyle } from './shared'

export function FileTranslationSettings({ disabled, jobId, watchFolder, onToggleWatchFolder, onTranslateFile, onCancel,
  rows, onEditCue, review, onReview }: {
  disabled: boolean
  jobId: string | null
  watchFolder: string | null
  onToggleWatchFolder: () => Promise<void>
  onTranslateFile: (file: File) => Promise<void>
  onCancel: () => Promise<void>
  rows: readonly MediaTranscriptRow[]
  onEditCue: (jobId: string, cueId: number, translatedText: string) => void
  review: boolean
  onReview: (enabled: boolean) => void
}): React.JSX.Element {
  const fileInput = useRef<HTMLInputElement>(null)
  return <>
      <div>
        <h2>{t("Translate an audio or video file")}</h2>
        <button type="button" className="settings-input" disabled={disabled}
          aria-label={t("Choose a file to begin translation")}
          title={t("MP3, M4A, WAV, FLAC, WebM, MP4 and other common formats.")}
          onClick={() => fileInput.current?.click()}>{t("Choose a file to begin translation")}</button>
        <input ref={fileInput} id="media-file" type="file" accept={MEDIA_FILE_ACCEPT} disabled={disabled} hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onTranslateFile(file)
          }} />
      </div>
      <label className="settings-field">
        <input type="checkbox" checked={review} disabled={disabled} onChange={event => onReview(event.target.checked)} />
        {t('Review uncertain file segments')}
      </label>
      {jobId && <button type="button" onClick={() => void onCancel()}
        style={{ ...buttonStyle, background: '#7f1d1d', color: '#fecaca' }}>{t("Cancel file translation")}</button>}
    <button type="button" style={buttonStyle} disabled={disabled && !watchFolder}
      onClick={() => void onToggleWatchFolder()}>
      {watchFolder ? t('Stop watching folder') : t('Watch folder and translate automatically')}
    </button>
    {watchFolder && <p className="settings-note">{watchFolder}</p>}
    <FileTranscript key={rows[0]?.jobId} rows={rows} onEditCue={onEditCue} />
  </>
}
