'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { q, now, getSetting, audit } = require('../db');
const { clean, int, cents, slugify, wrap, ip } = require('../util');
const { requireRole } = require('../auth');
const { shapeListing, ownerCommissionPct } = require('./public');
const mailer = require('../mailer');
const config = require('../config');
const geo = require('../geo');

const r = express.Router();
r.use(requireRole('owner', 'admin'));

const TYPES = ['warehouse', 'pallet', 'self-storage', 'container', 'cold-storage', 'yard', 'garage', 'shed', 'spare-room', 'basement', 'parking', 'pop-up', 'commercial-kitchen', 'other'];
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 6 }, fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)) });

function parseListing(b, existing) {
  const e = existing || {};
  const err = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  const title = clean(b.title, 90); if (title.length < 6) err('Give your space a clear title (at least 6 characters).');
  const type = TYPES.includes(b.type) ? b.type : 'warehouse';
  const unit = ['sqm', 'pallet', 'unit'].includes(b.unit) ? b.unit : 'sqm';
  const period = ['day', 'week', 'month'].includes(b.period) ? b.period : 'month';
  const price = cents(Number(b.price) * 100); if (price < 100) err('Set a price of at least $1.');
  if (price > 5_000_000) err('That price looks too high. Check the amount.');
  const state = String(b.state || '').toUpperCase(); if (!STATES.includes(state)) err('Choose a state or territory.');
  const suburb = clean(b.suburb, 60); if (suburb.length < 2) err('Enter the suburb.');
  const postcode = clean(b.postcode, 4); if (!/^\d{4}$/.test(postcode)) err('Enter a 4-digit postcode.');
  // Map position. A pin the host placed always wins. Otherwise we place one from the suburb and postcode (suburb level on purpose: the
  // street address stays private). If the suburb, state or postcode was changed and the pin was left where it was, move it with them.
  const lat = Number(b.lat), lng = Number(b.lng);
  const given = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0 && lng !== 0;
  const has = e.lat != null && e.lng != null;
  const moved = given && (!has || Math.abs(lat - e.lat) > 1e-6 || Math.abs(lng - e.lng) > 1e-6);
  const same = (a, c) => String(a || '').trim().toLowerCase() === String(c || '').trim().toLowerCase();
  const placeChanged = !!existing && !(same(e.suburb, suburb) && same(e.state, state) && same(e.postcode, postcode));
  let pin = given ? [lat, lng] : (has ? [e.lat, e.lng] : null);
  if (!pin || (placeChanged && !moved)) { const g = geo.locate({ suburb, state, postcode }); pin = g ? [g.lat, g.lng] : null; }
  const features = (Array.isArray(b.features) ? b.features : []).map((f) => clean(f, 40)).filter(Boolean).slice(0, 24);
  return {
    title, summary: clean(b.summary, 180), description: clean(b.description, 4000), type, unit, period, price_cents: price,
    capacity: int(b.capacity, 1, 1, 100000), total_sqm: Math.max(0, Number(b.total_sqm) || 0), height_m: Math.max(0, Number(b.height_m) || 0), min_days: int(b.min_days, 7, 1, 365),
    address_line: clean(b.address_line, 120), suburb, state, postcode,
    lat: pin ? pin[0] : null, lng: pin ? pin[1] : null,
    features: JSON.stringify(features), access_hours: clean(b.access_hours, 80),
    instant_book: b.instant_book ? 1 : 0, insurance_included: b.insurance_included ? 1 : 0,
  };
}
function uniqueSlug(title, suburb, ignoreId = 0) {
  const base = slugify(`${title} ${suburb}`); let s = base, n = 1;
  while (q.get('SELECT 1 FROM listings WHERE slug = ? AND id != ?', s, ignoreId)) s = `${base}-${++n}`;
  return s;
}
const mine = (req, id) => q.get('SELECT * FROM listings WHERE id = ? AND (owner_id = ? OR ?)', id, req.user.id, req.user.role === 'admin' ? 1 : 0);

r.get('/overview', (req, res) => {
  const id = req.user.id;
  const sum = (sql, ...p) => q.get(sql, ...p) || {};
  const earnings = sum("SELECT COALESCE(SUM(payout_cents),0) paid FROM bookings WHERE owner_id = ? AND payment_status='paid'", id).paid;
  const pending = sum("SELECT COALESCE(SUM(payout_cents),0) v FROM bookings WHERE owner_id = ? AND status IN ('accepted','active') AND payment_status='unpaid'", id).v;
  const monthly = q.all("SELECT strftime('%Y-%m', created_at/1000, 'unixepoch') m, SUM(payout_cents) v FROM bookings WHERE owner_id = ? AND status NOT IN ('declined','cancelled') GROUP BY m ORDER BY m DESC LIMIT 6", id).reverse();
  res.json({
    earnings_paid_cents: earnings, earnings_pending_cents: pending,
    listings: sum('SELECT COUNT(*) c FROM listings WHERE owner_id = ?', id).c,
    live: sum("SELECT COUNT(*) c FROM listings WHERE owner_id = ? AND status='active'", id).c,
    views: sum('SELECT COALESCE(SUM(views),0) c FROM listings WHERE owner_id = ?', id).c,
    requests: sum("SELECT COUNT(*) c FROM bookings WHERE owner_id = ? AND status='pending'", id).c,
    active_bookings: sum("SELECT COUNT(*) c FROM bookings WHERE owner_id = ? AND status IN ('accepted','active')", id).c,
    unread: sum("SELECT COUNT(*) c FROM messages WHERE owner_id = ? AND sender_id != ? AND read_at = 0", id, id).c,
    commission_pct: ownerCommissionPct(id), monthly,
  });
});

