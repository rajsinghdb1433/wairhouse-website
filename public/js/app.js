import { html, raw, esc, $, $$, on, state, api, icon, logoSvg, toast, reveal, splitWords, tilt, magnetic, toggleWish, reduceMotion } from './lib.js';
import { mountMenu, refresh as refreshMenu } from './menu.js';

const routes = []; // [regex, loader, opts]
const R = (re, loader, opts = {}) => routes.push([re, loader, opts]);

// public
R(/^\/$/, () => import('./pages/home.js'), { layout: 'home' });
R(/^\/search$/, () => import('./pages/search.js'), { layout: 'search' });
R(/^\/space\/([\w-]+)$/, () => import('./pages/space.js'));
R(/^\/(host|how-it-works|about|faq|contact|legal|legal\/([\w-]+)|pricing)$/, () => import('./pages/info.js'));
R(/^\/host\/join$/, () => import('./pages/auth.js').then((m) => ({ default: m.joinPage })));
R(/^\/(login|register|forgot|reset|verify)$/, () => import('./pages/auth.js'), { layout: 'auth' });
// portals
R(/^\/account(\/[\w-]*)?$/, () => import('./pages/account.js'), { layout: 'portal', roles: ['customer', 'owner', 'admin'] });
R(/^\/owner(\/[\w-]*)*$/, () => import('./pages/owner.js'), { layout: 'portal', roles: ['owner', 'admin'] });
R(/^\/admin(\/[\w-]*)?$/, () => import('./pages/admin.js'), { layout: 'portal', roles: ['admin'] });

// Background videos only play while on screen, and not at all for people who prefer reduced motion (they see the poster).
let vio = null;
function playVisibleVideos(root) {
  const vids = $$('video[data-bg]', root); if (!vids.length) return;
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  vio?.disconnect(); vio = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; if (e.isIntersecting) { v.play().catch(() => {}); } else v.pause(); }), { threshold: 0.25 });
  vids.forEach((v) => vio.observe(v));
}
const app = $('#app'); let cleanup = []; let current = null;
export const ctx = { onLeave: (fn) => cleanup.push(fn), navigate, main: null };

export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', to); render();
}

