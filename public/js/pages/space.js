import { html, raw, $, $$, api, state, icon, FEATURE_ICON, listingCard, setTitle, loadLeaflet, moneyP, money, TYPE_LABEL, unitWord, perWord, todayISO, stars, date, modal, toast, esc, debounce, tilt, formData, submitForm, captchaHtml, captchaMount, captchaValues } from '../lib.js';
import { spaceViz } from '../scenes.js';
import { navigate } from '../app.js';
import { typeImage } from '../lib.js';
const HOME_TYPES = ['garage', 'shed', 'spare-room', 'basement', 'parking', 'yard'];

export default async function space({ main, params, onLeave }) {
  let data; try { data = await api('/listings/' + params[0]); } catch (e) {
    main.innerHTML = html`<div class="wrap" style="padding:200px 0;text-align:center"><h1 class="h-lg">That space is gone.</h1><p class="lede" style="margin:18px auto 30px">${e.message}</p><a class="btn btn-p" href="/search" data-link>Find another</a></div>`.s; return;
  }
  const { listing: l, owner, reviews, similar } = data; setTitle(`${l.title}, ${l.suburb} ${l.state}`);
  const imgs = l.images.length ? l.images : ['/img/spaces/racking.jpg']; const wished = state.wish.has(l.id);
  const startDefault = todayISO(Math.max(3, 0)); const endDefault = todayISO(3 + Math.max(l.min_days, 30));
  const demo = l.is_demo;
  main.innerHTML = html`
  <div class="wrap" style="padding-top:calc(var(--hdr) + 34px)">
    <div style="display:flex;justify-content:space-between;gap:20px;align-items:end;flex-wrap:wrap;margin-bottom:26px">
      <div><div class="chips" style="margin-bottom:14px"><span class="badge acc">${TYPE_LABEL[l.type] || l.type}</span>${l.instant_book ? html`<span class="badge warn">⚡ Instant book</span>` : ''}${l.insurance_included ? html`<span class="badge ok">Insurance included</span>` : ''}${demo ? html`<span class="badge">Sample listing</span>` : ''}</div>
        <h1 class="h-lg" style="font-size:clamp(34px,5vw,64px)">${l.title}</h1>
        <p class="muted" style="margin-top:10px;font-size:18px">${l.suburb}, ${l.state} ${l.postcode} · ${l.rating_count ? html`<span class="stars">★</span> <b style="color:#fff">${l.rating_avg}</b> (${l.rating_count} review${l.rating_count > 1 ? 's' : ''})` : 'New on wAIRhouse'}</p></div>
      <div style="display:flex;gap:10px"><button class="btn btn-g btn-sm" id="share">Share</button><button class="btn btn-g btn-sm" id="wish">${icon('heart')} <span>${wished ? 'Saved' : 'Save'}</span></button></div></div>
    <div class="gallery rv">${imgs.slice(0, 3).map((u, i) => html`<img src="${u}" alt="${l.title} photo ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`)}${imgs.length < 2 ? html`<img src="${typeImage(l.type)}" alt="${TYPE_LABEL[l.type] || 'Space'} (illustration)" loading="lazy"><img src="${typeImage(l.type === 'warehouse' ? 'pallet' : l.type)}" alt="${TYPE_LABEL[l.type] || 'Space'} (illustration)" loading="lazy">` : ''}</div>
    <div class="detail"><div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:26px;border-bottom:1px solid var(--line)"><div><h2 class="h-md" style="font-size:26px">Hosted by ${owner.name}</h2><p class="muted">${owner.company ? owner.company + ' · ' : ''}On wAIRhouse since ${owner.since}</p></div><div class="avatar" style="width:56px;height:56px;font-size:22px">${owner.name[0]}</div></div>
      <div class="grid g3" style="margin:28px 0;gap:14px">${[[l.total_sqm ? Math.round(l.total_sqm).toLocaleString('en-AU') + ' m²' : '—', 'Total area'], [l.height_m ? l.height_m + ' m' : '—', 'Clearance'], [l.min_days + (l.min_days > 1 ? ' days' : ' day'), 'Minimum stay']].map(([a, b]) => html`<div class="card" style="padding:20px"><div class="bignum" style="font-size:34px">${a}</div><p style="font-size:14px">${b}</p></div>`)}</div>
      ${HOME_TYPES.includes(l.type) ? html`<div class="card" style="margin-bottom:26px;padding:20px 24px;display:flex;gap:16px;align-items:center"><div class="ico" style="margin:0;flex:none">${icon('home')}</div><p style="font-size:15px">This is a local host's own space. Their exact address is shared once they accept your booking, and the rental terms ban overnight stays and dangerous goods.</p></div>` : ''}
      <p style="font-size:18px;color:#c9d5ec;white-space:pre-line">${l.description}</p>
      <h2 class="h-md" style="margin:46px 0 22px;font-size:28px">What this place offers</h2>
      <div class="feat">${l.features.map((f) => html`<div>${icon(FEATURE_ICON(f))}${f}</div>`)}${l.access_hours ? html`<div>${icon('clock')}Access: ${l.access_hours}</div>` : ''}</div>
      <div ${l.type === 'parking' ? 'hidden' : ''}><h2 class="h-md" style="margin:56px 0 12px;font-size:28px">Will it fit? Try the 3D planner</h2><p class="muted" style="margin-bottom:18px">Slide to see how much of this space your goods would take. Drag the room to look around.</p>
      <div class="viz"><canvas id="vz" role="img" aria-label="3D space planner"></canvas><span class="mono lbl">3D space planner</span><div class="ctl"><span class="muted" style="font-weight:700;min-width:110px" id="vl">40% of space</span><input type="range" id="vr" min="5" max="100" value="40" aria-label="How full"></div></div></div>
      <h2 class="h-md" style="margin:56px 0 22px;font-size:28px">Where you will be</h2>
      <div id="dmap" style="height:320px;border-radius:22px;overflow:hidden;border:1px solid var(--line)"></div><p class="muted" style="margin-top:12px;font-size:14px">The exact address is shared once your booking is confirmed.</p>
      <h2 class="h-md" style="margin:56px 0 10px;font-size:28px">${reviews.length ? `${l.rating_avg} ★ · ${l.rating_count} review${l.rating_count > 1 ? 's' : ''}` : 'Reviews'}</h2>
      ${reviews.length ? reviews.map((r) => html`<div class="rev"><b>${r.name}</b> <span class="stars">${stars(r.rating)}</span> <span class="muted" style="font-size:13px">${date(r.created_at)}</span><p style="margin-top:6px;color:#c9d5ec">${r.body}</p></div>`) : html`<p class="muted">No reviews yet. Reviews come only from customers with a real booking.</p>`}
    </div>
    <aside class="book" id="book"><div class="price">${moneyP(l.price_cents)} <small>/ ${unitWord[l.unit]} / ${perWord[l.period]}</small></div>
      <form id="bf" style="margin-top:20px"><div class="row"><div class="field"><label for="sd">Start</label><input type="date" id="sd" name="start_date" min="${todayISO()}" value="${startDefault}" required></div><div class="field"><label for="ed">End</label><input type="date" id="ed" name="end_date" min="${todayISO(1)}" value="${endDefault}" required></div></div>
        <div class="field"><label for="qty">How many ${l.unit === 'sqm' ? 'square metres' : l.unit === 'unit' ? 'spaces' : l.unit + 's'}? <span class="muted">(up to ${l.capacity.toLocaleString('en-AU')})</span></label><input type="number" id="qty" name="quantity" min="1" max="${l.capacity}" value="${Math.min(l.capacity, l.unit === 'pallet' ? 4 : l.unit === 'unit' ? 1 : 20)}" required></div>
        <div class="field"><label for="gd">What are you storing?</label><input id="gd" name="goods" maxlength="300" placeholder="e.g. 4 pallets of packaged tea" required></div>
        <div class="field"><label for="mg">Message to owner <span class="muted">(optional)</span></label><textarea id="mg" name="message" style="min-height:80px" maxlength="1000"></textarea></div>
        <div id="qt" aria-live="polite"></div>
        <label class="check"><input type="checkbox" name="accept_terms" required><span>I agree to the <a class="link" href="/legal/rental-terms" target="_blank">Storage Rental Terms</a>, <a class="link" href="/legal/acceptable-use" target="_blank">Prohibited Goods policy</a> and <a class="link" href="/legal/cancellation" target="_blank">Cancellation policy</a>.</span></label>
        <div class="err-slot"></div>
        <button class="btn btn-p btn-lg btn-block" type="submit">${l.instant_book ? 'Book now' : 'Request to book'}</button>
        <p class="muted center" style="font-size:14px;margin-top:12px">${l.instant_book ? 'Instant confirmation.' : 'You are not charged until the owner accepts.'}</p></form>
      <button class="btn btn-g btn-block" style="margin-top:14px" id="ask">Message the owner</button></aside></div>
    ${similar.length ? html`<h2 class="h-md" style="margin:90px 0 26px">More like this</h2><div class="grid g4" style="padding-bottom:90px">${similar.map((s) => listingCard(s))}</div>` : html`<div style="height:90px"></div>`}
  </div>`.s;

  // 3D planner
  if (l.type !== 'parking') try { const viz = spaceViz($('#vz'), { sqm: l.total_sqm || l.capacity, height: l.height_m || 5, fill: 0.4 }); onLeave(() => viz.dispose()); $('#vr').addEventListener('input', (e) => { viz.setFill(e.target.value / 100); $('#vl').textContent = e.target.value + '% of space'; }); } catch (_) { $('.viz').style.display = 'none'; }
  // map
  loadLeaflet().then((L) => { if (l.lat == null) return $('#dmap').remove(); const m = L.map('dmap', { scrollWheelZoom: false }).setView([l.lat, l.lng], 12); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m); L.circle([l.lat, l.lng], { radius: 1200, color: '#ff6b2c', fillColor: '#ff6b2c', fillOpacity: 0.18, weight: 2 }).addTo(m); onLeave(() => m.remove()); }).catch(() => $('#dmap')?.remove());

  // live quote
  const bf = $('#bf'); const showQ = async () => {
    const d = formData(bf); if (!d.start_date || !d.end_date) return;
    try { const { quote: q } = await api('/quote', { method: 'POST', body: { listing_id: l.id, ...d, quantity: +d.quantity } });
      $('#qt').innerHTML = html`<div class="qline"><span>${moneyP(q.unit_price_cents)} × ${q.quantity} × ${q.periods} ${perWord[l.period]}${q.periods > 1 ? 's' : ''}</span><span>${money(q.subtotal_cents, 2)}</span></div><div class="qline"><span>Service fee (${q.fee_pct}%)</span><span>${money(q.service_fee_cents, 2)}</span></div><div class="qline tot"><span>Total</span><span>${money(q.total_cents, 2)}</span></div>${q.available < q.quantity ? html`<div class="err" style="margin-top:12px">Only ${q.available} available for these dates.</div>` : ''}`.s;
    } catch (e) { $('#qt').innerHTML = `<div class="muted" style="margin-bottom:12px">${esc(e.message)}</div>`; }
  };
  const dq = debounce(showQ, 250); bf.addEventListener('input', dq); showQ();
  bf.addEventListener('submit', (e) => { e.preventDefault(); if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname));
    submitForm(bf, async () => { const d = formData(bf); const r = await api('/me/bookings', { method: 'POST', body: { listing_id: l.id, ...d, quantity: +d.quantity, accept_terms: !!d.accept_terms } }); toast(l.instant_book ? 'Booked! Check your email.' : 'Request sent to the owner.', 'ok'); navigate('/account/bookings'); }); });
  $('#wish').addEventListener('click', async (e) => { if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname)); const on = state.wish.has(l.id); await api(`/me/wishlist/${l.id}`, { method: on ? 'DELETE' : 'POST' }); on ? state.wish.delete(l.id) : state.wish.add(l.id); $('#wish span').textContent = on ? 'Save' : 'Saved'; toast(on ? 'Removed' : 'Saved to wishlist'); });
  $('#share').addEventListener('click', async () => { try { if (navigator.share) await navigator.share({ title: l.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Link copied'); } } catch (_) { /* cancelled */ } });
  $('#ask').addEventListener('click', () => {
    if (!state.user) return navigate('/login?next=' + encodeURIComponent(location.pathname));
    const m = modal(`<h2>Message ${esc(owner.name)}</h2><p class="muted" style="margin-bottom:16px">About ${esc(l.title)}</p><form id="mf"><div class="field"><textarea name="body" maxlength="2000" required placeholder="Hi, is the space available from…?"></textarea></div><div class="err-slot"></div><button class="btn btn-p btn-block" type="submit">Send message</button></form>`);
    $('#mf', m.el).addEventListener('submit', (e) => { e.preventDefault(); submitForm(e.target, async () => { await api('/me/messages', { method: 'POST', body: { listing_id: l.id, body: formData(e.target).body } }); m.close(); toast('Message sent. You will get a reply by email.', 'ok'); }); });
  });
  tilt(main);
}
