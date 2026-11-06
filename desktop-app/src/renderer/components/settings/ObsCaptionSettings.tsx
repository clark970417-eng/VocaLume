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

  async function changeMode(mode: Status['mode']) {
    setBusy(true)
    setFailed(false)
    try {
      setStatus(await window.api.configureObsCaptions(mode))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="settings-disclosure">
      <summary>{t('OBS live captions')}</summary>
      <label>
        {t('Caption file output')}
        <select disabled={!status || busy} value={status?.mode ?? 'off'}
          onChange={event => void changeMode(event.target.value as Status['mode'])}>
          <option value="off">{t('Off')}</option>
          <option value="translation">{t('Translation only')}</option>
          <option value="bilingual">{t('Original and translation')}</option>
        </select>
      </label>
      {status && status.mode !== 'off' && <>
      <p>{t('In OBS, add a Text source and enable Read from file. Select this file after enabling output.')}</p>
      <input aria-label={t('OBS caption file path')} value={status.path} readOnly />
      </>}
      {(failed || status?.error) && <p role="alert">{t('Could not configure OBS caption output.')}</p>}
    </details>
  )
}
