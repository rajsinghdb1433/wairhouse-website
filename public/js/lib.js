// Shared helpers: safe HTML templating, API client, state, toast/modal, formatters, icons, motion helpers.
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v);
// Tagged template: every interpolation is HTML-escaped unless it is already Safe (nested html``) or raw(). XSS-safe by default.
export const html = (strings, ...vals) => { let o = strings[0]; vals.forEach((v, i) => { o += val(v) + strings[i + 1]; }); return new Safe(o); };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const on = (el, ev, sel, fn) => el.addEventListener(ev, (e) => { const t = e.target.closest(sel); if (t && el.contains(t)) fn(e, t); });

// ---------- state ----------
export const state = { site: null, user: null, csrf: '', wish: new Set() };

// ---------- API ----------
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (state.csrf) opts.headers['X-CSRF-Token'] = state.csrf;
  if (form) opts.body = form; else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res; try { res = await fetch('/api' + path, opts); } catch (_) { throw Object.assign(new Error('You seem to be offline. Check your connection.'), { status: 0 }); }
  let data = {}; try { data = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, data });
  return data;
}

// ---------- formatters ----------
export const money = (c, d = 0) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: d, maximumFractionDigits: d }).format((c || 0) / 100);
export const moneyP = (c) => money(c, c % 100 ? 2 : 0);
export const date = (t) => t ? new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const unitWord = { sqm: 'm²', pallet: 'pallet', unit: 'space' };
export const perWord = { day: 'day', week: 'week', month: 'month' };
export const TYPE_LABEL = { warehouse: 'Warehouse', pallet: 'Pallet storage', 'self-storage': 'Self storage', container: 'Container', 'cold-storage': 'Cold storage', yard: 'Yard or backyard', garage: 'Garage', shed: 'Shed', 'spare-room': 'Spare room', basement: 'Basement or attic', parking: 'Car space or driveway', 'pop-up': 'Pop-up space', 'commercial-kitchen': 'Commercial kitchen', other: 'Other' };
const TYPE_IMG = { warehouse: '/img/photos/inventory', pallet: '/img/photos/pallet-boxes', 'self-storage': '/img/photos/storage-interior', container: '/img/photos/facility-dusk', 'cold-storage': '/img/photos/racks', yard: '/img/photos/garden', garage: '/img/photos/garage', shed: '/img/photos/shed', 'spare-room': '/img/photos/room-boxes', basement: '/img/photos/basement', parking: '/img/photos/truck-apartment', 'pop-up': '/img/photos/unloading', 'commercial-kitchen': '/img/photos/owner-staff', other: '/img/photos/inventory' };
export const typeImage = (t, sm = false) => `${TYPE_IMG[t] || '/img/photos/inventory'}${sm ? '-sm' : ''}.jpg`;
// Admin-managed pictures and videos. Each named slot on the site resolves to the admin's pick, or a built-in default.
export const slot = (name) => state.site?.media?.[name] || null;
export const slotImg = (name, cls = '') => { const m = slot(name); return m && m.kind === 'image' ? html`<img class="${cls}" src="${m.url}" alt="${m.alt}" loading="lazy" decoding="async">` : ''; };
// Renders a photo or a video depending on what the admin chose. Videos are muted, looping and only play while on screen (see app.js).
export const slotMedia = (name, cls = '') => { const m = slot(name); if (!m) return ''; return m.kind === 'video' ? html`<video class="${cls}" data-bg src="${m.url}" poster="${m.poster || ''}" muted loop playsinline preload="metadata" aria-label="${m.alt}"></video>` : html`<img class="${cls}" src="${m.url}" alt="${m.alt}" loading="lazy" decoding="async">`; };
export const slotUrl = (name) => { const m = slot(name); return m ? m.url : ''; };
// Typical earnings for one space, from published Australian platform and market figures (see docs/PRICING-RESEARCH.md).
export const TYPE_TILES = [
  { t: 'garage', name: 'Garage', earn: '$200 to $350', tip: 'a month', blurb: 'Lock-up garages are the most in-demand space for furniture, tools and stock.', icon: 'key' },
  { t: 'spare-room', name: 'Spare room', earn: '$150 to $250', tip: 'a month', blurb: 'An empty bedroom or study can hold boxes, bikes and a whole move.', icon: 'home' },
  { t: 'parking', name: 'Driveway or car space', earn: '$150 to $450', tip: 'a month', blurb: 'Outer-suburb driveways earn $150 to $250. Covered city spaces earn far more.', icon: 'truck' },
  { t: 'shed', name: 'Shed', earn: '$100 to $200', tip: 'a month', blurb: 'A tidy garden shed is perfect for tools, outdoor gear and market stock.', icon: 'box' },
  { t: 'basement', name: 'Basement or attic', earn: '$110 to $250', tip: 'a month', blurb: 'Cool, dry spaces suit archives, wine and seasonal things.', icon: 'layers' },
  { t: 'yard', name: 'Backyard or yard', earn: '$80 to $300', tip: 'a month', blurb: 'Room for a caravan, boat, trailer or building materials.', icon: 'pin' },
  { t: 'warehouse', name: 'Warehouse or shed bay', earn: '$12 to $25', tip: 'per m² a month', blurb: 'Business space by the square metre or pallet.', icon: 'chart' },
  { t: 'self-storage', name: 'Storage units', earn: '$80 to $350', tip: 'per unit a month', blurb: 'Rent out units, containers or cold rooms to local businesses.', icon: 'shield' },
];
export const priceLine = (l) => `${moneyP(l.price_cents)} / ${unitWord[l.unit]} / ${perWord[l.period]}`;
export const todayISO = (add = 0) => { const d = new Date(Date.now() + add * 864e5); return d.toISOString().slice(0, 10); };
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const stars = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

