import { useEffect, useState } from 'react'
import { t } from '../../ui-language'
type TranslationResult = { sourceText: string; translatedText: string; isInterim?: boolean }

export function FileTranscript({ jobId }: { jobId: string | null }): React.JSX.Element | null {
  const [rows, setRows] = useState<TranslationResult[]>([])
  const [query, setQuery] = useState('')
  const [exportError, setExportError] = useState(false)

  useEffect(() => {
    if (!jobId) return
    setRows([])
    setQuery('')
    return window.api.onTranslationResult(value => {
      const result = value as TranslationResult | undefined
      if (!result?.sourceText || !result.translatedText || result.isInterim) return
      setRows(previous => [...previous, result])
    })
  }, [jobId])

  if (!rows.length) return null
  const search = query.trim().toLocaleLowerCase()

  return (
    <details className="settings-disclosure file-transcript">
      <summary>{t('Transcript editor')}</summary>
      <label className="settings-field">{t('Search original or translation')} <input className="settings-input" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => {
        const contents = rows.map(row => [row.sourceText, row.translatedText].join('\n')).join('\n\n')
        setExportError(false)
        void window.api.exportFileTranscript(contents).catch(() => setExportError(true))
      }}>{t('Export text file')}</button>
      {exportError && <p role="alert">{t('Could not export the transcript.')}</p>}
      {rows.map((row, index) => {
        const matches = [row.sourceText, row.translatedText].some(text => text.toLocaleLowerCase().includes(search))
        return (
          <div key={index} hidden={!matches}>
            <p>{row.sourceText}</p>
            <label>{t('Translation {0}', [index + 1])}
              <textarea className="settings-input" value={row.translatedText} onChange={event => {
                const translatedText = event.target.value
                setRows(previous => previous.map((item, i) => i === index ? { ...item, translatedText } : item))
              }} />
            </label>
          </div>
        )
      })}
    </details>
  )
}
