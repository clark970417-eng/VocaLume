import { UI_LANGUAGE_KEY, uiLanguagePreference, resolveUiLanguage, translateUiText } from './ui-language.mjs';

export async function initializePopupLanguage() {
  const selector = document.querySelector('#uiLanguage');
  if (!selector) return;
  let preference = 'auto';
  try { preference = uiLanguagePreference((await chrome.storage.local.get(UI_LANGUAGE_KEY))[UI_LANGUAGE_KEY]); } catch { /* Keep the popup usable without storage. */ }
  const texts = new WeakMap(), attributes = new WeakMap();
  const excluded = node => node.parentElement?.closest('script,style,textarea,pre,#captionPreview,#uiLanguage option[lang]');
  const locale = () => resolveUiLanguage(preference, navigator.languages?.length ? navigator.languages : [navigator.language]);
  function updateValue(current, previous, language) {
    const source = previous && current === previous.last ? previous.source : current;
    return { source, last: translateUiText(source, language) };
  }
  function render() {
    const language = locale();
    document.documentElement.lang = language;
    selector.value = preference;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      if (excluded(node) || !node.nodeValue.trim()) continue;
      const current = node.nodeValue;
      const spacing = current.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const value = updateValue(spacing[2], texts.get(node), language);
      texts.set(node, value);
      const next = spacing[1] + value.last + spacing[3];
      if (current !== next) node.nodeValue = next;
    }
    for (const element of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
      if (element.closest('#captionPreview,textarea,pre')) continue;
      const records = attributes.get(element) || {};
      for (const name of ['aria-label', 'title', 'placeholder']) {
        if (!element.hasAttribute(name)) continue;
        const value = updateValue(element.getAttribute(name), records[name], language);
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
    render();
    try { await chrome.storage.local.set({ [UI_LANGUAGE_KEY]: preference }); }
    catch { /* Selection remains usable for this popup session. */ }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[UI_LANGUAGE_KEY]) return;
    preference = uiLanguagePreference(changes[UI_LANGUAGE_KEY].newValue);
    render();
  });
  window.addEventListener('languagechange', () => { if (preference === 'auto') render(); });
  render();
}

if (typeof document !== 'undefined') initializePopupLanguage();
