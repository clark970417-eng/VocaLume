(() => {
  if (window.top !== window || location.origin !== 'https://vocalume.vercel.app') return;

  const key = 'vocalume.uiLanguage';
  const changedAtKey = 'vocalume.uiLanguageChangedAt';
  const pendingKey = 'vocalume-site-pending-language';
  const locales = new Map([['zh-TW', 'zh-Hant'], ['zh-CN', 'zh-Hans'], ['en', 'en'], ['ja', 'ja'], ['ko', 'ko']]);
  const extensionLocales = new Map([...locales].map(([extension, website]) => [website, extension]));
  let preference, revision = 0;

  function publish(live) {
    const locale = locales.get(preference);
    if (preference === 'auto' || locale) {
      window.postMessage({type: 'VOCALUME_UI_LANGUAGE', preference: locale ?? 'auto', locale, live}, location.origin);
    }
  }

  const extensionPreference = requested => requested === 'auto' ? requested : extensionLocales.get(requested);
  function recent(changedAt) {
    const age = Date.now() - changedAt;
    return Number.isSafeInteger(changedAt) && age >= 0 && age <= 5000;
  }
  function pendingSelection() {
    try {
      const raw = window.sessionStorage.getItem(pendingKey);
      const {preference: requested, changedAt} = JSON.parse(raw) ?? {};
      if (recent(changedAt) && extensionPreference(requested)) return {raw, requested, changedAt};
    } catch { /* The message bridge still works when session storage is blocked. */ }
  }

  async function applySelection(requested, pending, eventTime) {
    const next = extensionPreference(requested);
    if (!next) return;
    revision++;
    const changedAt = recent(eventTime) ? eventTime : (pending?.requested === requested ? pending.changedAt : Date.now());
    const result = await chrome.runtime?.sendMessage({type: 'ui-language-choose', preference: next, changedAt}).catch(() => undefined);
    if (!result) await chrome.storage.local.set({[key]: next, [changedAtKey]: changedAt});
    try {
      if (pending?.requested === requested && window.sessionStorage.getItem(pendingKey) === pending.raw) {
        window.sessionStorage.removeItem(pendingKey);
      }
    } catch { /* Optional session handoff only. */ }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, key)) return;
    revision++;
    preference = changes[key].newValue;
    publish(true);
  });
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.type !== 'VOCALUME_SITE_UI_LANGUAGE') return;
    applySelection(event.data.preference, pendingSelection(), event.data.changedAt).catch(() => {});
  });
  const pending = pendingSelection();
  const initialize = pending ? applySelection(pending.requested, pending) : chrome.storage.local.get(key).then(settings => {
    if (revision !== 0) return;
    preference = settings[key];
    publish(false);
  });
  function sync() {
    chrome.runtime?.sendMessage({type: 'ui-language-sync'}).catch(() => {});
  }
  initialize.catch(() => {}).finally(sync);
  window.addEventListener('focus', sync);
})();
