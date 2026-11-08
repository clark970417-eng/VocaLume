export const WEBSITE_ORIGIN = 'https://vocalume.vercel.app';

export function websiteLocale(locale) {
  return ({'zh-TW': 'zh-Hant', 'zh-CN': 'zh-Hans', en: 'en', ja: 'ja', ko: 'ko'})[locale] ?? 'en';
}

export function localizedWebsiteUrl(locale) {
  const url = new URL(WEBSITE_ORIGIN);
  url.searchParams.set('lang', websiteLocale(locale));
  return url.href;
}
