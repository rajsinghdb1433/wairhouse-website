import { html, raw, $, $$, api, state, listingCard, debounce, setTitle, loadLeaflet, moneyP, TYPE_LABEL, esc, tilt } from '../lib.js';

const TYPES = [['', 'All'], ['garage', 'Garages'], ['spare-room', 'Spare rooms'], ['parking', 'Parking'], ['shed', 'Sheds'], ['basement', 'Basements'], ['yard', 'Yards'], ['warehouse', 'Warehouses'], ['pallet', 'Pallets'], ['self-storage', 'Self storage'], ['cold-storage', 'Cold'], ['container', 'Containers'], ['pop-up', 'Pop-up']];

export default async function search({ main, query, onLeave, navigate }) {
  setTitle('Find warehouse and storage space');
  const f = { q: query.q || '', type: query.type || '', state: query.state || '', sort: query.sort || '', max: query.max || '', instant: query.instant || '' };
  main.innerHTML = html`
  <div class="search-top" style="margin-top:var(--hdr)"><div class="wrap"><div class="sbar">
    <input class="inp" id="q" type="search" placeholder="Suburb, city or postcode" value="${f.q}" aria-label="Search">
    <div class="chips scroll" id="types" style="max-width:100%;flex:1 1 100%;order:3">${TYPES.map(([v, l]) => html`<button class="chip ${f.type === v ? 'on' : ''}" data-type="${v}">${l}</button>`)}</div>
    <div style="flex:1"></div>
    <select id="state" aria-label="State"><option value="">Anywhere</option>${['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((s) => html`<option ${f.state === s ? 'selected' : ''}>${s}</option>`)}</select>
    <select id="max" aria-label="Max price per month"><option value="">Any price</option>${[[100, 'Up to $100 / mo'], [250, 'Up to $250 / mo'], [500, 'Up to $500 / mo'], [1000, 'Up to $1,000 / mo'], [5000, 'Up to $5,000 / mo']].map(([v, l]) => html`<option value="${v}" ${f.max == v ? 'selected' : ''}>${l}</option>`)}</select>
    <select id="sort" aria-label="Sort"><option value="">Recommended</option><option value="price_asc" ${f.sort === 'price_asc' ? 'selected' : ''}>Price: low to high</option><option value="price_desc" ${f.sort === 'price_desc' ? 'selected' : ''}>Price: high to low</option><option value="rating" ${f.sort === 'rating' ? 'selected' : ''}>Top rated</option><option value="newest" ${f.sort === 'newest' ? 'selected' : ''}>Newest</option></select>
    <label class="chip ${f.instant ? 'on' : ''}" id="inst" style="cursor:pointer">⚡ Instant book</label></div></div></div>
  <div class="wrap" style="padding:28px 0 80px"><div class="split-view"><div><div class="muted" id="count" style="margin-bottom:18px;font-weight:700">Searching…</div><div class="grid g2" id="res">${[1, 2, 3, 4].map(() => html`<div><div class="skeleton" style="aspect-ratio:4/3"></div></div>`)}</div></div>
  <div class="map-col"><div id="map" role="application" aria-label="Map of available spaces"></div></div></div></div>`.s;

  let map = null, markers = new Map(), L = null;
  try { L = await loadLeaflet(); map = L.map('map', { zoomControl: true, attributionControl: true, scrollWheelZoom: true }).setView([-27, 134], 4); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map); onLeave(() => map.remove()); } catch (_) { $('#map').innerHTML = '<div class="empty">Map unavailable right now.</div>'; }

  async function load() {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(f)) if (v) p.set(k, v); p.set('limit', 60);
    history.replaceState({}, '', '/search' + ([...p].filter(([k]) => k !== 'limit').length ? '?' + new URLSearchParams([...p].filter(([k]) => k !== 'limit')) : ''));
    let data; try { data = await api('/listings?' + p); } catch (e) { $('#res').innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Could not load spaces</h3><p>${esc(e.message)}</p></div>`; return; }
    $('#count').textContent = data.total ? `${data.total} space${data.total > 1 ? 's' : ''} available` : 'No exact matches';
    $('#res').innerHTML = data.listings.length ? data.listings.map((l) => listingCard(l).s).join('') : `<div class="empty" style="grid-column:1/-1"><h3>Nothing here yet</h3><p>Try a different place or clear a filter. Owners are joining every week.</p><a class="btn btn-p" href="/host" data-link style="margin-top:18px">Own space? List it free</a></div>`;
    document.querySelectorAll('#res .rv').forEach((e) => e.classList.add('in')); tilt($('#res'));
    if (map && L) {
      markers.forEach((m) => m.remove()); markers.clear(); const pts = [];
      data.listings.forEach((l) => { if (l.lat == null) return; const m = L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: `<div class="pin" data-pin="${l.id}">${moneyP(l.price_cents)}</div>`, iconSize: [0, 0] }) }).addTo(map); m.on('click', () => { const el = $(`.lc[data-id="${l.id}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.animate([{ outline: '3px solid #ff6b2c' }, { outline: '3px solid transparent' }], { duration: 1600 }); }); markers.set(l.id, m); pts.push([l.lat, l.lng]); });
      if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 11 }); setTimeout(() => map.invalidateSize(), 100);
    }
  }
  $('#res').addEventListener('pointerover', (e) => { const c = e.target.closest('.lc'); $$('.pin.on').forEach((p) => p.classList.remove('on')); if (c) document.querySelector(`.pin[data-pin="${c.dataset.id}"]`)?.classList.add('on'); });
  $('#types').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; f.type = b.dataset.type; $$('#types .chip').forEach((c) => c.classList.toggle('on', c === b)); load(); });
  $('#q').addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); load(); }, 350));
  for (const id of ['state', 'max', 'sort']) $('#' + id).addEventListener('change', (e) => { f[id] = e.target.value; load(); });
  $('#inst').addEventListener('click', (e) => { f.instant = f.instant ? '' : '1'; e.currentTarget.classList.toggle('on', !!f.instant); load(); });
  load();
}
