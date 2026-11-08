import { useEffect, useState } from 'react'
import { t } from '../../ui-language'

type Status = Awaited<ReturnType<Window['api']['obsCaptionStatus']>>

export function ObsCaptionSettings() {
  const [status, setStatus] = useState<Status>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void window.api.obsCaptionStatus().then(setStatus).catch(() => setFailed(true))
  }, [])

  async function update(request: () => Promise<Status>) {
    setBusy(true)
    setFailed(false)
    try {
      setStatus(await request())
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="settings-disclosure">
      <summary>{t('OBS live captions')}</summary>
      <label className="settings-field">
        {t('Caption file output')}
        <select disabled={!status || busy} value={status?.mode ?? 'off'}
          onChange={event => {
            const mode = event.target.value as Status['mode']
            void update(() => window.api.configureObsCaptions(mode))
          }}>
          <option value="off">{t('Off')}</option>
          <option value="translation">{t('Translation only')}</option>
          <option value="bilingual">{t('Original and translation')}</option>
        </select>
      </label>
      {status && status.mode !== 'off' && <>
      <label>
        <input type="checkbox" checked={status.hideDesktopOverlay} disabled={busy}
          onChange={event => {
            const enabled = event.target.checked
            void update(() => window.api.setObsOnly(enabled))
          }} />
        {t('Hide desktop subtitles while using OBS')}
      </label>
      <p>{t('In OBS, add a Text source and enable Read from file. Select this file after enabling output.')}</p>
      <input className="settings-input" aria-label={t('OBS caption file path')} value={status.path} readOnly />
      </>}
      {(failed || status?.error) && <p role="alert">{t('Could not configure OBS caption output.')}</p>}
    </details>
  )
}
