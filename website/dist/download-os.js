// Highlight and prioritize the visitor's desktop OS on the download guide.
(() => {
  const container = document.querySelector('.download-cards');
  if (!container) return;
  const raw = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  const os = raw.includes('win') ? 'windows' : raw.includes('mac') ? 'mac' : '';
  if (!os) return;
  const card = container.querySelector(`[data-os="${os}"]`);
  if (!card) return;
  card.classList.add('is-recommended');
  const badge = card.querySelector('.os-badge');
  if (badge) badge.hidden = false;
  if (container.firstElementChild !== card) {
    container.prepend(card);
    [...container.querySelectorAll('.download-number')].forEach((node, index) => {
      node.textContent = String(index + 1).padStart(2, '0');
    });
  }
})();
