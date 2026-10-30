import React from 'react'
import { t, useUiLanguage, setUiLanguage, type UiLanguagePreference } from '../ui-language'

export function InterfaceLanguage(): React.JSX.Element {
  const preference = useUiLanguage()
  return <label className="interface-language">
    <span>{t('Interface language')}</span>
    <select aria-label={t('Interface language')} value={preference}
      onChange={event => setUiLanguage(event.target.value as UiLanguagePreference)}>
      <option value="auto">{t('Follow system')}</option>
      <option value="zh-TW" lang="zh-Hant">繁體中文</option>
      <option value="zh-CN" lang="zh-Hans">简体中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
}
