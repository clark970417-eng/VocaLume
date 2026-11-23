import { useEffect, useState } from 'react'
import { t } from '../../ui-language'

type Status = Awaited<ReturnType<Window['api']['mobileCompanionStatus']>>

export function MobileCompanionSettings() {
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    void window.api.mobileCompanionStatus().then(value => {
      if (active) setStatus(value)
    }).catch(() => {
      if (active) setError(true)
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [])

  async function setEnabled(enabled: boolean) {
    setBusy(true)
    setError(false)
    try {
      setStatus(await window.api.setMobileCompanion(enabled))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="settings-disclosure">
      <summary>{t('Mobile companion')}</summary>
      <p>{t('Use your phone to translate text or read live captions from this computer.')}</p>
      <button type="button" disabled={busy} onClick={() => void setEnabled(!status)}>
        {t(status ? 'Stop mobile companion' : 'Start mobile companion')}
      </button>
      {status && <>
        <label className="settings-field">
          {t('Pairing code')}
          <input className="settings-input" value={status.pairingCode} readOnly onFocus={event => event.currentTarget.select()} />
        </label>
        <label className="settings-field">
          {t('Local preview URL')}
          <input className="settings-input" value={status.url} readOnly onFocus={event => event.currentTarget.select()} />
        </label>
        <button type="button" disabled={busy} onClick={() => void window.api.openMobileCompanion().catch(() => setError(true))}>
          {t('Open local preview')}
        </button>
        <p>{t('On your phone, open the private HTTPS address from Tailscale Serve and enter the pairing code.')}</p>
        <p>{t('Forward the port shown above to your devices with Tailscale Serve. Keep VocaLume running on this computer.')}</p>
      </>}
      {error && <p role="alert">{t('Could not open or configure the mobile companion. Check the local port and try again.')}</p>}
    </details>
  )
}
