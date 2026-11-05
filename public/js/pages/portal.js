// Shared building blocks for the customer, owner and admin portals.
import { html, raw, esc, $, $$, api, state, icon, date, money, toast, modal, confirmBox, formData, submitForm } from '../lib.js';

export function shell(main, { links, active, role }) {
  const u = state.user;
  main.innerHTML = html`<div class="portal"><nav class="side" aria-label="${role} navigation"><div class="who"><span class="badge acc">${role}</span><b style="margin-top:10px">${u.name}</b><span class="muted" style="font-size:13px">${u.email}</span></div>
    ${links.map(([href, label, ic, cnt]) => html`<a href="${href}" data-link class="${active === href ? 'on' : ''}">${icon(ic)}<span>${label}</span>${cnt ? html`<span class="cnt">${cnt}</span>` : ''}</a>`)}</nav><div class="pmain" id="pc"></div></div>`.s;
  return $('#pc', main);
}
export const head = (title, sub = '', actions = '') => html`<div class="ptop"><div><h1>${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}</div><div style="display:flex;gap:10px;flex-wrap:wrap">${actions}</div></div>`;
export const STATUS = { pending: 'warn', accepted: 'ok', active: 'ok', completed: '', declined: 'bad', cancelled: 'bad', paid: 'ok', unpaid: 'warn', refunded: '', draft: '', rejected: 'bad', paused: '', new: 'warn', done: 'ok', published: 'ok', hidden: 'bad', contacted: '', replied: 'acc', invited: 'acc', signed_up: 'ok', listed: 'ok', declined_p: 'bad', unsubscribed: 'bad', sent: 'ok', failed: 'bad', not_sent: 'warn', queued: 'warn' };
export const badge = (s) => html`<span class="badge ${STATUS[s] ?? ''}">${String(s).replace('_', ' ')}</span>`;
export const empty = (t, p, cta = '') => html`<div class="empty"><h3>${t}</h3><p>${p}</p>${cta}</div>`;
export const kpi = (label, value) => html`<div class="kpi"><small>${label}</small><b>${value}</b></div>`;
export const verifyBanner = () => state.user && !state.user.email_verified && state.site?.mail ? html`<div class="err" style="background:rgba(255,194,75,.1);border-color:rgba(255,194,75,.4);color:#ffd98a;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between">Please confirm your email address. Check your inbox for our link.<button class="btn btn-g btn-sm" id="resend">Resend email</button></div>` : '';
export function wireVerify(root) { $('#resend', root)?.addEventListener('click', async () => { try { await api('/auth/resend-verification', { method: 'POST' }); toast('Sent. Check your inbox.', 'ok'); } catch (e) { toast(e.message, 'bad'); } }); }

// ---------- messages (shared by customer and owner) ----------
export async function messagesView(el) {
  const { threads } = await api('/me/messages'); const me = state.user.id; let cur = null;
  el.innerHTML = threads.length ? html`<div class="thread"><div class="threads" id="th">${threads.map((t, i) => html`<button data-i="${i}"><b>${t.other}</b> ${t.unread ? html`<span class="badge acc">${t.unread} new</span>` : ''}<div class="muted" style="font-size:13px">${t.listing}</div><div style="font-size:14px;margin-top:4px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.last}</div></button>`)}</div>
    <div class="chat"><div class="msgs" id="ms"><div class="empty">Pick a conversation.</div></div><form id="mf" class="hide"><input class="inp" name="body" placeholder="Write a message…" maxlength="2000" required autocomplete="off"><button class="btn btn-p" type="submit">Send</button></form></div></div>`.s
    : empty('No messages yet', 'When you message an owner or customer, the conversation appears here.').s;
  if (!threads.length) return;
  async function open(i) {
    cur = threads[i]; $$('#th button').forEach((b, k) => b.classList.toggle('on', k === i)); const { messages } = await api(`/me/messages/${cur.listing_id}/${cur.customer_id}`);
    $('#ms').innerHTML = messages.map((m) => `<div class="bub ${m.sender_id === me ? 'me' : ''}">${esc(m.body)}</div>`).join(''); $('#ms').scrollTop = 1e9; $('#mf').classList.remove('hide');
  }
  $('#th').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) open(+b.dataset.i); });
  $('#mf').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { await api('/me/messages', { method: 'POST', body: { listing_id: cur.listing_id, customer_id: cur.customer_id, body: formData(f).body } }); f.reset(); await open(threads.indexOf(cur)); }); });
  open(0);
}
