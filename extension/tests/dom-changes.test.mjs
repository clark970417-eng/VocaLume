import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../dom-changes.js', import.meta.url), 'utf8');

test('scan batches inspect only added subtrees and changed ancestors, skipping extension UI', () => {
  let observe, active = true, pageQueries = 0, subtreeQueries = 0, observing = false;
  const scheduled = [], scans = [];
  const document = { documentElement: {}, querySelectorAll() { pageQueries++; return []; } };
  const context = vm.createContext({
    document,
    MutationObserver: class { constructor(callback) { observe = callback; } observe() { observing = true; } disconnect() { observing = false; } },
    setTimeout: callback => scheduled.push(callback)
  });
  vm.runInContext(source, context);
  const { observe: observePage, select } = context.VocaLumeDomChanges;
  const element = (name, { parentElement, message = false, owned = false } = {}) => ({
    name, nodeType: 1, parentElement, isConnected: true, descendants: [],
    matches(selector) { return selector === '.message' && message; },
    closest(selector) {
      if (selector.includes('jtl-') && owned) return this;
      return this.matches(selector) ? this : parentElement?.closest(selector);
    },
    querySelectorAll(selector) { subtreeQueries++; return this.descendants.filter(node => node.matches(selector)); }
  });
  const container = element('chat history');
  const existing = element('recycled', { parentElement: container, message: true });
  const added = element('inserted wrapper', { parentElement: container });
  const newest = element('new message', { parentElement: added, message: true });
  const translatorUi = element('our overlay', { parentElement: container, owned: true });
  added.descendants.push(newest);
  const children = (target, addedNodes = [], removedNodes = []) => ({ type: 'childList', target, addedNodes, removedNodes });
  const watcher = observePage(scope => scans.push(Array.from(select(scope, '.message'), node => node.name)), { active: () => active });
  observe([children(container, [translatorUi]), children(container, [], [translatorUi]), {
    type: 'characterData', target: { nodeType: 3, parentElement: translatorUi }
  }]);
  assert.equal(scheduled.length, 0, 'our own captions and statuses do not trigger a scan');
  observe([children(container, [added]), children(added, [newest])]);
  observe([{ type: 'characterData', target: { nodeType: 3, parentElement: existing } }]);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.deepEqual(scans, [['recycled', 'new message']]);
  assert.equal(pageQueries, 0);
  assert.equal(subtreeQueries, 1, 'a child inserted with its parent is not searched twice');
  assert.equal(observing,true);
  active = false;
  watcher.sync();
  assert.equal(observing,false,'disabled translation disconnects the observer');
  observe([children(container, [added])]);
  assert.equal(scheduled.length, 0, 'disabled translation does not queue page work');
});
