// Right-hand staggered menu. Lives outside #app so it survives page changes. GSAP (vendored) drives the choreography.
import { state, esc, reduceMotion, slot } from './lib.js';

let el = null, gsap = null, open = false, tl = null;

function loadGsap() {
  if (window.gsap) return Promise.resolve(window.gsap);
  return new Promise((res) => { const s = document.createElement('script'); s.src = '/vendor/gsap/gsap.min.js'; s.onload = () => res(window.gsap); s.onerror = () => res(null); document.head.appendChild(s); });
}

const items = () => {
  const u = state.user; const portal = u ? (u.role === 'admin' ? '/admin' : u.role === 'owner' ? '/owner' : '/account/bookings') : '';
  return [['Home', '/'], ['Find space', '/search'], ['List your space', '/host'], ['How it works', '/how-it-works'], ['Host pricing', '/host#earn'], ['Contact', '/contact'], u ? [u.role === 'customer' ? 'My bookings' : 'Dashboard', portal] : ['Sign in', '/login']];
};

function navHtml() {
  const path = location.pathname;
  return items().map(([label, href], i) => `<li><a href="${esc(href)}" class="${(href === '/' ? path === '/' : path === href.split('#')[0] && !href.includes('#')) ? 'on' : ''}"><em>${String(i + 1).padStart(2, '0')}</em>${esc(label)}</a></li>`).join('');
}

