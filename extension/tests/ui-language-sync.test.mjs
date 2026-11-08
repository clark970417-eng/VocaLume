import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiLanguageSync} from '../ui-language-sync.mjs';
import {UI_LANGUAGE_KEY, UI_LANGUAGE_CHANGED_AT_KEY} from '../ui-language.mjs';

function fixture(appChoice, preferences = {}) {
  const saved = {languageSettings: {speechSource:'ja', speechTarget:'zh'}, ...preferences};
  const requests = [];
  let receive;
  const port = {
    onMessage: {addListener: listener => {receive = listener;}},
    onDisconnect: {addListener() {}},
    postMessage(message) {
      requests.push(message);
      if (message.op === 'set-ui-language') appChoice = message.choice;
      queueMicrotask(() => receive({id:message.id,ok:true,result:appChoice}));
    },
    disconnect() {}
  };
  const sync = createUiLanguageSync({
    runtime:{connectNative: name => {assert.equal(name, 'org.jtl.ui_language'); return port;}},
    storage:{local:{get:async () => ({...saved}), set:async values => {Object.assign(saved, values);}}}
  });
  return {sync, saved, requests, push: choice => receive({event:'ui-language',result:choice})};
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('App, browser and website choices reconcile without changing the translation direction', async () => {
  const initial = Date.now() - 20;
  const {sync,saved,requests,push} = fixture({preference:'ja',changedAt:initial});
  sync.connect();
  await flush();
  assert.equal(saved[UI_LANGUAGE_KEY], 'ja');

  const korean = await sync.choose('ko');
  await flush();
  assert.deepEqual(requests.map(message => message.op), ['watch-ui-language','set-ui-language']);
  assert.deepEqual(requests.at(-1).choice, korean);

  push({preference:'auto',changedAt:korean.changedAt + 1});
  await flush();
  assert.equal(saved[UI_LANGUAGE_KEY], 'auto');
  await sync.choose('ja', initial);
  assert.equal(saved[UI_LANGUAGE_KEY], 'auto');
  assert.deepEqual(saved.languageSettings, {speechSource:'ja', speechTarget:'zh'});
  await assert.rejects(sync.choose('__proto__'), /Invalid interface language/);
});

test('an existing browser language can migrate to a new App without making Auto manual', async () => {
  const {sync,saved,requests} = fixture({preference:'auto',changedAt:0}, {[UI_LANGUAGE_KEY]:'ko'});
  sync.connect();
  await flush();
  assert.equal(saved[UI_LANGUAGE_KEY], 'ko');
  assert(saved[UI_LANGUAGE_CHANGED_AT_KEY] > 0);
  assert.equal(requests.at(-1).choice.preference, 'ko');
});
