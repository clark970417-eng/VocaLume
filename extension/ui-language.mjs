import { UI_ZH_TW, UI_EN } from './ui-messages.mjs';
import { UI_ZH_CN } from './ui-messages-zh-cn.mjs';

export const UI_LANGUAGE_KEY = 'vocalume.uiLanguage';
export const uiLanguagePreference = value => ['en', 'zh-TW', 'zh-CN'].includes(value) ? value : 'auto';
export const resolveUiLanguage = (preference, languages = []) => {
  if (['en', 'zh-TW', 'zh-CN'].includes(preference)) return preference;
  const supported = languages.find(language => /^(?:zh|en)(?:-|$)/i.test(language));
  if (/^zh(?:-(?:CN|SG|Hans))(?:-|$)/i.test(supported || '')) return 'zh-CN';
  return /^zh(?:-|$)/i.test(supported || '') ? 'zh-TW' : 'en';
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
  const translated = lookup(source, locale === 'zh-CN' ? UI_ZH_CN : locale === 'zh-TW' ? UI_ZH_TW : UI_EN);
  return translated.replace(/\{(\d+)\}/g, (token, index) => index < values.length ? String(values[index]) : token);
}
