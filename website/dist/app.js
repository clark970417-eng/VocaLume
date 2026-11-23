import './demo-posters.js';
import './demo-autoplay.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Interactive reply example in the hero card.
const translateExample = document.querySelector('#translate-example');
translateExample?.addEventListener('click', event => {
  const answer = document.querySelector('#example-answer');
  if (!answer) return;
  answer.hidden = !answer.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!answer.hidden));
  const labels = {
    en: ['Show reply example', 'Hide example'],
    'zh-Hant': ['看回覆示例', '收起示例'],
    'zh-Hans': ['查看回复示例', '收起示例'],
    ja: ['返信例を見る', '閉じる'],
    ko: ['답장 예시 보기', '예시 닫기'],
  };
  const span = event.currentTarget.querySelector('span');
  if (span) span.textContent = (labels[document.documentElement.lang] || labels.en)[answer.hidden ? 0 : 1];
});

// Put the interactive example before the download actions on phones, including DOM order.
const heroExample = document.querySelector('.hero-art');
const heroCopy = document.querySelector('.hero-copy');
const heroActions = heroCopy?.querySelector('.actions');
if (heroExample && heroCopy && heroActions) {
  const desktopPosition = document.createComment('hero-example-desktop-position');
  heroExample.before(desktopPosition);
  const phoneLayout = matchMedia('(max-width: 760px)');
  const arrangeHero = () => {
    if (phoneLayout.matches) heroCopy.insertBefore(heroExample, heroActions);
    else desktopPosition.after(heroExample);
  };
  arrangeHero();
  phoneLayout.addEventListener('change', arrangeHero);
}

// Gentle entry motion for setup steps only; media and section geometry stay stable.
if (!reducedMotion && 'IntersectionObserver' in window) {
  const steps = document.querySelectorAll('.steps li');
  if (steps.length) {
    const stepObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.animate(
          [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' }
        );
        stepObserver.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    steps.forEach(el => stepObserver.observe(el));
  }
}

// Follow the visible section while scrolling, without rewriting history or focus.
const sectionLinks = [...document.querySelectorAll('.nav nav a')];
const destinations = sectionLinks
  .map(link => ({ link, section: document.querySelector(link.getAttribute('href')) }))
  .filter(item => item.section);

let navigationFrame = 0;
function updateNavigation() {
  navigationFrame = 0;
  if (!destinations.length) return;
  const headerBottom = document.querySelector('.nav')?.getBoundingClientRect().bottom || 0;
  const readingLine = Math.min(innerHeight * 0.5, headerBottom + 70);
  let active = destinations[0];
  for (const item of destinations) {
    if (item.section.getBoundingClientRect().top <= readingLine) active = item;
  }
  if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 8) {
    active = destinations.at(-1);
  }
  for (const item of destinations) {
    if (item === active) item.link.setAttribute('aria-current', 'location');
    else item.link.removeAttribute('aria-current');
  }
}

function scheduleNavigation() {
  if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNavigation);
}

updateNavigation();
window.addEventListener('scroll', scheduleNavigation, { passive: true });
window.addEventListener('resize', scheduleNavigation, { passive: true });
window.addEventListener('hashchange', scheduleNavigation);
window.addEventListener('load', scheduleNavigation);
