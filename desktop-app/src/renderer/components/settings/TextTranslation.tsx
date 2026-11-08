import React, { useRef, useState } from 'react'
import { t } from '../../ui-language'
import { ALL_LANGUAGES, LANGUAGE_LABELS, type Language } from './shared'

const MAX_MESSAGE_LENGTH = 3000

export function TextTranslation(): React.JSX.Element {
  const [source, setSource] = useState<Language>('ja')
  const [target, setTarget] = useState<Language>('zh')
  const [message, setMessage] = useState('')
  const [translation, setTranslation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const revision = useRef(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const output = useRef<HTMLTextAreaElement>(null)

  const clearResult = (): void => {
    revision.current++
    setTranslation(null)
    setStatus('')
  }

  const updateMessage = (value: string): void => {
    clearResult()
    setMessage(value)
  }

  const paste = async (): Promise<void> => {
    const current = revision.current
    try {
      const text = await navigator.clipboard.readText()
      if (revision.current !== current) return
      if (!text.trim()) {
        setStatus('Clipboard has no text.')
        return
      }
      updateMessage(text)
      input.current?.focus()
    } catch {
      if (revision.current !== current) return
      setStatus('Paste directly into the message field.')
      input.current?.focus()
    }
  }

  const translate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (busy || !message.trim() || message.length > MAX_MESSAGE_LENGTH || source === target) return
    const current = ++revision.current
    setBusy(true)
    setStatus('')
    setTranslation(null)
    try {
      const result = await window.api.translateText(message, source, target)
      if (revision.current === current) setTranslation(result)
    } catch {
      if (revision.current === current) setStatus('Could not translate. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (): Promise<void> => {
    if (!translation?.trim()) return
    const current = revision.current
    try {
      await navigator.clipboard.writeText(translation)
      if (revision.current === current) setStatus('Translation copied.')
    } catch {
      if (revision.current !== current) return
      output.current?.focus()
      output.current?.select()
      setStatus('Copy the selected translation manually.')
    }
  }

  const options = ALL_LANGUAGES.map(language => <option key={language} value={language}>{t(LANGUAGE_LABELS[language])}</option>)
  return <>
    <h2>{t('Text translation')}</h2>
    <form className="text-translation" onSubmit={translate}>
      <div className="text-translation-languages">
        <label className="settings-field">
          {t('Source language')}
          <select aria-label={t('Source language')} value={source} onChange={event => { clearResult(); setSource(event.target.value as Language) }}>{options}</select>
        </label>
        <button type="button" aria-label={t('Swap languages')} title={t('Swap languages')} onClick={() => {
          clearResult()
          setSource(target)
          setTarget(source)
        }}>⇄</button>
        <label className="settings-field">
          {t('Target language')}
          <select aria-label={t('Target language')} value={target} onChange={event => { clearResult(); setTarget(event.target.value as Language) }}>{options}</select>
        </label>
      </div>
      <div className="text-translation-message">
        <label htmlFor="text-translation-source">{t('Original message')}</label>
        <button type="button" onClick={paste}>{t('Paste')}</button>
        <textarea id="text-translation-source" className="settings-input" ref={input} value={message} onChange={event => updateMessage(event.target.value)} />
      </div>
      <button type="submit" className="text-translation-primary" disabled={busy || !message.trim() || message.length > MAX_MESSAGE_LENGTH || source === target}>
        {t(busy ? 'Translating message…' : 'Translate')}
      </button>
      <div className="text-translation-message">
        <label htmlFor="text-translation-result">{t('Translated message')}</label>
        <button type="button" disabled={!translation?.trim()} onClick={copy}>{t('Copy translation')}</button>
        <textarea id="text-translation-result" className="settings-input" ref={output} value={translation ?? ''}
          readOnly={translation === null} onChange={event => { revision.current++; setTranslation(event.target.value); setStatus('') }} />
      </div>
      <div role="status">
        {message.length > MAX_MESSAGE_LENGTH ? t('Messages must be 3000 characters or fewer.')
          : source === target ? t('Choose two different languages.') : status && t(status)}
      </div>
    </form>
  </>
}
