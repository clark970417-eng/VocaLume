const installButton = document.querySelector('[data-install-app]');
const installHelp = document.querySelector('[data-install-help]');
const standalone = matchMedia('(display-mode: standalone)');
let prompt;
let installed = false;

function updateInstallControls() {
  const alreadyInstalled = installed || standalone.matches || navigator.standalone === true;
  if (installButton) installButton.hidden = alreadyInstalled || !prompt;
  if (installHelp) installHelp.hidden = alreadyInstalled;
}

if (installButton) {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    updateInstallControls();
  });
  installButton.addEventListener('click', async () => {
    const pending = prompt;
    if (!pending) return;
    prompt = undefined;
    updateInstallControls();
    try {
      const choice = await pending.prompt();
      if (choice?.outcome === 'accepted') installed = true;
    } catch {
      // The browser's own installation menu remains available.
    }
    updateInstallControls();
  });
}

window.addEventListener('appinstalled', () => {
  installed = true;
  prompt = undefined;
  updateInstallControls();
});
standalone.addEventListener?.('change', updateInstallControls);
updateInstallControls();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' }).catch(() => {
    // The online app remains usable when storage or workers are disabled.
  });
}
