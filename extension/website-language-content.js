(() => {
  if (window.top !== window || location.origin !== 'https://vocalume.vercel.app') return;

  const key = 'vocalume.uiLanguage';
  const locales = new Map([['zh-TW', 'zh-Hant'], ['zh-CN', 'zh-Hans'], ['en', 'en'], ['ja', 'ja'], ['ko', 'ko']]);
  let preference, revision = 0;

  function browserLocale() {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const language = languages.find(value => /^(zh|en|ja|ko)(-|$)/i.test(value))?.toLowerCase();
    if (/^zh-(cn|sg|hans)(-|$)/.test(language ?? '')) return 'zh-Hans';
    if (language?.startsWith('zh')) return 'zh-Hant';
    return language?.split('-')[0] ?? 'en';
  }

  function publish(live) {
    const locale = preference === 'auto' ? browserLocale() : locales.get(preference);
    if (locale) window.postMessage({type: 'VOCALUME_UI_LANGUAGE', locale, live}, location.origin);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, key)) return;
    revision++;
    preference = changes[key].newValue;
    publish(true);
  });
  window.addEventListener('languagechange', () => {
    if (preference === 'auto') publish(true);
  });
  chrome.storage.local.get(key).then(settings => {
    if (revision !== 0) return;
    preference = settings[key];
    publish(false);
  }).catch(() => {});
})();