const NAV = [['/search', 'Find space'], ['/host', 'List your space'], ['/how-it-works', 'How it works'], ['/about', 'About']];
function headerHtml() {
  const u = state.user; const s = state.site.settings; const path = location.pathname;
  const portal = u ? (u.role === 'admin' ? '/admin' : u.role === 'owner' ? '/owner' : '/account') : '';
  return html`${s.announcement_enabled === '1' && s.announcement && !sessionStorage.getItem('ann') ? html`<div class="announce" id="ann"><span>${s.announcement}</span><a href="/host" data-link>Learn more</a><button aria-label="Dismiss" data-dismiss-ann>×</button></div>` : ''}
  <header class="hdr" id="hdr"><div class="wrap">
    <a class="logo" href="/" data-link aria-label="wAIRhouse home">${logoSvg()}<span>w<b>AIR</b>house</span></a>
    <nav class="nav" aria-label="Main">${NAV.map(([h, t]) => html`<a href="${h}" data-link class="${path === h ? 'on' : ''}">${t}</a>`)}</nav>
    <div class="sp"></div>
    <div class="hdr-actions">
      ${u ? html`<a class="btn btn-g btn-sm" href="${u.role === 'customer' ? '/search' : portal}" data-link>${u.role === 'customer' ? 'Find space' : 'Dashboard'}</a>
        <div class="menu" id="umenu"><button class="avatar" aria-haspopup="true" aria-label="Account menu">${(u.name || '?')[0].toUpperCase()}</button>
          <div class="menu-pop" role="menu"><div style="padding:10px 14px"><b>${u.name}</b><div class="muted" style="font-size:13px">${u.email}</div></div><hr>
            ${u.role === 'admin' ? html`<a href="/admin" data-link>Admin panel</a>` : ''}${u.role !== 'customer' ? html`<a href="/owner" data-link>Owner portal</a>` : ''}
            <a href="/account/bookings" data-link>My bookings</a><a href="/account/wishlist" data-link>Wishlist</a><a href="/account/messages" data-link>Messages</a><a href="/account/profile" data-link>Profile and security</a><hr><button data-logout>Sign out</button></div></div>`
        : html`<a class="btn btn-g btn-sm" href="/login" data-link>Sign in</a><a class="btn btn-p btn-sm" href="/register" data-link>Get started</a>`}
    </div></div></header>`;
}
function footerHtml() {
  const s = state.site.settings; const demo = s.show_demo_listings === '1';
  return html`<footer class="ftr"><div class="wrap"><div class="cols">
    <div><a class="logo" href="/" data-link>${logoSvg()}<span>w<b>AIR</b>house</span></a><p class="muted" style="margin:18px 0;max-width:34ch">${s.site_description}</p>
      <p><a class="link" href="tel:${s.contact_phone}">${s.contact_phone}</a><br><a class="link" href="mailto:${s.contact_email}">${s.contact_email}</a></p><p class="muted" style="font-size:14px;margin-top:8px">${s.contact_name}, ${s.contact_role}<br>${s.support_hours}</p></div>
    <div><h4>Rent space</h4><ul><li><a href="/search" data-link>Find storage</a></li><li><a href="/search?type=pallet" data-link>Pallet storage</a></li><li><a href="/search?type=self-storage" data-link>Self storage</a></li><li><a href="/search?type=cold-storage" data-link>Cold storage</a></li><li><a href="/search?type=container" data-link>Containers</a></li></ul></div>
    <div><h4>Host</h4><ul><li><a href="/host" data-link>List your space</a></li><li><a href="/host#earn" data-link>Earnings calculator</a></li><li><a href="/legal/host-agreement" data-link>Owner agreement</a></li><li><a href="/faq" data-link>Owner FAQ</a></li></ul></div>
    <div><h4>Company</h4><ul><li><a href="/about" data-link>About</a></li><li><a href="/how-it-works" data-link>How it works</a></li><li><a href="/contact" data-link>Contact</a></li><li><a href="/faq" data-link>Help centre</a></li></ul></div>
    <div><h4>Legal</h4><ul><li><a href="/legal/terms" data-link>Terms of Service</a></li><li><a href="/legal/privacy" data-link>Privacy Policy</a></li><li><a href="/legal/rental-terms" data-link>Storage Rental Terms</a></li><li><a href="/legal/cancellation" data-link>Cancellations</a></li><li><a href="/legal/acceptable-use" data-link>Prohibited goods</a></li><li><a href="/legal/cookies" data-link>Cookies</a></li></ul></div>
  </div><div class="bot"><span>© ${new Date().getFullYear()} ${s.business_name}${s.business_abn ? ' · ABN ' + s.business_abn : ''}. All rights reserved.</span><span>${demo ? 'Sample listings are shown for preview. ' : ''}Made in Australia.</span></div></div></footer>`;
}

function setActiveHeader(layout) {
  const h = $('#hdr'); if (!h) return;
  const ann = document.getElementById('ann'); const aH = ann ? ann.offsetHeight : 0; const upd = () => { h.classList.toggle('solid', scrollY > 24 || layout === 'portal' || layout === 'search' || layout === 'page' || layout === 'auth'); h.style.top = Math.max(0, aH - scrollY) + 'px'; };
  upd(); removeEventListener('scroll', window.__hs); window.__hs = upd; addEventListener('scroll', upd, { passive: true });
}

async function render() {
  const path = location.pathname.replace(/\/+$/, '') || '/'; const query = Object.fromEntries(new URLSearchParams(location.search));
  cleanup.forEach((f) => { try { f(); } catch (_) { /* ignore */ } }); cleanup = [];
  let hit = null, m = null; for (const r of routes) { m = path.match(r[0]); if (m) { hit = r; break; } }
  const layout = hit?.[2].layout || 'page';
  if (hit?.[2].roles && !(state.user && hit[2].roles.includes(state.user.role))) { return navigate('/login?next=' + encodeURIComponent(path + location.search), { replace: true }); }
  if (state.site.settings.maintenance_mode === '1' && state.user?.role !== 'admin' && !/^\/(login|admin)/.test(path)) { app.innerHTML = '<main style="display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><h1 class="h-lg">Back soon.</h1><p class="lede" style="margin:20px auto">' + esc(state.site.settings.maintenance_message) + '</p></div></main>'; return; }
  const authLayout = layout === 'auth';
  app.innerHTML = '';
  app.insertAdjacentHTML('beforeend', headerHtml().s);
  const main = document.createElement('main'); main.id = 'main'; main.tabIndex = -1; app.appendChild(main); ctx.main = main;
  if (layout !== 'portal' && !authLayout) app.insertAdjacentHTML('beforeend', footerHtml().s);
  setActiveHeader(layout); wireHeader(); refreshMenu();
  document.body.dataset.layout = layout;
  try {
    if (!hit) { const info = await import('./pages/info.js'); await info.notFound({ main, ...ctx, path, query }); }
    else { const mod = await hit[1](); await mod.default({ main, ...ctx, params: m.slice(1), path, query, layout }); }
  } catch (e) { console.error(e); main.innerHTML = `<div class="wrap" style="padding:200px 0;text-align:center"><h1 class="h-lg">Something broke.</h1><p class="lede" style="margin:18px auto">${esc(e.message)}</p><a class="btn btn-p" href="/" data-link>Back home</a></div>`; }
  splitWords(main); reveal(main); tilt(main); magnetic(main); wireWishes(main); playVisibleVideos(main);
  if (!location.hash) scrollTo(0, 0); else setTimeout(() => $(location.hash)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }), 80);
  document.title = document.title || 'wAIRhouse';
  current = path;
}
export const rerender = render;