// Tiny, safe markdown for legal / CMS pages. Escapes first, then formats.
export function md(src) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const out = []; let list = false;
  for (const line of String(src).split('\n')) {
    const l = line.trimEnd();
    if (/^[-*] /.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(l.slice(2))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (/^### /.test(l)) out.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (list) out.push('</ul>');
  return raw(out.join(''));
}

// ---------- icons (inline SVG, 24px stroke) ----------
const P = {
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3', pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9',
  truck: 'M2 6h11v10H2zM13 10h4l4 3v3h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z', snow: 'M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3', key: 'M15 7a4 4 0 1 1-1 7.9L9 20H6v-3l5-5A4 4 0 0 1 15 7z', check: 'M5 12l5 5 9-10',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6', home: 'M3 11l9-8 9 8v10h-6v-6H9v6H3z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2', msg: 'M4 5h16v11H9l-5 4V5z', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6', users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 4.5a3.5 3.5 0 0 1 0 7M22 20c0-2.5-1.5-4.2-4-5', send: 'M22 3L2 11l7 3 3 7 10-18z', file: 'M6 3h9l5 5v13H6zM14 3v6h6M9 14h8M9 18h8', plus: 'M12 5v14M5 12h14', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 1 1 8 0v4', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z', dollar: 'M12 3v18M16 7.5c-1-1.3-2.4-2-4-2-2.2 0-4 1.2-4 3s1.5 2.4 4 3 4 1.2 4 3-1.8 3-4 3c-1.8 0-3.2-.8-4.2-2', logout: 'M10 4H4v16h6M16 8l4 4-4 4M20 12H9', menu: 'M4 7h16M4 12h16M4 17h16', ruler: 'M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5', phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
};
export const icon = (n, cls = '') => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.box}"/></svg>`);
export const FEATURE_ICON = (f) => { const s = f.toLowerCase(); return s.includes('cctv') || s.includes('alarm') || s.includes('secur') || s.includes('fence') ? 'shield' : s.includes('24') || s.includes('access') ? 'clock' : s.includes('forklift') || s.includes('truck') || s.includes('dock') || s.includes('loading') ? 'truck' : s.includes('temperature') || s.includes('cold') || s.includes('food') ? 'snow' : s.includes('power') || s.includes('backup') ? 'bolt' : s.includes('insur') ? 'shield' : s.includes('wi-fi') || s.includes('wms') ? 'globe' : s.includes('gate') || s.includes('code') ? 'key' : 'check'; };
export const logoSvg = (cls = '') => raw(`<svg class="${cls}" viewBox="0 0 96 96" fill="none" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient><linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ecff"/><stop offset="1" stop-color="#6cc2ff"/></linearGradient></defs><path d="M48 30 72 43 48 56 24 43Z" fill="url(#lg2)"/><path d="M24 43 48 56V82L24 69Z" fill="url(#lg1)"/><path d="M72 43 48 56V82L72 69Z" fill="#e24a14"/><path d="M56 20c6-1 10 2 12 6M52 14c9-2 15 2 18 8" stroke="#9adbff" stroke-width="3" stroke-linecap="round"/></svg>`);

// ---------- toast & modal ----------
export function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  document.getElementById('toasts').appendChild(t); setTimeout(() => { t.style.transition = '.4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3800);
}
export function modal(content, { onMount } = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
  bg.innerHTML = `<div class="modal">${content}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc2); };
  const esc2 = (e) => e.key === 'Escape' && close();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', esc2); document.body.appendChild(bg);
  bg.querySelector('input,textarea,select,button')?.focus();
  onMount && onMount(bg, close); return { el: bg, close };
}
export const confirmBox = (title, text, yes = 'Confirm') => new Promise((res) => {
  const m = modal(`<h2>${esc(title)}</h2><p class="muted" style="margin-bottom:22px">${esc(text)}</p><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-g" data-close>Cancel</button><button class="btn btn-p" id="cy">${esc(yes)}</button></div>`);
  m.el.querySelector('#cy').onclick = () => { m.close(); res(true); }; m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.closest('[data-close]')) res(false); });
});

