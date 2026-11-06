import React from 'react'
import { t } from '../../ui-language'
import { MEDIA_FILE_ACCEPT } from '../../../media-formats'
import { FileTranscript } from './FileTranscript'
import { buttonStyle } from './shared'

export function FileTranslationSettings({ disabled, jobId, watchFolder, onToggleWatchFolder, onTranslateFile, onCancel }: {
  disabled: boolean
  jobId: string | null
  watchFolder: string | null
  onToggleWatchFolder: () => Promise<void>
  onTranslateFile: (file: File) => Promise<void>
  onCancel: () => Promise<void>
}): React.JSX.Element {
  return <>
      <div>
        <h2>{t("Translate an audio or video file")}</h2>
        <label htmlFor="media-file" style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#b5c4d8' }}>{t("Choose a file to begin translation")}</label>
        <input id="media-file" type="file" accept={MEDIA_FILE_ACCEPT} disabled={disabled}
          style={{ width: '100%', color: '#b5c4d8', fontSize: 12 }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onTranslateFile(file)
          }} />
        <p style={{ fontSize: 11, color: '#94a3b8' }}>{t("MP3, M4A, WAV, FLAC, WebM, MP4 and other common formats.")}</p>
      </div>
      {jobId && <button type="button" onClick={() => void onCancel()}
        style={{ ...buttonStyle, background: '#7f1d1d', color: '#fecaca' }}>{t("Cancel file translation")}</button>}
    <button type="button" style={buttonStyle} disabled={disabled && !watchFolder}
      onClick={() => void onToggleWatchFolder()}>
      {watchFolder ? t('Stop watching folder') : t('Watch folder and translate automatically')}
    </button>
    {watchFolder && <p className="settings-note">{watchFolder}</p>}
    <FileTranscript jobId={jobId} />
  </>
}