function wireHeader() {
  const hdr = $('#hdr'); $('#burger')?.addEventListener('click', () => { const o = hdr.classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); });
  $('[data-dismiss-ann]')?.addEventListener('click', () => { sessionStorage.setItem('ann', '1'); $('#ann').remove(); });
  const menu = $('#umenu'); if (menu) { $('.avatar', menu).addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); }); }
  $('[data-logout]')?.addEventListener('click', logout);
}
async function logout() { try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* ignore */ } state.user = null; state.csrf = ''; state.wish = new Set(); navigate('/'); toast('Signed out'); }
function wireWishes(root) { on(root, 'click', '[data-wish]', (e, b) => { e.preventDefault(); e.stopPropagation(); toggleWish(Number(b.dataset.wish), b); }); }

// global events: client-side links, closing menus
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]'); const m = $('#umenu'); if (m && !e.target.closest('#umenu')) m.classList.remove('open');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.target === '_blank') return;
  const u = new URL(a.href, location.href); if (u.origin !== location.origin || /\.(\w{2,5})$/.test(u.pathname) || u.pathname.startsWith('/api/')) return;
  e.preventDefault(); $('#hdr')?.classList.remove('open'); history.pushState({}, '', u.pathname + u.search + u.hash); render();
});
addEventListener('popstate', render);

// cookie notice (essential cookies only, but we say so plainly)
function cookieBanner() {
  try { if (localStorage.getItem('wh_cookie')) return; } catch (_) { /* private mode */ }
  const d = document.createElement('div'); d.className = 'cookie'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookie notice');
  d.innerHTML = `<p><b style="color:var(--text)">We keep it simple.</b> We use only the essential cookies that keep you signed in and your forms safe. No ads, no cross-site tracking. <a class="link" href="/legal/cookies" data-link>Cookie policy</a></p><button class="btn btn-p btn-sm" id="ck">Got it</button>`;
  document.body.appendChild(d);
  // While the card is showing, leave room for it under the page so the last button or link can always be scrolled clear of it.
  const room = () => { document.body.style.paddingBottom = `${d.offsetHeight + 28}px`; };
  let ro = null; room(); try { ro = new ResizeObserver(room); ro.observe(d); } catch (_) { /* very old browsers: the card simply overlaps */ }
  $('#ck', d).onclick = () => { try { localStorage.setItem('wh_cookie', '1'); } catch (_) { /* ignore */ } ro?.disconnect(); document.body.style.paddingBottom = ''; d.remove(); };
}

(async function boot() {
  try {
    const [site, me] = await Promise.all([api('/site'), api('/auth/me')]);
    state.site = site; state.user = me.user; state.csrf = me.csrf || '';
    if (me.user) api('/me/wishlist').then((w) => { state.wish = new Set(w.ids); }).catch(() => {});
    const acc = site.settings.accent_color; if (/^#[0-9a-f]{6}$/i.test(acc)) document.documentElement.style.setProperty('--accent', acc);
  } catch (e) { app.innerHTML = `<main style="display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><h1 class="h-lg">We will be right back.</h1><p class="lede" style="margin:18px auto">${esc(e.message)}</p></div></main>`; return; }
  state.refreshUser = async () => { const me = await api('/auth/me'); state.user = me.user; state.csrf = me.csrf || state.csrf; };
  mountMenu(); await render(); cookieBanner();
})();
export { state };
