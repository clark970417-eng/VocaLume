export function languageForCountry(country = '') {
  const code = String(country).toUpperCase();
  if (code === 'KR') return 'ko';
  if (code === 'JP') return 'ja';
  if (['TW', 'HK', 'MO'].includes(code)) return 'zh-Hant';
  if (['CN', 'SG'].includes(code)) return 'zh-Hans';
  return /^[A-Z]{2}$/.test(code) ? 'en' : null;
}
