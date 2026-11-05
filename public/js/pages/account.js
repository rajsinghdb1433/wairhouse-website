import { html, raw, esc, $, $$, api, state, icon, date, money, moneyP, toast, modal, confirmBox, formData, submitForm, setTitle, listingCard, tilt, TYPE_LABEL } from '../lib.js';
import { typeImage } from '../lib.js';
import { shell, head, badge, empty, messagesView, verifyBanner, wireVerify } from './portal.js';
import { navigate } from '../app.js';

export default async function account(c) {
  const { main, path, query } = c; const sub = path.replace(/^\/account\/?/, '') || 'bookings';
  const links = [['/account/bookings', 'Bookings', 'cal'], ['/account/wishlist', 'Wishlist', 'heart'], ['/account/messages', 'Messages', 'msg'], ['/account/profile', 'Profile and security', 'user']];
  if (state.user.role !== 'customer') links.push([state.user.role === 'admin' ? '/admin' : '/owner', state.user.role === 'admin' ? 'Admin panel' : 'Owner portal', 'home']);
  const pc = shell(main, { links, active: '/account/' + sub, role: 'Customer' });
  ({ bookings, wishlist, messages, profile }[sub] || bookings)(pc, c);
}

async function bookings(pc, { query }) {
  setTitle('My bookings'); const { bookings: list } = await api('/me/bookings');
  pc.innerHTML = html`${head('My bookings', 'Everything you have requested or booked.', html`<a class="btn btn-p" href="/search" data-link>Find more space</a>`)}${verifyBanner()}
  ${query.paid ? html`<div class="okmsg">Thanks! Payment received for ${query.paid}.</div>` : ''}
  ${list.length ? html`<div class="grid" style="gap:16px">${list.map((b) => html`<div class="panel" style="margin:0"><div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
    <img src="${b.listing?.images?.[0] || typeImage(b.listing?.type)}" alt="" style="width:150px;height:100px;object-fit:cover;border-radius:14px">
    <div style="flex:1;min-width:220px"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">${badge(b.status)}${badge(b.payment_status)}<span class="mono" style="color:var(--dim)">${b.ref}</span></div>
      <h3 style="margin:0 0 4px;font-size:22px"><a href="/space/${b.listing?.slug}" data-link>${b.listing?.title}</a></h3><p class="muted">${b.start_date} → ${b.end_date} · ${b.quantity} ${b.listing?.unit}${b.quantity > 1 ? 's' : ''} · <b style="color:var(--text)">${money(b.total_cents, 2)}</b></p>
      ${b.listing?.address_line ? html`<p class="muted" style="font-size:14px">📍 ${b.listing.address_line}, ${b.listing.suburb} ${b.listing.state}${b.listing.access_hours ? ' · Access: ' + b.listing.access_hours : ''}</p>` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${b.status === 'accepted' && b.payment_status === 'unpaid' ? html`<button class="btn btn-p btn-sm" data-pay="${b.id}">Pay now</button>` : ''}${['pending', 'accepted'].includes(b.status) ? html`<button class="btn btn-g btn-sm" data-cancel="${b.id}">Cancel</button>` : ''}${['accepted', 'active', 'completed'].includes(b.status) && !b.reviewed ? html`<button class="btn btn-g btn-sm" data-review="${b.id}">Leave review</button>` : ''}</div></div></div>`)}</div>`
    : empty('No bookings yet', 'Find a space and send your first request.', html`<a class="btn btn-p" href="/search" data-link style="margin-top:16px">Find space</a>`)}`.s;
  wireVerify(pc);
  pc.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cancel && await confirmBox('Cancel this booking?', 'Our cancellation policy applies. You can request again later.', 'Yes, cancel')) { try { await api(`/me/bookings/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('Booking cancelled'); bookings(pc, { query: {} }); } catch (er) { toast(er.message, 'bad'); } }
    if (b.dataset.pay) { try { const r = await api(`/me/bookings/${b.dataset.pay}/pay`, { method: 'POST' }); location.href = r.url; } catch (er) { modal(`<h2>Payment</h2><p class="muted">${esc(er.message)}</p><button class="btn btn-p btn-block" data-close style="margin-top:20px">OK</button>`); } }
    if (b.dataset.review) { const m = modal(`<h2>How was it?</h2><form id="rf"><div class="field"><label>Rating</label><select name="rating"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ Okay</option><option value="2">★★ Poor</option><option value="1">★ Bad</option></select></div><div class="field"><label>Your review</label><textarea name="body" maxlength="1200" placeholder="Help the next customer…"></textarea></div><div class="err-slot"></div><button class="btn btn-p btn-block" type="submit">Post review</button></form>`);
      $('#rf', m.el).addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(ev.target, async () => { const d = formData(ev.target); await api(`/me/bookings/${b.dataset.review}/review`, { method: 'POST', body: { rating: +d.rating, body: d.body } }); m.close(); toast('Thanks for your review!', 'ok'); bookings(pc, { query: {} }); }); }); }
  };
}

async function wishlist(pc) {
  setTitle('Wishlist'); const { listings } = await api('/me/wishlist');
  pc.innerHTML = html`${head('Wishlist', 'Spaces you saved.')}${listings.length ? html`<div class="grid g3">${listings.map((l) => listingCard(l))}</div>` : empty('Nothing saved yet', 'Tap the heart on any space to save it here.', html`<a class="btn btn-p" href="/search" data-link style="margin-top:16px">Browse spaces</a>`)}`.s;
  $$('.rv', pc).forEach((e) => e.classList.add('in')); tilt(pc);
  pc.onclick = (e) => { const h = e.target.closest('[data-wish]'); if (h) { e.preventDefault(); e.stopPropagation(); api(`/me/wishlist/${h.dataset.wish}`, { method: 'DELETE' }).then(() => { state.wish.delete(+h.dataset.wish); h.closest('.lc').remove(); }); } };
}

async function messages(pc) { setTitle('Messages'); pc.innerHTML = head('Messages', 'Chat with owners about your spaces.').s + '<div id="mv"></div>'; await messagesView($('#mv', pc)); }

export async function profile(pc, { query } = {}) {
  setTitle('Profile and security'); const u = state.user; const forced = query?.force;
  const payout = u.role === 'owner' ? (await api('/me/payout').catch(() => ({ payout_details: '' }))).payout_details : '';
  pc.innerHTML = html`${head('Profile and security')}${forced ? html`<div class="err">For your security, please set a new password now.</div>` : ''}${verifyBanner()}
  <div class="grid g2" style="align-items:start"><form class="panel" id="pf"><h3>Your details</h3><div class="field"><label>Name</label><input name="name" value="${u.name}" required></div><div class="field"><label>Email</label><input value="${u.email}" disabled></div>
    <div class="row"><div class="field"><label>Phone</label><input name="phone" value="${u.phone || ''}"></div><div class="field"><label>Business</label><input name="company" value="${u.company || ''}"></div></div>
    ${u.role !== 'customer' ? html`<div class="field"><label>ABN</label><input name="abn" value="${u.abn || ''}" maxlength="14"></div><div class="field"><label>About you <span class="muted">(shown on your listings)</span></label><textarea name="bio" maxlength="600">${u.bio || ''}</textarea></div>` : ''}
    ${u.role === 'owner' ? html`<div class="field"><label>Payout details</label><textarea name="payout_details" placeholder="Account name, BSB and account number" maxlength="400">${payout}</textarea><div class="hint">Stored encrypted. Only used to pay you.</div></div>` : ''}
    <label class="check"><input type="checkbox" name="marketing_opt_in" ${u.marketing_opt_in ? 'checked' : ''}><span>Send me tips and offers</span></label><div class="err-slot"></div><button class="btn btn-p" type="submit">Save</button></form>
  <div><form class="panel" id="pw"><h3>Change password</h3><div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password" required></div><div class="field"><label>New password</label><input type="password" name="password" autocomplete="new-password" minlength="10" required><div class="hint">At least 10 characters.</div></div><div class="err-slot"></div><button class="btn btn-p" type="submit">Update password</button></form>
  <div class="panel" id="tfa"><h3>Two-factor sign-in</h3><p class="muted" style="margin-bottom:16px">${u.totp_enabled ? 'On. You will be asked for a code from your authenticator app.' : 'Add a second step with an app like Google Authenticator or 1Password. Strongly recommended' + (u.role !== 'customer' ? ' for owners and admins.' : '.')}</p>${u.totp_enabled ? '<button class="btn btn-g" id="t-off">Turn off</button>' : '<button class="btn btn-p" id="t-on">Set up</button>'}</div>
  <div class="panel"><h3>Your data</h3><p class="muted" style="margin-bottom:16px">Download a copy of your data, or delete your account. Deleting is permanent.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-g" id="exp">Download my data</button>${u.role !== 'admin' ? '<button class="btn btn-g" id="del" style="color:var(--bad)">Delete account</button>' : ''}</div></div></div></div>`.s;
  wireVerify(pc);
  $('#pf').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { const d = formData(f); const r = await api('/me/profile', { method: 'PUT', body: { ...d, marketing_opt_in: !!d.marketing_opt_in } }); Object.assign(state.user, r.user); toast('Saved', 'ok'); }); });
  $('#pw').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { await api('/auth/change-password', { method: 'POST', body: formData(f) }); f.reset(); state.user.must_change_password = false; toast('Password updated', 'ok'); if (forced) navigate(u.role === 'admin' ? '/admin' : '/account/bookings'); }); });
  $('#t-on')?.addEventListener('click', async () => { const s = await api('/auth/2fa/setup', { method: 'POST' }); const m = modal(`<h2>Scan with your authenticator</h2><div style="text-align:center;margin:10px 0"><img src="${s.qr}" alt="QR code" style="margin:auto;border-radius:14px;background:#fff;padding:8px"><p class="muted" style="margin-top:10px;font-size:13px">Or enter this key: <b style="color:var(--text);letter-spacing:.1em">${esc(s.secret)}</b></p></div><form id="tf"><div class="field"><label>6-digit code</label><input name="code" inputmode="numeric" maxlength="6" required></div><div class="err-slot"></div><button class="btn btn-p btn-block" type="submit">Turn on</button></form>`);
    $('#tf', m.el).addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(ev.target, async () => { await api('/auth/2fa/enable', { method: 'POST', body: formData(ev.target) }); state.user.totp_enabled = true; m.close(); toast('Two-factor is on', 'ok'); profile(pc, {}); }); }); });
  $('#t-off')?.addEventListener('click', () => { const m = modal(`<h2>Turn off two-factor?</h2><form id="tf"><div class="field"><label>Confirm your password</label><input type="password" name="password" required></div><div class="err-slot"></div><button class="btn btn-p btn-block" type="submit">Turn off</button></form>`); $('#tf', m.el).addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(ev.target, async () => { await api('/auth/2fa/disable', { method: 'POST', body: formData(ev.target) }); state.user.totp_enabled = false; m.close(); profile(pc, {}); }); }); });
  $('#exp').addEventListener('click', async () => { const d = await api('/me/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'my-wairhouse-data.json'; a.click(); });
  $('#del')?.addEventListener('click', async () => { if (await confirmBox('Delete your account?', 'This removes your personal details and cannot be undone. Open bookings must be finished first.', 'Delete forever')) { try { await api('/me/account', { method: 'DELETE' }); state.user = null; toast('Account deleted'); navigate('/'); } catch (er) { toast(er.message, 'bad'); } } });
}
