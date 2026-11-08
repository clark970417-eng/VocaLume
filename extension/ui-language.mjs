import { UI_ZH_TW, UI_EN } from './ui-messages.mjs';
import { UI_ZH_CN } from './ui-messages-zh-cn.mjs';
import { UI_JA } from './ui-messages-ja.mjs';
import { UI_KO } from './ui-messages-ko.mjs';
import { UI_DESKTOP_JA } from './ui-messages-desktop-ja.mjs';
import { UI_DESKTOP_KO } from './ui-messages-desktop-ko.mjs';
import { WEBSITE_ORIGIN } from './website-language.mjs';

export const UI_LANGUAGE_KEY = 'vocalume.uiLanguage';
export const UI_LANGUAGE_CHANGED_AT_KEY = 'vocalume.uiLanguageChangedAt';
export const UI_REGION_LOCALE_KEY = 'vocalume.uiRegionLocale';
const regionalLocales = {'zh-Hant': 'zh-TW', 'zh-Hans': 'zh-CN', en: 'en', ja: 'ja', ko: 'ko'};
const localizations = {
  en: UI_EN,
  'zh-TW': UI_ZH_TW,
  'zh-CN': UI_ZH_CN,
  ja: {...UI_DESKTOP_JA, ...UI_JA},
  ko: {...UI_DESKTOP_KO, ...UI_KO}
};
export const uiLanguagePreference = value => typeof value === 'string' && Object.hasOwn(localizations, value) ? value : 'auto';

export async function lookupRegionalUiLanguage({fetch: request = globalThis.fetch} = {}) {
  try {
    const response = await request(`${WEBSITE_ORIGIN}/api/site-language`, {
      signal: AbortSignal.timeout(1500), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
    });
    if (!response.ok) return null;
    const {language} = await response.json();
    return typeof language === 'string' && Object.hasOwn(regionalLocales, language) ? regionalLocales[language] : null;
  } catch {
    return null;
  }
}
export const resolveUiLanguage = (preference, languages = []) => {
  if (uiLanguagePreference(preference) !== 'auto') return preference;
  const supported = languages.find(language => /^(?:zh|en|ja|ko)(?:-|$)/i.test(language));
  if (!supported) return 'en';
  if (/^zh-(?:CN|SG|Hans)(?:-|$)/i.test(supported)) return 'zh-CN';
  const language = supported.split('-')[0].toLowerCase();
  return language === 'zh' ? 'zh-TW' : language;
};
const patterns = new WeakMap();
function lookup(text, dictionary) {
  if (Object.hasOwn(dictionary, text)) return dictionary[text];
  let entries = patterns.get(dictionary);
  if (!entries) {
    entries = Object.entries(dictionary).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translated]) => {
      const parts = key.split(/(\{\d+\})/g);
      const slots = parts.filter(part => /^\{\d+\}$/.test(part)).map(part => Number(part.slice(1, -1)));
      const pattern = new RegExp('^' + parts.map(part => /^\{\d+\}$/.test(part) ? '(.*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$', 's');
      return { pattern, translated, slots };
    });
    patterns.set(dictionary, entries);
  }
  for (const { pattern, translated, slots } of entries) {
    const match = text.match(pattern);
    if (match) {
      const values = Object.fromEntries(slots.map((slot, position) => [slot, match[position + 1]]));
      return translated.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? '');
    }
  }
  return text;
}

/** Only call for interface copy, never recognized speech, drafts or user terms. */
export function translateUiText(text, locale, values = []) {
  const source = String(text);
  const dictionary = uiLanguagePreference(locale) === 'auto' ? UI_EN : localizations[locale];
  let translated = lookup(source, dictionary);
  if ((locale === 'ja' || locale === 'ko') && translated === source) {
    translated = lookup(lookup(source, UI_EN), dictionary);
  }
  return translated.replace(/\{(\d+)\}/g, (token, index) => index < values.length ? String(values[index]) : token);
}
