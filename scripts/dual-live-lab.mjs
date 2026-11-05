import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const gitDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: root, encoding: 'utf8'
}).trim();
const appRequire = createRequire(resolve(gitDirectory, '../desktop-app/package.json'));
const { chromium } = appRequire('playwright');
const extension = join(root, 'extension');
const profiles = await mkdtemp(join(tmpdir(), 'vocalume-dual-live-'));
const smoke = process.argv.includes('--smoke');
const contexts = [];
const shutdown = async () => {
  await Promise.allSettled(contexts.map(context => context.close()));
  await rm(profiles, { recursive: true, force: true });
};

try {
  for (const slot of ['A', 'B']) {
    const context = await chromium.launchPersistentContext(join(profiles, slot), {
      channel: 'chromium',
      executablePath: process.env.VOCALUME_LAB_CHROMIUM || undefined,
      headless: smoke,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    contexts.push(context);
    const worker = context.serviceWorkers().find(item => item.url().endsWith('/background.js'))
      || await context.waitForEvent('serviceworker', { predicate: item => item.url().endsWith('/background.js') });
    await worker.evaluate(async slot => {
      await chrome.storage.local.set({ speechMode: 'browser', dualLiveLabSlot: slot });
    }, slot);
    console.log(`Slot ${slot}: VocaLume loaded in an isolated Chromium profile.`);
  }

  for (const [index, context] of contexts.entries()) {
    const worker = context.serviceWorkers().find(item => item.url().endsWith('/background.js'));
    const state = await worker.evaluate(() => chrome.storage.local.get(['speechMode', 'dualLiveLabSlot']));
    assert.deepEqual(state, { speechMode: 'browser', dualLiveLabSlot: ['A', 'B'][index] });
  }
  console.log('Both installed extensions keep separate settings.');

  if (!smoke) {
    console.log('Open one live stream in each window and start VocaLume captions. Press Enter here to close the lab.');
    process.stdin.resume();
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
      process.stdin.once('end', resolve);
      process.once('SIGINT', resolve);
    });
    process.stdin.pause();
  }
} finally {
  await shutdown();
}
