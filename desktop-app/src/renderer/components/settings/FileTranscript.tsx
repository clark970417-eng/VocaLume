import { useEffect, useState } from 'react'
type TranslationResult = { sourceText: string; translatedText: string; isInterim?: boolean }

export function FileTranscript({ jobId }: { jobId: string | null }): React.JSX.Element | null {
  const [rows, setRows] = useState<TranslationResult[]>([])
  const [query, setQuery] = useState('')
  const [exportError, setExportError] = useState('')

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
    <details>
      <summary>翻譯紀錄編輯器</summary>
      <label>搜尋原文或譯文 <input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => {
        const contents = rows.map(row => [row.sourceText, row.translatedText].join('\n')).join('\n\n')
        setExportError('')
        void window.api.exportFileTranscript(contents).catch(error => setExportError(String(error)))
      }}>匯出文字檔</button>
      {exportError && <p role="alert">{exportError}</p>}
      {rows.map((row, index) => {
        const matches = [row.sourceText, row.translatedText].some(text => text.toLocaleLowerCase().includes(search))
        return (
          <div key={index} hidden={!matches}>
            <p>{row.sourceText}</p>
            <label>譯文 {index + 1}
              <textarea value={row.translatedText} onChange={event => {
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
