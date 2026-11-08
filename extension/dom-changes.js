(() => {
  const extensionUi = '[class^="jtl-"], [class*=" jtl-"], #jtl-subtitles';
  const element = node => node?.nodeType === 1 ? node : node?.parentElement;
  const owned = node => Boolean(element(node)?.closest?.(extensionUi));

  function select(scope, selector) {
    if (!scope) return [...document.querySelectorAll(selector)];
    const matches = new Set();
    for (const target of scope.changed) {
      if (!target.isConnected) continue;
      const match = target.closest(selector);
      if (match && !owned(match)) matches.add(match);
    }
    for (const root of scope.added) {
      if (!root.isConnected) continue;
      // If the page appended a whole region and its children in one batch,
      // search the region only once.
      let parent = root.parentElement;
      while (parent && !scope.added.has(parent)) parent = parent.parentElement;
      if (parent) continue;
      if (root.matches(selector)) matches.add(root);
      for (const match of root.querySelectorAll(selector)) if (!owned(match)) matches.add(match);
    }
    return [...matches].sort((a, b) => {
      if (a === b || !a.compareDocumentPosition) return 0;
      return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    });
  }

  function observe(scan, { active = () => true, delay = 250, attributeFilter = ['contenteditable'] } = {}) {
    let scheduled = false;
    let added = new Set(), changed = new Set(), removed = false;
    const observer = new MutationObserver(records => {
      if (!active()) return;
      for (const record of records) {
        const target = element(record.target);
        if (!target || owned(target)) continue;
        if (record.type !== 'childList') {
          changed.add(target);
          if (record.type === 'attributes') added.add(target);
          continue;
        }
        let pageChanged = false;
        for (const node of record.addedNodes) {
          if (owned(node)) continue;
          if (node.nodeType === 1) added.add(node);
          pageChanged = true;
        }
        for (const node of record.removedNodes) {
          if (owned(node)) continue;
          removed = pageChanged = true;
        }
        if (pageChanged) changed.add(target);
      }
      if (scheduled || (!added.size && !changed.size && !removed)) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const scope = { added, changed, removed };
        added = new Set(); changed = new Set(); removed = false;
        if (active()) scan(scope);
      }, delay);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter });
    return observer;
  }

  globalThis.VocaLumeDomChanges = { select, observe };
})();
