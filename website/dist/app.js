import './demo-posters.js';

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduced){document.documentElement.classList.add('js-motion');const reveal=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('visible');reveal.unobserve(entry.target)}},{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>reveal.observe(el))}
document.querySelector('#translate-example').addEventListener('click',event=>{const answer=document.querySelector('#example-answer');answer.hidden=!answer.hidden;event.currentTarget.setAttribute('aria-expanded',String(!answer.hidden));const labels={en:['Show reply example','Hide example'],'zh-Hant':['看回覆示例','收起示例'],'zh-Hans':['查看回复示例','收起示例'],ja:['返信例を見る','閉じる'],ko:['답장 예시 보기','예시 닫기']};event.currentTarget.querySelector('span').textContent=(labels[document.documentElement.lang]||labels.en)[answer.hidden?0:1]});
if('IntersectionObserver' in window){const canvas=document.querySelector('#language-orbit');const observer=new IntersectionObserver(async entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();try{const {startOrbit}=await import('./assets/orbit.js');startOrbit(canvas,reduced)}catch{canvas.hidden=true}}});observer.observe(canvas)}

// Put the interactive example before the download on phones, including DOM order.
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

// Highlight the selected destination without changing keyboard focus.
const sectionLinks = [...document.querySelectorAll('.nav nav a')];
function updateNavigation() {
 const selected = location.hash || '#demo';
 sectionLinks.forEach(link => {
  if (link.getAttribute('href') === selected) link.setAttribute('aria-current', 'location');
  else link.removeAttribute('aria-current');
 });
}
updateNavigation();
window.addEventListener('hashchange', updateNavigation);
