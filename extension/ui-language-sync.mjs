import {NativeClient} from './native-client.mjs';
import {UI_LANGUAGE_KEY, UI_LANGUAGE_CHANGED_AT_KEY, uiLanguagePreference} from './ui-language.mjs';

const isTimestamp = value => Number.isSafeInteger(value) && value >= 0;
const isChoice = choice => choice && uiLanguagePreference(choice.preference) === choice.preference
  && isTimestamp(choice.changedAt);

export function createUiLanguageSync(chrome) {
  const client = new NativeClient(chrome.runtime, 'org.jtl.ui_language');
  let queue = Promise.resolve();
  let remote, connecting, sending;
  let nextAttempt = 0;

  const run = task => {
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  };
  async function read() {
    const values = await chrome.storage.local.get([UI_LANGUAGE_KEY, UI_LANGUAGE_CHANGED_AT_KEY]);
    const changedAt = values[UI_LANGUAGE_CHANGED_AT_KEY];
    return {preference: uiLanguagePreference(values[UI_LANGUAGE_KEY]), changedAt: isTimestamp(changedAt) ? changedAt : 0};
  }
  function save(choice) {
    return chrome.storage.local.set({
      [UI_LANGUAGE_KEY]: choice.preference,
      [UI_LANGUAGE_CHANGED_AT_KEY]: choice.changedAt
    });
  }
  function send(local) {
    if (!client.port || !remote || local.changedAt <= remote.changedAt || sending?.changedAt >= local.changedAt) return;
    sending = local;
    void client.request('set-ui-language', {choice: local}, 2500).then(accept).catch(() => {}).finally(() => {
      if (sending === local) sending = undefined;
    });
  }
  function accept(choice) {
    if (!isChoice(choice)) return Promise.resolve();
    return run(async () => {
      if (remote && choice.changedAt < remote.changedAt) return;
      remote = choice;
      const local = await read();
      if (local.changedAt === 0 && local.preference !== 'auto' && remote.changedAt === 0 && remote.preference === 'auto') {
        // Preserve the user's selection from builds that did not save a timestamp.
        const migrated = {...local, changedAt: Date.now()};
        await save(migrated);
        send(migrated);
      } else if (remote.changedAt > local.changedAt || (remote.changedAt === local.changedAt && remote.preference !== local.preference)) {
        await save(remote);
      } else {
        send(local);
      }
    });
  }
  client.onEvent = message => {
    if (message.event === 'ui-language') void accept(message.result).catch(() => {});
  };

  function connect() {
    if (connecting || client.port || Date.now() < nextAttempt) return;
    remote = undefined;
    sending = undefined;
    connecting = client.request('watch-ui-language', {}, 2500).then(choice => {
      if (!isChoice(choice)) throw new Error('Invalid desktop language choice');
      return accept(choice);
    }).catch(() => {
      client.close();
      nextAttempt = Date.now() + 1500;
    }).finally(() => { connecting = undefined; });
  }

  async function choose(preference, requestedAt) {
    if (uiLanguagePreference(preference) !== preference) throw new Error('Invalid interface language');
    if (requestedAt !== undefined && (!isTimestamp(requestedAt) || Math.abs(Date.now() - requestedAt) > 10_000)) {
      throw new Error('Invalid interface language choice time');
    }
    return run(async () => {
      const previous = await read();
      if (requestedAt !== undefined && requestedAt < previous.changedAt) return previous;
      if (requestedAt === previous.changedAt && preference === previous.preference) return previous;
      const choice = {preference, changedAt: Math.max(requestedAt ?? Date.now(), previous.changedAt + 1, (remote?.changedAt ?? 0) + 1)};
      await save(choice);
      connect();
      send(choice);
      return choice;
    });
  }
  return {connect, choose};
}
