// Shared earnings calculator (home page and host page).
import { html, $, $$, money, state } from '../lib.js';

export const PRESETS = [
  { name: 'Garage or shed', l: 'How many spaces?', u: 'spaces', min: 1, max: 10, v: 1, pl: 'Price per space per month', pmin: 60, pmax: 600, pv: 250, k: 1, step: 5, occ: 80 },
  { name: 'Spare room or attic', l: 'How many rooms?', u: 'rooms', min: 1, max: 6, v: 1, pl: 'Price per room per month', pmin: 50, pmax: 400, pv: 160, k: 1, step: 5, occ: 80 },
  { name: 'Driveway or car space', l: 'How many car spaces?', u: 'spaces', min: 1, max: 20, v: 1, pl: 'Price per space per month', pmin: 60, pmax: 700, pv: 200, k: 1, step: 5, occ: 80 },
  { name: 'Warehouse floor', l: 'Square metres', u: 'm²', min: 20, max: 3000, v: 300, pl: 'Price per m² per month', pmin: 6, pmax: 40, pv: 16, k: 1, step: 0.5, occ: 70 },
  { name: 'Pallet racking', l: 'Pallet positions', u: 'pallets', min: 10, max: 600, v: 100, pl: 'Price per pallet per week', pmin: 3, pmax: 12, pv: 4.5, k: 52 / 12, step: 0.25, occ: 70 },
];
export const calcHtml = (first = 0) => html`<div class="calc rv"><div class="chips" id="presets" style="margin-bottom:26px">${PRESETS.map((p, i) => html`<button type="button" class="chip ${i === first ? 'on' : ''}" data-preset="${i}">${p.name}</button>`)}</div>
  <div id="cl1" class="mono"></div><div style="margin:12px 0 6px"><b id="v1"></b></div><input type="range" id="r1" style="width:100%" aria-label="Quantity">
  <div id="cl2" class="mono" style="margin-top:24px"></div><div style="margin:12px 0 6px"><b id="v2"></b></div><input type="range" id="r2" style="width:100%" aria-label="Price">
  <div class="mono" style="margin-top:24px">How often it is booked</div><div style="margin:12px 0 6px"><b id="v3"></b></div><input type="range" id="r3" min="20" max="100" step="5" style="width:100%" aria-label="Occupancy">
  <div class="muted" style="margin-top:26px">You could earn about</div><div class="out" id="co">$0</div><div class="muted" id="cn" style="margin-top:10px;font-size:14px"></div></div>`;
export function wireCalc(root, first = 0) {
  const s = state.site.settings; let cur = first;
  const calc = () => { const p = PRESETS[cur]; const q = +$('#r1', root).value, pr = +$('#r2', root).value, occ = +$('#r3', root).value / 100; const rate = parseFloat(s.owner_commission_pct) / 100; const gross = q * pr * p.k * occ; $('#v1', root).textContent = `${q.toLocaleString('en-AU')} ${q === 1 && /s$/.test(p.u) ? p.u.slice(0, -1) : p.u}`; $('#v2', root).textContent = `$${pr.toFixed(pr % 1 ? 2 : 0)}`; $('#v3', root).textContent = Math.round(occ * 100) + '% of the time'; $('#co', root).textContent = money(Math.round(gross * (1 - rate) * 100)); $('#cn', root).textContent = `a month, after our ${s.owner_commission_pct}% commission (gross ${money(Math.round(gross * 100))}). Your first ${s.founding_owner_months} months could be commission-free.`; };
  const apply = () => { const p = PRESETS[cur]; $('#cl1', root).textContent = p.l; $('#cl2', root).textContent = p.pl; const r1 = $('#r1', root), r2 = $('#r2', root); r1.min = p.min; r1.max = p.max; r1.step = 1; r1.value = p.v; r2.min = p.pmin; r2.max = p.pmax; r2.step = p.step; r2.value = p.pv; $('#r3', root).value = p.occ; calc(); };
  $('#presets', root).addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (!b) return; cur = +b.dataset.preset; $$('#presets .chip', root).forEach((x) => x.classList.toggle('on', x === b)); apply(); });
  ['r1', 'r2', 'r3'].forEach((id) => $('#' + id, root).addEventListener('input', calc)); apply();
}
