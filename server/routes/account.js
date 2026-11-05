'use strict';
// Customer-facing authenticated routes (also used by owners for messaging).
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const { q, tx, now, getSetting, audit } = require('../db');
const { clean, int, wrap, ip, encrypt, decrypt } = require('../util');
const { requireAuth, publicUser } = require('../auth');
const { shapeListing, quote, availableQty, refreshRating } = require('./public');
const captcha = require('../captcha');
const mailer = require('../mailer');
const config = require('../config');

const r = express.Router();
r.use(requireAuth);

const writeLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip)), message: { error: 'Slow down a little.' } });
r.use((req, res, next) => (req.method === 'GET' ? next() : writeLimiter(req, res, next)));

// ---- profile ----
r.put('/profile', (req, res) => {
  const b = req.body || {};
  q.run('UPDATE users SET name = ?, phone = ?, company = ?, abn = ?, bio = ?, marketing_opt_in = ? WHERE id = ?',
    clean(b.name, 80) || req.user.name, clean(b.phone, 30), clean(b.company, 120), clean(b.abn, 20), clean(b.bio, 600), b.marketing_opt_in ? 1 : 0, req.user.id);
  if (req.user.role === 'owner' && typeof b.payout_details === 'string') q.run('UPDATE users SET payout_details = ? WHERE id = ?', encrypt(clean(b.payout_details, 400)), req.user.id);
  res.json({ user: publicUser(q.get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});
r.get('/payout', (req, res) => res.json({ payout_details: decrypt(req.user.payout_details) }));

r.delete('/account', wrap(async (req, res) => {
  // Self-service erasure (APP 13 / GDPR). Anonymises personal data, keeps financial records.
  const u = req.user; if (u.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be deleted here.' });
  const open = q.get("SELECT COUNT(*) c FROM bookings WHERE (customer_id = ? OR owner_id = ?) AND status IN ('pending','accepted','active')", u.id, u.id).c;
  if (open) return res.status(400).json({ error: 'You have open bookings. Finish or cancel them first.' });
  q.run("UPDATE users SET email = ?, name = 'Deleted user', phone = '', company = '', abn = '', bio = '', payout_details = '', status = 'suspended', totp_secret = '', totp_enabled = 0 WHERE id = ?", `deleted-${u.id}-${crypto.randomBytes(4).toString('hex')}@deleted.invalid`, u.id);
  q.run("UPDATE listings SET status = 'paused' WHERE owner_id = ?", u.id);
  q.run('DELETE FROM sessions WHERE user_id = ?', u.id); q.run('DELETE FROM wishlist WHERE user_id = ?', u.id);
  audit(u.id, 'account_deleted', '', ip(req)); res.json({ ok: true });
}));

r.get('/export', (req, res) => {
  const u = req.user;
  res.json({ profile: publicUser(u), bookings: q.all('SELECT * FROM bookings WHERE customer_id = ? OR owner_id = ?', u.id, u.id), messages: q.all('SELECT * FROM messages WHERE customer_id = ? OR owner_id = ?', u.id, u.id), reviews: q.all('SELECT * FROM reviews WHERE customer_id = ?', u.id), consents: q.all('SELECT doc,version,created_at FROM consents WHERE user_id = ?', u.id) });
});

// Any customer can start hosting with the same account (no second sign-up).
r.post('/become-host', (req, res) => {
  if (req.user.role !== 'customer') return res.json({ ok: true, role: req.user.role });
  if (getSetting('owner_registration_open') !== '1') return res.status(403).json({ error: 'Hosting sign-ups are paused right now.' });
  if (!req.body?.accept_terms) return res.status(400).json({ error: 'Please accept the Owner Agreement.' });
  q.run("UPDATE users SET role = 'owner' WHERE id = ?", req.user.id);
  const pg = q.get('SELECT version FROM pages WHERE slug = ?', 'host-agreement');
  if (pg) q.run('INSERT INTO consents(user_id,doc,version,ip,created_at) VALUES(?,?,?,?,?)', req.user.id, 'host-agreement', pg.version, ip(req), now());
  audit(req.user.id, 'became_host', '', ip(req));
  res.json({ ok: true, role: 'owner' });
});

// ---- wishlist ----
r.get('/wishlist', (req, res) => {
  const rows = q.all("SELECT l.* FROM wishlist w JOIN listings l ON l.id = w.listing_id WHERE w.user_id = ? AND l.status='active' ORDER BY w.created_at DESC", req.user.id);
  res.json({ listings: rows.map((l) => shapeListing(l)), ids: q.all('SELECT listing_id FROM wishlist WHERE user_id = ?', req.user.id).map((x) => x.listing_id) });
});
r.post('/wishlist/:id', (req, res) => { q.run('INSERT OR IGNORE INTO wishlist(user_id,listing_id,created_at) VALUES(?,?,?)', req.user.id, int(req.params.id), now()); res.json({ ok: true }); });
r.delete('/wishlist/:id', (req, res) => { q.run('DELETE FROM wishlist WHERE user_id = ? AND listing_id = ?', req.user.id, int(req.params.id)); res.json({ ok: true }); });

// ---- bookings ----
const bookingRow = (b) => ({
  ...b, listing: (() => { const l = q.get('SELECT id,slug,title,type,suburb,state,images,unit,address_line,access_hours FROM listings WHERE id = ?', b.listing_id); if (l) { l.images = JSON.parse(l.images || '[]'); if (!['accepted', 'active', 'completed'].includes(b.status)) delete l.address_line; } return l; })(),
  reviewed: !!q.get('SELECT 1 FROM reviews WHERE booking_id = ?', b.id),
});
r.get('/bookings', (req, res) => {
  res.json({ bookings: q.all('SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC', req.user.id).map(bookingRow) });
});

r.post('/bookings', wrap(async (req, res) => {
  const b = req.body || {};
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Use a customer account to book.' });
  if (getSetting('captcha_on_booking') === '1' && !(await captcha.check(req))) return res.status(400).json({ error: 'Human check failed.', captcha: true });
  if (mailer.configured() && !req.user.email_verified) return res.status(403).json({ error: 'Please confirm your email first. Check your inbox for our link.' });
  const l = q.get("SELECT * FROM listings WHERE id = ? AND status = 'active'", int(b.listing_id));
  if (!l) return res.status(404).json({ error: 'That space is no longer available.' });
  if (l.owner_id === req.user.id) return res.status(400).json({ error: 'You cannot book your own space.' });
  let qt; try { qt = quote(l, String(b.start_date), String(b.end_date), b.quantity); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  if (availableQty(l, b.start_date, b.end_date) < qt.quantity) return res.status(409).json({ error: 'Not enough space available for those dates. Try fewer units or different dates.' });
  if (!b.accept_terms) return res.status(400).json({ error: 'Please accept the Storage Rental Terms.' });
  const instant = !!l.instant_book && getSetting('allow_instant_book') === '1';
  const ref = 'WH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const info = q.run(`INSERT INTO bookings(ref,listing_id,customer_id,owner_id,start_date,end_date,quantity,goods,message,unit_price_cents,periods,subtotal_cents,service_fee_cents,commission_cents,total_cents,payout_cents,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, l.id, req.user.id, l.owner_id, b.start_date, b.end_date, qt.quantity, clean(b.goods, 300), clean(b.message, 1000), qt.unit_price_cents, qt.periods, qt.subtotal_cents, qt.service_fee_cents, qt.commission_cents, qt.total_cents, qt.payout_cents, instant ? 'accepted' : 'pending', now(), now());
  const booking = q.get('SELECT * FROM bookings WHERE id = ?', Number(info.lastInsertRowid));
  const owner = q.get('SELECT * FROM users WHERE id = ?', l.owner_id);
  mailer.queue({ to: owner.email, kind: 'booking', ...mailer.T.bookingRequestOwner(booking, l, req.user) });
  mailer.queue({ to: req.user.email, kind: 'booking', ...(instant ? mailer.T.bookingDecision(booking, l, true, '') : mailer.T.bookingReceivedCustomer(booking, l)) });
  mailer.queue({ to: getSetting('contact_email'), kind: 'admin', ...mailer.T.adminAlert('New booking ' + ref, [`${req.user.name} booked ${l.title}`, `Total ${(booking.total_cents / 100).toFixed(2)} AUD`], `${config.siteUrl}/admin/bookings`) });
  audit(req.user.id, 'booking_created', ref, ip(req));
  res.json({ booking: bookingRow(booking) });
}));

r.post('/bookings/:id/cancel', (req, res) => {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', int(req.params.id), req.user.id);
  if (!b) return res.status(404).json({ error: 'Booking not found.' });
  if (!['pending', 'accepted'].includes(b.status)) return res.status(400).json({ error: 'This booking can no longer be cancelled online. Contact us.' });
  q.run("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?", now(), b.id);
  const owner = q.get('SELECT email FROM users WHERE id = ?', b.owner_id); const l = q.get('SELECT title FROM listings WHERE id = ?', b.listing_id);
  mailer.queue({ to: owner.email, kind: 'booking', ...mailer.T.adminAlert(`Booking ${b.ref} cancelled`, [`The customer cancelled their booking for ${l.title}.`], `${config.siteUrl}/owner/bookings`) });
  audit(req.user.id, 'booking_cancelled', b.ref, ip(req)); res.json({ ok: true });
});

r.post('/bookings/:id/review', (req, res) => {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', int(req.params.id), req.user.id);
  if (!b || !['active', 'completed', 'accepted'].includes(b.status)) return res.status(400).json({ error: 'You can review a space after your booking is confirmed.' });
  if (q.get('SELECT 1 FROM reviews WHERE booking_id = ?', b.id)) return res.status(409).json({ error: 'You already reviewed this booking.' });
  const rating = int(req.body?.rating, 0, 0, 5); if (rating < 1) return res.status(400).json({ error: 'Choose a star rating.' });
  q.run('INSERT INTO reviews(booking_id,listing_id,customer_id,rating,body,created_at) VALUES(?,?,?,?,?,?)', b.id, b.listing_id, req.user.id, rating, clean(req.body?.body, 1200), now());
  refreshRating(b.listing_id); res.json({ ok: true });
});

// ---- payment (Stripe Checkout when configured) ----
r.post('/bookings/:id/pay', wrap(async (req, res) => {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND customer_id = ?', int(req.params.id), req.user.id);
  if (!b || b.status !== 'accepted' || b.payment_status !== 'unpaid') return res.status(400).json({ error: 'This booking is not waiting for payment.' });
  if (!config.stripe.secret || getSetting('stripe_enabled') !== '1') return res.status(501).json({ error: 'Online payment is being switched on. The team will send you a secure payment link by email shortly.' });
  const l = q.get('SELECT title FROM listings WHERE id = ?', b.listing_id);
  const form = new URLSearchParams({
    mode: 'payment', success_url: `${config.siteUrl}/account/bookings?paid=${b.ref}`, cancel_url: `${config.siteUrl}/account/bookings`,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'aud', 'line_items[0][price_data][unit_amount]': String(b.total_cents),
    'line_items[0][price_data][product_data][name]': `${l.title} (${b.ref})`, client_reference_id: b.ref, customer_email: req.user.email,
  });
  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${config.stripe.secret}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(15000) });
  const j = await resp.json(); if (!resp.ok) return res.status(502).json({ error: 'Payment provider error. Please try again.' });
  q.run('UPDATE bookings SET stripe_session = ? WHERE id = ?', j.id, b.id); res.json({ url: j.url });
}));

// ---- messages (shared by customers and owners) ----
r.get('/messages', (req, res) => {
  const col = req.user.role === 'owner' ? 'owner_id' : 'customer_id';
  const threads = q.all(`SELECT m.listing_id, m.customer_id, m.owner_id, MAX(m.id) last_id, SUM(CASE WHEN m.sender_id != ? AND m.read_at = 0 THEN 1 ELSE 0 END) unread
    FROM messages m WHERE m.${col} = ? GROUP BY m.listing_id, m.customer_id ORDER BY last_id DESC LIMIT 100`, req.user.id, req.user.id);
  res.json({ threads: threads.map((t) => {
    const last = q.get('SELECT body, created_at FROM messages WHERE id = ?', t.last_id);
    const other = q.get('SELECT name FROM users WHERE id = ?', req.user.role === 'owner' ? t.customer_id : t.owner_id);
    const l = q.get('SELECT title, slug FROM listings WHERE id = ?', t.listing_id);
    return { listing_id: t.listing_id, customer_id: t.customer_id, other: other?.name, listing: l?.title, slug: l?.slug, last: last.body, at: last.created_at, unread: t.unread };
  }) });
});
r.get('/messages/:listingId/:customerId', (req, res) => {
  const lid = int(req.params.listingId), cid = int(req.params.customerId);
  const l = q.get('SELECT owner_id FROM listings WHERE id = ?', lid); if (!l) return res.status(404).json({ error: 'Not found.' });
  if (req.user.id !== cid && req.user.id !== l.owner_id) return res.status(403).json({ error: 'Not your conversation.' });
  q.run('UPDATE messages SET read_at = ? WHERE listing_id = ? AND customer_id = ? AND sender_id != ? AND read_at = 0', now(), lid, cid, req.user.id);
  res.json({ messages: q.all('SELECT id, sender_id, body, created_at FROM messages WHERE listing_id = ? AND customer_id = ? ORDER BY id ASC LIMIT 300', lid, cid) });
});
r.post('/messages', (req, res) => {
  const lid = int(req.body?.listing_id); const body = clean(req.body?.body, 2000);
  const l = q.get('SELECT * FROM listings WHERE id = ?', lid); if (!l || body.length < 1) return res.status(400).json({ error: 'Write a message first.' });
  let cid = req.user.id; if (req.user.id === l.owner_id) cid = int(req.body?.customer_id); else if (l.status !== 'active') return res.status(404).json({ error: 'Space not available.' });
  if (!cid || cid === l.owner_id) return res.status(400).json({ error: 'No recipient.' });
  q.run('INSERT INTO messages(listing_id,customer_id,owner_id,sender_id,body,created_at) VALUES(?,?,?,?,?,?)', lid, cid, l.owner_id, req.user.id, body, now());
  const toId = req.user.id === l.owner_id ? cid : l.owner_id; const to = q.get('SELECT * FROM users WHERE id = ?', toId);
  if (to) mailer.queue({ to: to.email, kind: 'message', ...mailer.T.newMessage(req.user, to, l, body) });
  res.json({ ok: true });
});

module.exports = r;
