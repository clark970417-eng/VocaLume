import { useMemo, useState } from 'react'
import { t } from '../../ui-language'
import { exportMediaTranscript, formatCueTime, pageMediaTranscript, type MediaFileCue, type MediaTranscriptRow } from '../../../media-transcript'

export function FileTranscript({ rows, onEditCue }: {
  rows: readonly MediaTranscriptRow[]
  onEditCue: (jobId: string, cueId: number, translatedText: string) => void
}): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [exportError, setExportError] = useState(false)
  const [open, setOpen] = useState(false)
  const [requestedPage, setRequestedPage] = useState(0)
  const page = useMemo(() => open ? pageMediaTranscript(rows, query, requestedPage) : null, [open, rows, query, requestedPage])

  if (!rows.length) return null

  return (
    <details className="settings-disclosure file-transcript" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{t('Transcript editor')}</summary>
      {page && <>
        <label className="settings-field">{t('Search original or translation')}
          <input className="settings-input" type="search" value={query}
            onChange={event => { setQuery(event.target.value); setRequestedPage(0) }} />
        </label>
        <button type="button" onClick={() => {
          const contents = exportMediaTranscript(rows, statusLabel)
          setExportError(false)
          void window.api.exportFileTranscript(contents).catch(() => setExportError(true))
        }}>{t('Export text file')}</button>
        {exportError && <p role="alert">{t('Could not export the transcript.')}</p>}
        {page.pages > 1 && <div className="settings-field">
          <button type="button" disabled={page.page === 0} onClick={() => setRequestedPage(page.page - 1)}>{t('Previous page')}</button>
          <span aria-live="polite">{t('Transcript rows {0}–{1} of {2}', [page.start + 1, page.end, page.total])}</span>
          <button type="button" disabled={page.page + 1 === page.pages} onClick={() => setRequestedPage(page.page + 1)}>{t('Next page')}</button>
        </div>}
        {page.visible.map(({ row, index }) => (
          <div key={row.cueId}>
            <p>{formatCueTime(row.startSeconds)} – {formatCueTime(row.endSeconds)}</p>
            {row.sourceText && <p>{row.sourceText}</p>}
            {row.status !== 'translated' && <p>{statusLabel(row.status)}</p>}
            <label>{t('Translation {0}', [index + 1])}
              <textarea className="settings-input" value={row.editedText ?? row.translatedText}
                onChange={event => onEditCue(row.jobId, row.cueId, event.target.value)} />
            </label>
          </div>
        ))}
      </>}
    </details>
  )
}

function statusLabel(status: MediaFileCue['status']): string {
  return status === 'unrecognized' ? t('Speech could not be recognized') : t('Translation failed')
}
