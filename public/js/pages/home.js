import { html, raw, $, $$, api, state, icon, listingCard, countUp, setTitle, reduceMotion, esc, money } from '../lib.js';
import { heroScene, spaceViz, boxesScene } from '../scenes.js';

// caption beats over the scroll journey: [start, end, side, title, text, cta]
const BEATS = [
  [0.0, 0.13, 'c', null],
  [0.17, 0.33, 'l', 'Space is everywhere.', 'Empty racking. Spare sheds. Quiet corners. Most of it sits unused.'],
  [0.37, 0.54, 'r', 'Verified. Insured. Yours.', 'Book by the pallet, the square metre or the unit. Real owners, real addresses.'],
  [0.58, 0.72, 'l', 'In minutes. Not months.', 'Pick your dates, send a request, get access. Leave whenever you like.'],
  [0.76, 0.88, 'c', 'Got space nobody uses?', 'List it free and earn from the first booking.', 'host'],
  [0.92, 1.01, 'c', 'wAIRhouse.', 'Space, on demand.', 'search'],
];
const SIZES = [
  { t: 'A shelf of stock', p: 'Parcels, samples and the odd box. A few square metres is plenty.', sqm: 6, fill: 0.5, label: '6 m²', q: 'self-storage' },
  { t: 'A garage-size unit', p: 'Tools, event gear or a small shop\'s stock. Roller door, bright and dry.', sqm: 20, fill: 0.62, label: '20 m²', q: 'self-storage' },
  { t: 'A bay of pallets', p: 'Racked pallet positions with forklift handling. Pay only for the positions you use.', sqm: 120, fill: 0.7, label: '120 m²', q: 'pallet' },
  { t: 'A whole warehouse', p: 'Dock doors, high clearance, room to grow. Book the whole floor.', sqm: 900, fill: 0.85, label: '900 m²', q: 'warehouse' },
];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export default async function home({ main, onLeave }) {
  setTitle('');
  const s = state.site.settings; const st = state.site.stats; const founding = state.site.founding;
  const [featured, faqs] = await Promise.all([api('/listings?limit=6&sort=rating').catch(() => ({ listings: [] })), api('/faqs?audience=customer').catch(() => ({ faqs: [] }))]);
  const heroTitle = s.hero_title.split('\n');
  main.innerHTML = html`
  <section class="hero3d" id="hero"><div class="stage">
    <canvas id="hc" aria-hidden="true"></canvas><div class="vig"></div>
    ${BEATS.map((b, i) => i === 0 ? html`<div class="cap c first" data-beat="0"><div class="wrap">
        <span class="mono eyebrow">${s.hero_eyebrow}</span>
        <h1>${heroTitle.map((l, j) => html`${j ? raw('<br>') : ''}${j === heroTitle.length - 1 ? html`<span class="grad">${l}</span>` : l}`)}</h1>
        <p style="margin-inline:auto">${s.hero_subtitle}</p>
        <form class="hero-search" id="hs" role="search"><input name="q" placeholder="Where do you need space? Suburb, city or postcode" aria-label="Search location" autocomplete="off"><button class="btn btn-p" type="submit">Search ${icon('search')}</button></form></div></div>`
      : html`<div class="cap ${b[2]}" data-beat="${i}"><div class="wrap"><h2>${b[3]}</h2><p>${b[4]}</p>${b[5] ? html`<div class="cap-cta">${b[5] === 'host' ? html`<a class="btn btn-p btn-lg" href="/host" data-link>List your space</a><a class="btn btn-g btn-lg" href="/host#earn" data-link>See what you could earn</a>` : html`<a class="btn btn-p btn-lg" href="/search" data-link>Find space now</a><a class="btn btn-g btn-lg" href="/how-it-works" data-link>How it works</a>`}</div>` : ''}</div></div>`)}
    <div class="progress" aria-hidden="true">${BEATS.map((_, i) => html`<i data-dot="${i}"></i>`)}</div>
    <div class="scrollcue" id="cue"><span class="mono">Scroll</span><i></i></div>
    <div class="static-hero"><div class="wrap"><span class="mono eyebrow">${s.hero_eyebrow}</span><h1>${heroTitle.map((l, j) => html`${j ? raw('<br>') : ''}${j === heroTitle.length - 1 ? html`<span class="grad">${l}</span>` : l}`)}</h1><p class="lede" style="margin:20px 0 28px">${s.hero_subtitle}</p><a class="btn btn-p btn-lg btn-block" href="/search" data-link>Find space</a><a class="btn btn-g btn-lg btn-block" style="margin-top:12px" href="/host" data-link>List your space</a></div></div>
  </div></section>

  <div class="marquee" aria-hidden="true"><div class="track">${[0, 1].map(() => html`${['Pallet racking', 'Self storage', 'Cold rooms', 'Container yards', 'Pop-up space', 'Garages', 'Dock-high warehouses', 'Commercial kitchens'].map((x) => html`<span>${x}</span>`)}`)}</div></div>

  <section class="sec light"><div class="wrap">
    <span class="mono eyebrow rv">The idea</span>
    <h2 class="h-lg" data-split style="max-width:18ch">Space is the one thing everyone has too much of, or too little.</h2>
    <p class="lede rv" style="margin-top:28px">Owners have empty racking and sheds. Businesses cannot find a few pallets of space without a long contract. wAIRhouse connects them in minutes, like booking a stay, but for stuff.</p>
    <div class="grid g3" style="margin-top:70px">
      <div class="card rv" style="--d:0"><div class="bignum"><span data-count="${Math.max(st.spaces, 1)}">0</span>+</div><p>Spaces ready to book</p></div>
      <div class="card rv" style="--d:1"><div class="bignum"><span data-count="${Math.max(st.sqm, 1)}">0</span></div><p>Square metres of room</p></div>
      <div class="card rv" style="--d:2"><div class="bignum"><span data-count="${Math.max(st.cities, 1)}">0</span>+</div><p>Suburbs across Australia</p></div>
    </div></div></section>

  <section class="sec"><div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap;margin-bottom:46px"><div><span class="mono eyebrow rv">Featured spaces</span><h2 class="h-lg" data-split>Ready when you are.</h2></div><a class="btn btn-g rv" href="/search" data-link>Browse everything →</a></div>
    <div class="grid g3">${featured.listings.length ? featured.listings.map((l) => listingCard(l)) : html`<div class="empty" style="grid-column:1/-1"><h3>Spaces are on their way.</h3><p>Be the first to list yours.</p></div>`}</div></div></section>

  <section class="sticky-sec" id="sizes"><div class="pin-in"><div class="wrap sz-wrap">
    <div><span class="mono eyebrow">Find your size</span><h2 class="h-lg" style="margin-bottom:30px">From a shelf<br>to a warehouse.</h2>
      <div class="sz-steps">${SIZES.map((z, i) => html`<div class="sz ${i ? '' : 'on'}" data-sz="${i}"><h3>${z.t} <span class="mono" style="margin-left:10px">${z.label}</span></h3><p>${z.p} <a class="link" href="/search?type=${z.q}" data-link>Browse →</a></p></div>`)}</div></div>
    <div class="vizbig"><canvas id="szc" aria-label="3D preview of a room filling with boxes" role="img"></canvas><span class="mono" style="position:absolute;left:20px;top:18px">Drag to rotate</span></div>
  </div></div></section>

  <section class="sec light"><div class="wrap">
    <span class="mono eyebrow rv">How it works</span><h2 class="h-lg" data-split style="max-width:14ch;margin-bottom:60px">Three taps to space.</h2>
    <div class="steps" style="max-width:820px">
      <div class="step rv"><div><h3 class="h-md">Search and compare</h3><p class="lede" style="margin-top:8px">Filter by type, price and suburb. See every space on the map and walk through it in 3D before you book.</p></div></div>
      <div class="step rv"><div><h3 class="h-md">Request your dates</h3><p class="lede" style="margin-top:8px">Choose how much you need and for how long. You see the full price up front. You are not charged until the owner accepts.</p></div></div>
      <div class="step rv"><div><h3 class="h-md">Move in. Move out.</h3><p class="lede" style="margin-top:8px">Get access details, store your goods, and extend or leave when you like. No lock-in contracts.</p></div></div>
    </div></div></section>

  <section class="sec"><div class="wrap">
    <div class="vid rv"><video id="fv" src="/video/flythrough.mp4" poster="/video/flythrough-poster.jpg" muted loop playsinline preload="none" aria-label="3D fly-through of a warehouse"></video>
      <div class="over"><div style="max-width:520px"><span class="mono eyebrow">See before you store</span><h2 class="h-lg">Walk the aisles from your couch.</h2><p class="lede" style="margin-top:18px">Every listing has real photos, exact dimensions and an interactive 3D space planner, so you know it fits before you book.</p></div></div></div>
    <div class="grid g3" style="margin-top:46px">${[['shield', 'Verified owners', 'Every owner is checked and every listing is reviewed by our team before it goes live.'], ['clock', 'Flexible terms', 'From one day to two years. Extend or leave with simple notice, never a lock-in.'], ['dollar', 'Clear prices', 'The full price shows before you request. No deposits hidden in the fine print.'], ['truck', 'Built for goods', 'Forklifts, dock doors, racking, cold rooms and 24/7 access, filtered the way you work.'], ['key', 'Insurance options', 'Many spaces include insurance. Every owner carries public liability cover.'], ['msg', 'Real people', 'Message owners directly, and call our team any time for help.']].map(([i, t, p], k) => html`<div class="card hov rv" style="--d:${k % 3}"><div class="ico">${icon(i)}</div><h3>${t}</h3><p>${p}</p></div>`)}</div></div></section>

  <section class="sec light"><div class="wrap">
    <span class="mono eyebrow rv">Why wAIRhouse</span><h2 class="h-lg" data-split style="margin-bottom:50px;max-width:16ch">Storage, but not the old way.</h2>
    <div style="overflow-x:auto" class="rv"><table class="compare"><thead><tr><th></th><th>Traditional storage</th><th class="us">wAIRhouse</th></tr></thead><tbody>
      <tr><td>Minimum term</td><td>3 to 12 months</td><td class="us">From 1 day</td></tr><tr><td>Deposit and set-up fees</td><td>Common</td><td class="us">None</td></tr>
      <tr><td>Pay for what you use</td><td>Fixed unit sizes</td><td class="us">By pallet, m² or unit</td></tr><tr><td>See it before you book</td><td>Phone calls and site visits</td><td class="us">Photos, map and 3D planner</td></tr>
      <tr><td>Comparing prices</td><td>Quote by quote</td><td class="us">Side by side, instantly</td></tr><tr><td>Scale up or down</td><td>Renegotiate</td><td class="us">Change in a tap</td></tr></tbody></table></div></div></section>

  <section class="sec" id="earn-home"><div class="wrap"><div class="grid g2" style="align-items:center;gap:60px">
    <div><span class="mono eyebrow rv">For owners</span><h2 class="h-lg" data-split>Empty space is lost money.</h2><p class="lede rv" style="margin:22px 0 30px">List your spare racking, bays, units or yard for free. You set the price and the rules. We bring the customers and handle the booking.</p>
      <p class="rv" style="margin-bottom:30px"><span class="badge acc" style="font-size:14px;padding:8px 16px">⚡ First ${founding.slots} owners: ${s.founding_owner_commission_pct}% commission for ${s.founding_owner_months} months · ${Math.max(0, founding.slots - founding.taken)} spots left</span></p>
      <a class="btn btn-p btn-lg rv" href="/host" data-link>Start earning</a></div>
    <div class="calc rv"><label class="mono">Your space</label><div style="display:flex;justify-content:space-between;margin:14px 0 6px"><b id="cs-l">200 m²</b><span class="muted">idle space</span></div><input type="range" id="cs" min="10" max="2000" step="10" value="200" style="width:100%" aria-label="Square metres">
      <label class="mono" style="display:block;margin-top:26px">Typical price</label><div style="display:flex;justify-content:space-between;margin:14px 0 6px"><b id="cp-l">$16 / m² / month</b></div><input type="range" id="cp" min="6" max="45" step="1" value="16" style="width:100%" aria-label="Price per square metre per month">
      <div class="muted" style="margin-top:28px">You could earn about</div><div class="out" id="co">$0</div><div class="muted" style="margin-top:8px">per month at 70% occupancy, after fees</div></div></div></div></section>

  <section class="sec light"><div class="wrap" style="max-width:900px"><span class="mono eyebrow rv">Questions</span><h2 class="h-lg" data-split style="margin-bottom:40px">Good to know.</h2>
    <div class="acc rv">${faqs.faqs.slice(0, 6).map((f) => html`<details><summary>${f.question}</summary><p>${f.answer}</p></details>`)}</div><p style="margin-top:30px"><a class="link" href="/faq" data-link>See all questions →</a></p></div></section>

  <section class="sec" style="padding-top:0"><div class="wrap"><div class="cta-band"><canvas id="cb" aria-hidden="true"></canvas><span class="mono eyebrow">Ready?</span><h2 class="h-xl" style="max-width:12ch">Find your space.</h2>
    <div style="display:flex;gap:14px;margin-top:36px;flex-wrap:wrap"><a class="btn btn-p btn-lg" href="/search" data-link>Search spaces</a><a class="btn btn-g btn-lg" href="/host" data-link>List yours</a></div></div></div></section>`.s;

  // ---- 3D hero: scroll drives the camera ----
  const hero = $('#hero'), stage = $('.stage', hero); const caps = $$('[data-beat]', hero); const dots = $$('[data-dot]', hero);
  const motion = !reduceMotion() && matchMedia('(min-width:761px)').matches;
  let scene = null; if (motion) { try { scene = heroScene($('#hc')); onLeave(() => scene.dispose()); } catch (e) { console.warn('3D unavailable', e); } }
  if (!scene) { stage.style.background = "url('/img/spaces/hero.jpg') center/cover"; $('#hc').remove(); }
  const onScroll = () => {
    const r = hero.getBoundingClientRect(); const span = hero.offsetHeight - innerHeight; const p = motion ? clamp(-r.top / span) : 0;
    scene?.setProgress(p); $('#cue').style.opacity = p < 0.03 ? 1 : 0;
    if (!motion) return;
    caps.forEach((c, i) => { const [a, b] = BEATS[i]; const ramp = 0.035; const o = clamp((p - a) / ramp) * clamp((b - p) / ramp) * (i === 0 ? 1 : 1); const o2 = i === 0 ? clamp((b - p) / ramp) : o; c.style.opacity = o2; c.style.transform = `translateY(calc(-50% + ${(1 - o2) * (p < a ? 40 : -40)}px))`; c.style.pointerEvents = o2 > 0.6 ? 'auto' : 'none'; });
    const idx = BEATS.findIndex(([a, b]) => p >= a && p < b); dots.forEach((d, i) => d.classList.toggle('on', i === idx));
  };
  addEventListener('scroll', onScroll, { passive: true }); onLeave(() => removeEventListener('scroll', onScroll)); onScroll();
  $('#hs').addEventListener('submit', (e) => { e.preventDefault(); const q = new FormData(e.target).get('q'); location.href = '/search' + (q ? '?q=' + encodeURIComponent(q) : ''); });
  if (!motion) caps.forEach((c) => c.remove());

  // ---- counters ----
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { $$('[data-count]', e.target).forEach((n) => countUp(n, Number(n.dataset.count))); io.unobserve(e.target); } }), { threshold: 0.4 });
  $$('.grid.g3', main).slice(0, 1).forEach((g) => io.observe(g)); onLeave(() => io.disconnect());

  // ---- sticky size picker ----
  let viz = null; try { viz = spaceViz($('#szc'), { sqm: SIZES[0].sqm, height: 6, fill: SIZES[0].fill }); onLeave(() => viz.dispose()); } catch (e) { $('.vizbig').style.display = 'none'; }
  const sec = $('#sizes'); const szEls = $$('.sz', sec); let cur = -1;
  const setSz = (i) => { if (i === cur) return; cur = i; szEls.forEach((e, k) => e.classList.toggle('on', k === i)); viz?.setDims(SIZES[i].sqm, i > 1 ? 8 : 4); viz?.setFill(SIZES[i].fill); };
  const szScroll = () => { if (matchMedia('(max-width:900px)').matches) return; const r = sec.getBoundingClientRect(); const p = clamp(-r.top / (sec.offsetHeight - innerHeight)); setSz(Math.min(SIZES.length - 1, Math.floor(p * SIZES.length))); };
  addEventListener('scroll', szScroll, { passive: true }); onLeave(() => removeEventListener('scroll', szScroll)); setSz(0);
  szEls.forEach((e, i) => e.addEventListener('click', () => setSz(i)));

  // ---- video: play only when visible ----
  const v = $('#fv'); if (v && !reduceMotion()) { const vio = new IntersectionObserver(([e]) => { if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause(); }, { threshold: 0.35 }); vio.observe(v); onLeave(() => vio.disconnect()); }

  // ---- earnings calculator ----
  const calc = () => { const sq = +$('#cs').value, pr = +$('#cp').value; $('#cs-l').textContent = sq.toLocaleString('en-AU') + ' m²'; $('#cp-l').textContent = `$${pr} / m² / month`; const gross = sq * pr * 0.7; const net = gross * (1 - 0.08); $('#co').textContent = money(Math.round(net * 100)); };
  $('#cs').addEventListener('input', calc); $('#cp').addEventListener('input', calc); calc();

  // ---- CTA backdrop ----
  try { const b = boxesScene($('#cb')); onLeave(() => b.dispose()); } catch (_) { $('#cb')?.remove(); }
}