function socialsHtml() {
  const s = state.site?.settings || {};
  const links = [['Instagram', s.social_instagram], ['Facebook', s.social_facebook], ['LinkedIn', s.social_linkedin]].filter(([, u]) => /^https?:\/\//.test(u || ''));
  const contact = `<a href="tel:${esc(s.contact_phone)}">${esc(s.contact_phone)}</a><a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`;
  return `<span class="menu-socials-title">${links.length ? 'FOLLOW' : 'TALK TO A PERSON'}</span><div class="menu-socials-links">${links.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('')}${links.length ? '' : contact}</div>${links.length ? `<div class="menu-socials-links">${contact}</div>` : ''}`;
}

export function mountMenu() {
  if (el) return;
  el = document.createElement('div'); el.className = 'sm';
  el.innerHTML = `<div class="menu-backdrop"></div><div class="menu-prelayer menu-prelayer-1"></div><div class="menu-prelayer menu-prelayer-2"></div>
  <aside class="menu-panel" aria-label="Site menu" inert><div><div class="menu-eyebrow">${esc(state.site.settings.tagline)}</div><ul class="menu-nav"></ul><a class="menu-cta" href="/host/join">List your space free</a></div><div class="menu-media"></div><div class="menu-socials"></div></aside>
  <button class="menu-toggle" type="button" aria-expanded="false" aria-label="Open menu"><span class="menu-toggle-label"><span class="l-menu">MENU</span><span class="l-close">CLOSE</span></span><span class="menu-toggle-icon" aria-hidden="true">+</span></button>`;
  document.body.appendChild(el);
  q('.l-close').style.transform = 'translateY(100%)';
  // Hand the starting positions to GSAP once it has loaded (inline 'none' first so CSS px values are not double-counted).
  loadGsap().then((g) => { gsap = g; if (!g) return; const nodes = [q('.menu-prelayer-1'), q('.menu-prelayer-2'), q('.menu-panel'), q('.l-close')]; nodes.forEach((n) => { n.style.transform = 'none'; }); g.set(nodes.slice(0, 3), { xPercent: 100 }); g.set(q('.l-close'), { yPercent: 100 }); });
  q('.menu-toggle').addEventListener('click', () => (open ? close() : openMenu()));
  q('.menu-backdrop').addEventListener('click', close);
  q('.menu-panel').addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  addEventListener('popstate', () => open && close());
  refresh();
}
const q = (s) => el.querySelector(s);

// Rebuild the link list (login state and active page change between renders) and keep the pill clear of the announcement bar.
export function refresh() {
  if (!el) return;
  q('.menu-nav').innerHTML = navHtml(); q('.menu-socials').innerHTML = socialsHtml(); const mm = slot('menu_image'); q('.menu-media').innerHTML = mm && mm.kind === 'image' ? `<img src="${esc(mm.url)}" alt="${esc(mm.alt)}" loading="lazy">` : ''; q('.menu-eyebrow').textContent = state.site.settings.tagline;
  placeToggle();
}
export function placeToggle() {
  if (!el) return; const ann = document.getElementById('ann'); const aH = ann ? ann.offsetHeight : 0;
  q('.menu-toggle').style.top = (Math.max(0, aH - scrollY) + 8) + 'px';
}
addEventListener('scroll', () => placeToggle(), { passive: true });

async function openMenu() {
  if (open) return; open = true;
  if (!gsap) gsap = await loadGsap();
  if (!open) return; // closed again while loading
  const panel = q('.menu-panel'), toggle = q('.menu-toggle'), back = q('.menu-backdrop'), p1 = q('.menu-prelayer-1'), p2 = q('.menu-prelayer-2');
  const links = [...el.querySelectorAll('.menu-nav li a')], foot = [q('.menu-cta'), q('.menu-socials')];
  panel.classList.add('is-open'); panel.removeAttribute('inert'); toggle.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Close menu'); back.classList.add('on');
  document.documentElement.style.overflow = 'hidden';
  if (!gsap || reduceMotion()) { [p1, p2].forEach((p) => { p.style.transform = 'translateX(100%)'; }); panel.style.transform = 'none'; if (gsap) { gsap.set([p1, p2], { xPercent: 100 }); gsap.set(panel, { xPercent: 0 }); gsap.set(q('.l-menu'), { yPercent: -100 }); gsap.set(q('.l-close'), { yPercent: 0 }); } back.style.opacity = 1; q('.l-menu').style.transform = 'translateY(-100%)'; q('.l-close').style.transform = 'none'; links.concat(foot).forEach((l) => { l.style.opacity = 1; }); links[0]?.focus(); return; }
  tl?.kill(); gsap.set(links, { x: -40, opacity: 0 }); gsap.set(foot, { y: 20, opacity: 0 }); gsap.set([p1, p2, panel], { xPercent: 100 });
  tl = gsap.timeline({ onComplete: () => links[0]?.focus({ preventScroll: true }) });
  tl.to(back, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
    .to(q('.l-menu'), { yPercent: -100, duration: 0.4, ease: 'power3.inOut' }, 0).to(q('.l-close'), { yPercent: 0, duration: 0.4, ease: 'power3.inOut' }, 0)
    .to(p1, { xPercent: 0, duration: 0.6, ease: 'power4.out' }, 0).to(p2, { xPercent: 0, duration: 0.6, ease: 'power4.out' }, 0.08)
    .to(panel, { xPercent: 0, duration: 0.8, ease: 'power4.out' }, 0.15)
    .to([p1, p2], { xPercent: 100, duration: 0.5, ease: 'power3.in', stagger: 0.04 }, 0.55)
    .to(links, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, 0.6)
    .to(foot, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.08 }, 0.95);
}

function close() {
  if (!open) return; open = false;
  const panel = q('.menu-panel'), toggle = q('.menu-toggle'), back = q('.menu-backdrop');
  toggle.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); back.classList.remove('on'); panel.setAttribute('inert', '');
  const done = () => { panel.classList.remove('is-open'); document.documentElement.style.overflow = ''; };
  if (!gsap || reduceMotion()) { panel.style.transform = ''; back.style.opacity = 0; q('.l-menu').style.transform = ''; q('.l-close').style.transform = 'translateY(100%)'; done(); return; }
  tl?.kill(); const links = [...el.querySelectorAll('.menu-nav li a')];
  tl = gsap.timeline({ onComplete: done });
  tl.to(links, { x: 40, opacity: 0, duration: 0.3, ease: 'power2.in', stagger: 0.03 }, 0)
    .to(panel, { xPercent: 100, duration: 0.6, ease: 'power4.in' }, 0.12)
    .to(back, { opacity: 0, duration: 0.5 }, 0.15)
    .to(q('.l-menu'), { yPercent: 0, duration: 0.4, ease: 'power3.inOut' }, 0.15).to(q('.l-close'), { yPercent: 100, duration: 0.4, ease: 'power3.inOut' }, 0.15);
}
