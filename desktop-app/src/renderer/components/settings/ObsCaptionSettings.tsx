import { useEffect, useState } from 'react'
import { t } from '../../ui-language'

type Status = Awaited<ReturnType<Window['api']['obsCaptionStatus']>>

export function ObsCaptionSettings() {
  const [status, setStatus] = useState<Status>()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [transport, setTransport] = useState<Status['transport']>('file')
  const [source, setSource] = useState('')

  useEffect(() => {
    void window.api.obsCaptionStatus().then(initial => {
      setStatus(initial)
      setTransport(initial.transport)
      setSource(initial.source)
    }).catch(() => setActionError('Could not configure OBS caption output.'))
  }, [])

  useEffect(() => {
    if (status?.transport !== 'push' || status.mode === 'off') return
    const refresh = setInterval(() => {
      void window.api.obsCaptionStatus().then(setStatus).catch(() => {})
    }, 1500)
    return () => clearInterval(refresh)
  }, [status?.transport, status?.mode])

  async function changeMode(mode: Status['mode']) {
    setBusy(true)
    setActionError('')
    try {
      setStatus(await window.api.configureObsCaptions(mode))
    } catch {
      setActionError('Could not configure OBS caption output.')
    } finally {
      setBusy(false)
    }
  }

  async function applyTransport() {
    setBusy(true)
    setActionError('')
    try {
      const next = await window.api.configureObsCaptionTransport(transport, source)
      setStatus(next)
      if (next.error) setActionError(next.error)
    } catch {
      setActionError('Could not configure OBS caption output.')
    } finally {
      setBusy(false)
    }
  }

  const error = actionError || status?.error
  return (
    <details className="settings-disclosure">
      <summary>{t('OBS live captions')}</summary>
      <label className="settings-field">
        {t('OBS caption output')}
        <select disabled={!status || busy} value={status?.mode ?? 'off'}
          onChange={event => void changeMode(event.target.value as Status['mode'])}>
          <option value="off">{t('Off')}</option>
          <option value="translation">{t('Translation only')}</option>
          <option value="bilingual">{t('Original and translation')}</option>
        </select>
      </label>
      {status && status.mode !== 'off' && (
        <>
          {status.pushAvailable && (
            <>
              <div className="settings-field">
                <label htmlFor="obs-output-method">{t('OBS output method')}</label>
                <select id="obs-output-method" disabled={busy} value={transport}
                  onChange={event => setTransport(event.target.value as Status['transport'])}>
                  <option value="file">{t('Caption file')}</option>
                  <option value="push">{t('Direct push to OBS')}</option>
                </select>
              </div>
              {transport === 'push' && (
                <>
                  <p>{t('In OBS, enable WebSocket with a password. Add a Text (GDI+) source with Read from file turned off, then enter its exact name here.')}</p>
                  <label className="settings-field">
                    {t('OBS text source name')}
                    <input className="settings-input" value={source} maxLength={256} disabled={busy}
                      onChange={event => setSource(event.target.value)} />
                  </label>
                </>
              )}
              <button type="button" disabled={busy || (transport === 'push' && !source.trim()) ||
                (transport === 'file' && status.transport === 'file')} onClick={() => void applyTransport()}>
                {t('Apply OBS output method')}
              </button>
              <p role="status">{t(status.transport === 'push' ? 'Active: Direct push to OBS' : 'Active: Caption file')}</p>
            </>
          )}
          {status.transport === 'file' && transport === 'file' && (
            <>
              <p>{t('In OBS, add a Text source and enable Read from file. Select this file after enabling output.')}</p>
              <input className="settings-input" aria-label={t('OBS caption file path')} value={status.path} readOnly />
            </>
          )}
        </>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </details>
  )
}