// Where would a pin for this suburb and postcode go? The "Add a space" map uses it to place the pin for the host as they fill the form in.
r.get('/locate', (req, res) => {
  const g = geo.locate({ suburb: clean(req.query.suburb, 60), state: clean(req.query.state, 3), postcode: clean(req.query.postcode, 4) });
  res.json({ found: !!g, lat: g ? g.lat : null, lng: g ? g.lng : null });
});

r.get('/listings', (req, res) => {
  const rows = q.all('SELECT * FROM listings WHERE owner_id = ? ORDER BY created_at DESC', req.user.id);
  res.json({ listings: rows.map((l) => ({ ...shapeListing(l, { full: true, exact: true }), rejection_reason: l.rejection_reason })) });
});
r.get('/listings/:id', (req, res) => { const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' }); res.json({ listing: { ...shapeListing(l, { full: true, exact: true }), rejection_reason: l.rejection_reason } }); });

r.post('/listings', (req, res) => {
  if (!req.body?.confirm_rights) return res.status(400).json({ error: 'Please confirm you own this space or have permission to rent it out (landlord, strata or owners corporation).' });
  if (mailer.configured() && !req.user.email_verified) return res.status(403).json({ error: 'Please confirm your email before listing. Check your inbox.' });
  let d; try { d = parseListing(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const approval = getSetting('require_listing_approval') === '1';
  const t = now(); const slug = uniqueSlug(d.title, d.suburb);
  const info = q.run(`INSERT INTO listings(owner_id,slug,title,summary,description,type,address_line,suburb,state,postcode,lat,lng,unit,price_cents,period,capacity,total_sqm,height_m,min_days,features,images,access_hours,instant_book,insurance_included,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    req.user.id, slug, d.title, d.summary, d.description, d.type, d.address_line, d.suburb, d.state, d.postcode, d.lat, d.lng, d.unit, d.price_cents, d.period, d.capacity, d.total_sqm, d.height_m, d.min_days, d.features, '[]', d.access_hours, d.instant_book, d.insurance_included, approval ? 'draft' : 'active', t, t);
  audit(req.user.id, 'listing_created', `${slug} (rights confirmed)`, ip(req));
  res.json({ listing: shapeListing(q.get('SELECT * FROM listings WHERE id = ?', Number(info.lastInsertRowid)), { full: true, exact: true }) });
});

r.put('/listings/:id', (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  let d; try { d = parseListing(req.body || {}, l); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const slug = d.title === l.title && d.suburb === l.suburb ? l.slug : uniqueSlug(d.title, d.suburb, l.id);
  // Material edits to a live listing send it back for a quick re-check.
  const needsReview = getSetting('require_listing_approval') === '1' && l.status === 'active' && req.user.role !== 'admin' && (d.title !== l.title || d.description !== l.description || d.address_line !== l.address_line);
  q.run(`UPDATE listings SET slug=?,title=?,summary=?,description=?,type=?,address_line=?,suburb=?,state=?,postcode=?,lat=?,lng=?,unit=?,price_cents=?,period=?,capacity=?,total_sqm=?,height_m=?,min_days=?,features=?,access_hours=?,instant_book=?,insurance_included=?,status=?,updated_at=? WHERE id=?`,
    slug, d.title, d.summary, d.description, d.type, d.address_line, d.suburb, d.state, d.postcode, d.lat, d.lng, d.unit, d.price_cents, d.period, d.capacity, d.total_sqm, d.height_m, d.min_days, d.features, d.access_hours, d.instant_book, d.insurance_included, needsReview ? 'pending' : l.status, now(), l.id);
  res.json({ listing: shapeListing(q.get('SELECT * FROM listings WHERE id = ?', l.id), { full: true, exact: true }), re_review: needsReview });
});

// Submit a draft/rejected listing for approval (or publish straight away if approvals are off)
r.post('/listings/:id/submit', (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  const imgs = JSON.parse(l.images || '[]');
  if (imgs.length < 1) return res.status(400).json({ error: 'Add at least one photo first.' });
  if (!l.description || l.description.length < 40) return res.status(400).json({ error: 'Add a description of at least 40 characters.' });
  const approval = getSetting('require_listing_approval') === '1';
  q.run('UPDATE listings SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?', approval ? 'pending' : 'active', '', now(), l.id);
  if (approval) mailer.queue({ to: getSetting('contact_email'), kind: 'admin', ...mailer.T.adminAlert('Listing awaiting approval', [`${l.title} (${l.suburb} ${l.state}) was submitted by ${req.user.name}.`], `${config.siteUrl}/admin/listings`) });
  res.json({ status: approval ? 'pending' : 'active' });
});
r.post('/listings/:id/pause', (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  const next = l.status === 'paused' ? 'active' : l.status === 'active' ? 'paused' : null;
  if (!next) return res.status(400).json({ error: 'Only live listings can be paused.' });
  q.run('UPDATE listings SET status = ? WHERE id = ?', next, l.id); res.json({ status: next });
});
r.delete('/listings/:id', (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  if (q.get("SELECT 1 FROM bookings WHERE listing_id = ? AND status IN ('pending','accepted','active')", l.id)) return res.status(400).json({ error: 'This space has open bookings. Pause it instead.' });
  if (q.get('SELECT 1 FROM bookings WHERE listing_id = ?', l.id)) { q.run("UPDATE listings SET status='paused' WHERE id=?", l.id); return res.json({ ok: true, archived: true }); }
  for (const f of JSON.parse(l.images || '[]')) if (f.startsWith('/uploads/')) fs.rm(path.join(config.UPLOAD_DIR, path.basename(f)), () => {});
  q.run('DELETE FROM listings WHERE id = ?', l.id); res.json({ ok: true });
});

// Photos: re-encoded server-side (strips EXIF/GPS and any hidden payload), random file names.
r.post('/listings/:id/images', upload.array('images', 6), wrap(async (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  const imgs = JSON.parse(l.images || '[]'); const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Choose JPG, PNG or WebP photos up to 8 MB.' });
  for (const f of files) {
    if (imgs.length >= 12) break;
    try {
      const name = crypto.randomBytes(12).toString('hex') + '.webp';
      await sharp(f.buffer, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(config.UPLOAD_DIR, name));
      imgs.push('/uploads/' + name);
    } catch (_) { /* skip files that are not real images */ }
  }
  q.run('UPDATE listings SET images = ?, updated_at = ? WHERE id = ?', JSON.stringify(imgs), now(), l.id);
  res.json({ images: imgs });
}));
r.delete('/listings/:id/images', (req, res) => {
  const l = mine(req, int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  const target = String(req.body?.image || ''); const imgs = JSON.parse(l.images || '[]').filter((x) => x !== target);
  if (target.startsWith('/uploads/')) fs.rm(path.join(config.UPLOAD_DIR, path.basename(target)), () => {});
  q.run('UPDATE listings SET images = ? WHERE id = ?', JSON.stringify(imgs), l.id); res.json({ images: imgs });
});

// ---- bookings for my spaces ----
r.get('/bookings', (req, res) => {
  const rows = q.all(`SELECT b.*, u.name customer_name, u.email customer_email, u.phone customer_phone, l.title, l.slug FROM bookings b JOIN users u ON u.id = b.customer_id JOIN listings l ON l.id = b.listing_id WHERE b.owner_id = ? ORDER BY b.created_at DESC LIMIT 200`, req.user.id);
  res.json({ bookings: rows.map((b) => (['accepted', 'active', 'completed'].includes(b.status) ? b : { ...b, customer_email: '', customer_phone: '' })) });
});
r.post('/bookings/:id/decision', (req, res) => {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND owner_id = ?', int(req.params.id), req.user.id);
  if (!b || b.status !== 'pending') return res.status(400).json({ error: 'This request is no longer pending.' });
  const accept = req.body?.accept === true; const note = clean(req.body?.note, 400);
  q.run('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', accept ? 'accepted' : 'declined', now(), b.id);
  const l = q.get('SELECT * FROM listings WHERE id = ?', b.listing_id); const c = q.get('SELECT * FROM users WHERE id = ?', b.customer_id);
  mailer.queue({ to: c.email, kind: 'booking', ...mailer.T.bookingDecision(b, l, accept, note) });
  audit(req.user.id, accept ? 'booking_accepted' : 'booking_declined', b.ref, ip(req));
  res.json({ ok: true });
});
r.post('/bookings/:id/status', (req, res) => {
  const b = q.get('SELECT * FROM bookings WHERE id = ? AND owner_id = ?', int(req.params.id), req.user.id);
  const next = req.body?.status;
  if (!b || !['active', 'completed'].includes(next)) return res.status(400).json({ error: 'Invalid change.' });
  if ((next === 'active' && b.status !== 'accepted') || (next === 'completed' && b.status !== 'active')) return res.status(400).json({ error: 'That change is not allowed yet.' });
  q.run('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', next, now(), b.id); res.json({ ok: true });
});

module.exports = r;
module.exports.TYPES = TYPES;