// ---------- captcha widget ----------
export async function captchaHtml(id = 'cap') {
  let c; try { c = await api('/auth/captcha'); } catch (_) { return raw(''); }
  if (c.mode === 'turnstile') return raw(`<div class="cf-turnstile" data-sitekey="${esc(c.siteKey)}" id="${id}"></div>`);
  return raw(`<div class="captcha" id="${id}" data-token="${esc(c.token)}"><div class="svg">${c.svg}</div><input name="captcha_answer" autocomplete="off" inputmode="text" maxlength="8" placeholder="Type the letters" aria-label="Type the letters you see" required><button type="button" data-refresh aria-label="New code">↻</button></div>`);
}
export function captchaMount(root) {
  const box = root.querySelector('.captcha'); if (!box) { const t = root.querySelector('.cf-turnstile'); if (t && !window.turnstile) { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; document.head.appendChild(s); } return; }
  box.querySelector('[data-refresh]').onclick = async () => { const c = await api('/auth/captcha'); box.dataset.token = c.token; box.querySelector('.svg').innerHTML = c.svg; box.querySelector('input').value = ''; };
}
export const captchaValues = (root) => { const b = root.querySelector('.captcha'); if (b) return { captcha_token: b.dataset.token, captcha_answer: b.querySelector('input').value }; const t = root.querySelector('[name="cf-turnstile-response"]'); return t ? { captcha_token: t.value } : {}; };
export async function captchaRefresh(root) { root.querySelector('[data-refresh]')?.click(); window.turnstile?.reset(); }

// ---------- form helper ----------
export const formData = (form) => Object.fromEntries(new FormData(form).entries());
export async function submitForm(form, fn, { btn } = {}) {
  const b = btn || form.querySelector('[type=submit]'); const errBox = form.querySelector('.err-slot');
  const old = b?.textContent; if (b) { b.disabled = true; b.textContent = 'One moment…'; } if (errBox) errBox.innerHTML = '';
  try { return await fn(); } catch (e) {
    if (errBox) errBox.innerHTML = `<div class="err" role="alert">${esc(e.message)}</div>`; else toast(e.message, 'bad');
    if (e.data?.captcha) captchaRefresh(form); return null;
  } finally { if (b) { b.disabled = false; b.textContent = old; } }
}

