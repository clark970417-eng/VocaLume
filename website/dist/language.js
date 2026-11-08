(() => {
  const pages = {
    'zh-Hant': 'index.html',
    'zh-Hans': 'zh-CN.html',
    en: 'en.html',
    ja: 'ja.html',
    ko: 'ko.html',
  };
  const storageKey = 'vocalume-site-language';
  const tabStorageKey = 'vocalume-site-tab-language';
  const current = document.documentElement.lang;
  const directory = location.pathname === '/download' || location.pathname.startsWith('/download/')
    ? '/download/'
    : '/';
  const supports = language => typeof language === 'string' && Object.hasOwn(pages, language);
  const search = new URLSearchParams(location.search);
  const requested = search.get('lang');
  const explicitLanguage = supports(requested) ? requested : null;
  let tabLanguage = explicitLanguage || readTabLanguage();
  let chosen = Boolean(tabLanguage);
  let locationLookup;

  function readTabLanguage() {
    try {
      const saved = sessionStorage.getItem(tabStorageKey);
      return supports(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function rememberTabLanguage(language) {
    tabLanguage = language;
    try {
      sessionStorage.setItem(tabStorageKey, language);
    } catch {
      // The current document still honors the explicit selection.
    }
  }

  function readPreference() {
    try {
      const saved = localStorage.getItem(storageKey);
      return supports(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function savePreference(language) {
    try {
      if (readPreference() !== language) localStorage.setItem(storageKey, language);
    } catch {
      // Direct navigation works when the browser blocks local storage.
    }
  }

  function href(path, parameters) {
    const query = parameters.toString();
    return path + (query ? '?' + query : '') + location.hash;
  }

  function choose(language, {replace = false, fromLink = false} = {}) {
    chosen = true;
    locationLookup?.abort();
    savePreference(language);
    const parameters = new URLSearchParams(location.search);
    parameters.delete('lang');
    if (language === current) {
      if (fromLink) history.replaceState(history.state, '', href(location.pathname, parameters));
      return;
    }
    // Let the destination remember that this navigation was explicit before it
    // removes the parameter and receives the extension's startup preference.
    if (fromLink || !replace) parameters.set('lang', language);
    const destination = href(directory + pages[language], parameters);
    if (replace) location.replace(destination);
    else location.assign(destination);
  }

  if (explicitLanguage) {
    rememberTabLanguage(explicitLanguage);
    choose(explicitLanguage, {replace: true, fromLink: true});
    if (explicitLanguage !== current) return;
  } else if (tabLanguage && tabLanguage !== current) {
    location.replace(href(directory + pages[tabLanguage], search));
    return;
  }

  window.addEventListener('message', event => {
    if (window.top !== window || event.source !== window || event.origin !== location.origin) return;
    const {type, locale, live} = event.data || {};
    if (type !== 'VOCALUME_UI_LANGUAGE' || !supports(locale)
        || (tabLanguage && live !== true)) return;
    if (tabLanguage) rememberTabLanguage(locale);
    choose(locale, {replace: true});
  });

  const landing = location.pathname === directory || location.pathname === directory + pages['zh-Hant']
    || location.pathname === '/download';
  const saved = readPreference();
  if (!tabLanguage && landing && saved && saved !== current) {
    location.replace(href(directory + pages[saved], search));
    return;
  }

  if (!chosen && landing && !saved && directory === '/') {
    const browserLanguage = () => {
      for (const language of navigator.languages || [navigator.language]) {
        if (/^ko(?:-|$)/i.test(language)) return 'ko';
        if (/^ja(?:-|$)/i.test(language)) return 'ja';
        if (/^zh-(?:CN|SG|Hans)(?:-|$)/i.test(language)) return 'zh-Hans';
        if (/^zh(?:-|$)/i.test(language)) return 'zh-Hant';
        if (/^en(?:-|$)/i.test(language)) return 'en';
      }
      return 'en';
    };
    locationLookup = new AbortController();
    const timer = setTimeout(() => locationLookup.abort(), 1500);
    fetch('/api/site-language', {signal: locationLookup.signal, cache: 'no-store', credentials: 'omit'})
      .then(response => {
        if (!response.ok) throw new Error('Site language is unavailable');
        return response.json();
      })
      .then(data => supports(data?.language) ? data.language : browserLanguage(), browserLanguage)
      .then(language => {
        if (!chosen && !readPreference() && language !== current) {
          location.replace(href(directory + pages[language], search));
        }
      })
      .finally(() => clearTimeout(timer));
  }

  const root = document.querySelector('[data-language-menu]');
  if (!root) return;
  const trigger = root.querySelector('button');
  const menu = root.querySelector('[role=menu]');
  const items = [...menu.querySelectorAll('[data-language]')];

  function close(focus = false) {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }

  function open() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    (items.find(item => item.dataset.language === current) || items[0])?.focus();
  }

  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (menu.hidden) {
      event.stopPropagation();
      open();
    }
  });
  for (const item of items) {
    item.addEventListener('click', () => {
      const language = item.dataset.language;
      if (!supports(language)) return;
      rememberTabLanguage(language);
      choose(language);
      if (language === current) close(true);
    });
  }
  root.addEventListener('keydown', event => {
    if (menu.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const active = items.indexOf(document.activeElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (active + offset + items.length) % items.length;
    items[index]?.focus();
  });
  document.addEventListener('click', event => {
    if (!root.contains(event.target)) close();
  });
  root.addEventListener('focusout', event => {
    if (!root.contains(event.relatedTarget)) close();
  });
})();
