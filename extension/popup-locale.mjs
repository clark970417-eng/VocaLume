import { UI_LANGUAGE_KEY, UI_LANGUAGE_CHANGED_AT_KEY, UI_REGION_LOCALE_KEY, uiLanguagePreference, resolveUiLanguage, translateUiText } from './ui-language.mjs';
import { localizedWebsiteUrl } from './website-language.mjs';

export async function initializePopupLanguage() {
  const selector = document.querySelector('#uiLanguage');
  if (!selector) return;
  let preference = 'auto';
  let region;
  const texts = new WeakMap(), attributes = new WeakMap();
  const excluded = node => node.parentElement?.closest('script,style,textarea,#uiLanguage option[lang]');
  function locale() {
    const detected = uiLanguagePreference(region?.locale);
    return preference === 'auto' && detected !== 'auto'
      ? detected
      : resolveUiLanguage(preference, navigator.languages?.length ? navigator.languages : [navigator.language]);
  }
  function refreshRegion() {
    if (preference === 'auto') chrome.runtime.sendMessage({type: 'ui-language-region'}).catch(() => {});
  }
  function updateValue(current, previous, translate) {
    const source = previous && current === previous.last ? previous.source : current;
    return { source, last: translate(source) };
  }
  function render() {
    const language = locale();
    const translate = source => translateUiText(source, language);
    const translateDiagnostic = line => {
      const separator = line.indexOf('：');
      if (separator < 0) return translate(line);
      const label = line.slice(0, separator);
      const value = line.slice(separator + 1);
      const localizedSeparator = language === 'en' || language === 'ko' ? ':' : '：';
      if (!value) return translate(label) + localizedSeparator;
      const detail = label === '辨識模型' ? value : translate(value);
      return translate(label) + localizedSeparator + (localizedSeparator === ':' ? ' ' : '') + detail;
    };
    const translateError = source => {
      const match = source.match(/^(提示|尚未完成|語言尚未儲存|無法讀取設定，請重新開啟)：(.+)$/s);
      return match ? translateUiText(match[1] + '：{0}', language, [translate(match[2])]) : translate(source);
    };
    document.documentElement.lang = language;
    selector.value = preference;
    const website = document.querySelector('#officialWebsite');
    if (website) website.href = localizedWebsiteUrl(preference === 'auto' ? 'auto' : language);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      if (excluded(node) || !node.nodeValue.trim()) continue;
      const current = node.nodeValue;
      const spacing = current.match(/^(\s*)([\s\S]*?)(\s*)$/);
      let translateText = translate;
      if (node.parentElement?.hasAttribute('data-ui-lines')) {
        translateText = source => source.split('\n').map(translateDiagnostic).join('\n');
      } else if (node.parentElement?.hasAttribute('data-ui-pair')) {
        translateText = source => source.split(' → ').map(translate).join(' → ');
      } else if (node.parentElement?.getAttribute('role') === 'status') {
        translateText = translateError;
      }
      const value = updateValue(spacing[2], texts.get(node), translateText);
      texts.set(node, value);
      const next = spacing[1] + value.last + spacing[3];
      if (current !== next) node.nodeValue = next;
    }
    for (const element of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
      const records = attributes.get(element) || {};
      for (const name of ['aria-label', 'title', 'placeholder']) {
        if (!element.hasAttribute(name)) continue;
        const value = updateValue(element.getAttribute(name), records[name], translate);
        records[name] = value;
        if (element.getAttribute(name) !== value.last) element.setAttribute(name, value.last);
      }
      attributes.set(element, records);
    }
  }
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; render(); });
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
  selector.addEventListener('change', async () => {
    preference = uiLanguagePreference(selector.value);
    const choice = preference, changedAt = Date.now();
    render();
    const result = await chrome.runtime.sendMessage({type: 'ui-language-choose', preference: choice, changedAt}).catch(() => undefined);
    if (!result) {
      try { await chrome.storage.local.set({[UI_LANGUAGE_KEY]: choice, [UI_LANGUAGE_CHANGED_AT_KEY]: changedAt}); }
      catch { /* Selection remains usable for this popup session. */ }
    }
    refreshRegion();
  });
  const changed = new Set();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes[UI_LANGUAGE_KEY] && !changes[UI_REGION_LOCALE_KEY])) return;
    if (changes[UI_LANGUAGE_KEY]) {
      changed.add(UI_LANGUAGE_KEY);
      preference = uiLanguagePreference(changes[UI_LANGUAGE_KEY].newValue);
      refreshRegion();
    }
    if (changes[UI_REGION_LOCALE_KEY]) {
      changed.add(UI_REGION_LOCALE_KEY);
      region = changes[UI_REGION_LOCALE_KEY].newValue;
    }
    render();
  });
  window.addEventListener('languagechange', () => { if (preference === 'auto') render(); });
  try {
    const saved = await chrome.storage.local.get([UI_LANGUAGE_KEY, UI_REGION_LOCALE_KEY]);
    if (!changed.has(UI_LANGUAGE_KEY)) preference = uiLanguagePreference(saved[UI_LANGUAGE_KEY]);
    if (!changed.has(UI_REGION_LOCALE_KEY)) region = saved[UI_REGION_LOCALE_KEY];
  } catch { /* Keep the popup usable without storage. */ }
  render();
  refreshRegion();
  chrome.runtime.sendMessage({type: 'ui-language-sync'}).catch(() => {});
}

if (typeof document !== 'undefined') initializePopupLanguage();