// ---------- motion helpers ----------
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let io;
export function reveal(root = document) {
  const els = $$('.rv,.split', root);
  if (reduceMotion() || !('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  io = io || new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e) => io.observe(e));
}
// Wrap each word of an element's text in masked spans so headlines rise word by word.
export function splitWords(root = document) {
  $$('[data-split]', root).forEach((el) => {
    if (el.dataset.done) return; el.dataset.done = 1; el.classList.add('split');
    let i = 0; const walk = (n) => [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach((w) => { if (!w) return; if (/^\s+$/.test(w)) f.appendChild(document.createTextNode(' ')); else { const s = document.createElement('span'); s.className = 'w'; const si = document.createElement('span'); si.style.setProperty('--i', i++); si.textContent = w; s.appendChild(si); f.appendChild(s); } }); c.replaceWith(f); } else if (c.nodeType === 1) walk(c);
    }); walk(el);
  });
}
export function countUp(el, to, { dur = 1600, fmt = (n) => Math.round(n).toLocaleString('en-AU') } = {}) {
  if (reduceMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}
// 3D tilt + glare on cards
export function tilt(root = document, sel = '.lc') {
  if (matchMedia('(hover:none)').matches || reduceMotion()) return;
  $$(sel, root).forEach((c) => {
    c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; c.style.transform = `perspective(900px) rotateY(${(x - .5) * 9}deg) rotateX(${(.5 - y) * 9}deg) translateZ(0)`; c.style.setProperty('--gx', x * 100 + '%'); c.style.setProperty('--gy', y * 100 + '%'); });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  });
}
export const magnetic = (root = document) => { if (matchMedia('(hover:none)').matches || reduceMotion()) return; $$('.btn-p.btn-lg,[data-mag]', root).forEach((b) => { b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .28}px)`; }); b.addEventListener('pointerleave', () => { b.style.transform = ''; }); }); };

// ---------- listing card ----------
export function listingCard(l, { demo = true } = {}) {
  const img = l.images[0] || typeImage(l.type, true); const on = state.wish.has(l.id);
  return html`<a class="lc rv" href="/space/${l.slug}" data-link data-id="${l.id}">
    <div class="im"><img src="${img}" alt="${l.title}" loading="lazy" decoding="async"><span class="glare"></span>
      <div class="tags">${l.featured ? html`<span class="tag">★ Featured</span>` : ''}${l.instant_book ? html`<span class="tag" style="background:rgba(255,107,44,.85)">⚡ Instant</span>` : ''}</div>
      <button class="heart ${on ? 'on' : ''}" data-wish="${l.id}" aria-label="Save to wishlist">${icon('heart')}</button></div>
    <div class="meta"><div class="t"><span>${l.title}</span><span>${l.rating_count ? html`<span class="stars">★</span> ${l.rating_avg}` : html`<span class="muted">New</span>`}</span></div>
      <div class="s">${TYPE_LABEL[l.type] || l.type} · ${l.suburb}, ${l.state}</div>
      <div class="pr"><b>${moneyP(l.price_cents)}</b> <span class="muted">/ ${unitWord[l.unit]} / ${perWord[l.period]}</span></div></div></a>`;
}
export async function toggleWish(id, btn) {
  if (!state.user) { location.href = '/login?next=' + encodeURIComponent(location.pathname); return; }
  const on = state.wish.has(id);
  try { await api(`/me/wishlist/${id}`, { method: on ? 'DELETE' : 'POST' }); on ? state.wish.delete(id) : state.wish.add(id); btn.classList.toggle('on', !on); toast(on ? 'Removed from wishlist' : 'Saved to your wishlist'); } catch (e) { toast(e.message, 'bad'); }
}
export const setTitle = (t) => { document.title = t ? `${t} | ${state.site?.settings.brand_name || 'wAIRhouse'}` : (state.site?.settings.brand_name || 'wAIRhouse'); };
// Lazy-load Leaflet (maps) only on pages that need it.
let leafletP;
export function loadLeaflet() { return leafletP ||= new Promise((res, rej) => { if (window.L) return res(window.L); const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s); }); }
