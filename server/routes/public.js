'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { q, now, getSetting, allSettings, PUBLIC_KEYS, audit } = require('../db');
const { clean, isEmail, wrap, hmac, safeEqual, int, ip } = require('../util');
const captcha = require('../captcha');
const mailer = require('../mailer');
const config = require('../config');
const geo = require('../geo');

const r = express.Router();
const PERIOD_DAYS = { day: 1, week: 7, month: 30 };

// ---------- shared listing helpers ----------
// Visitors only ever get an approximate position (a stable 150-450 m offset) and never the street address. The owner and admin views pass
// exact: true, which also includes the street address and the exact pin, so a host can see and edit what they entered.
function shapeListing(l, { full = false, exact = false } = {}) {
  if (!l) return null;
  const pin = l.lat == null || l.lng == null ? [null, null] : (exact ? [l.lat, l.lng] : geo.fuzz(l.id, l.lat, l.lng));
  const o = {
    id: l.id, slug: l.slug, title: l.title, summary: l.summary, type: l.type,
    suburb: l.suburb, state: l.state, postcode: l.postcode, lat: pin[0], lng: pin[1],
    unit: l.unit, price_cents: l.price_cents, period: l.period, capacity: l.capacity,
    total_sqm: l.total_sqm, height_m: l.height_m, min_days: l.min_days,
    features: JSON.parse(l.features || '[]'), images: JSON.parse(l.images || '[]'),
    instant_book: !!l.instant_book, insurance_included: !!l.insurance_included, featured: !!l.featured,
    rating_avg: l.rating_avg, rating_count: l.rating_count, is_demo: !!l.is_demo, status: l.status,
  };
  if (full) Object.assign(o, { description: l.description, access_hours: l.access_hours, owner_id: l.owner_id, created_at: l.created_at, views: l.views });
  if (exact) o.address_line = l.address_line;
  return o;
}
function ownerCommissionPct(ownerId) {
  const s = allSettings(); const base = parseFloat(s.owner_commission_pct) || 0;
  const slots = int(s.founding_owner_slots, 0); const months = int(s.founding_owner_months, 0);
  const o = q.get('SELECT id, created_at FROM users WHERE id = ?', ownerId); if (!o) return base;
  const rank = q.get("SELECT COUNT(*) c FROM users WHERE role='owner' AND email NOT LIKE '%@demo.wairhouse.example' AND (created_at < ? OR (created_at = ? AND id <= ?))", o.created_at, o.created_at, o.id).c;
  const within = Date.now() < o.created_at + months * 30.4 * 86400_000;
  return (rank <= slots && within) ? (parseFloat(s.founding_owner_commission_pct) || 0) : base;
}
function dayDiff(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400_000); }
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
function quote(l, start, end, qty) {
  if (!validDate(start) || !validDate(end)) throw Object.assign(new Error('Pick valid dates.'), { status: 400 });
  const days = dayDiff(start, end);
  if (days < 1) throw Object.assign(new Error('End date must be after the start date.'), { status: 400 });
  if (days < l.min_days) throw Object.assign(new Error(`This space has a ${l.min_days}-day minimum.`), { status: 400 });
  if (days > 730) throw Object.assign(new Error('Maximum booking length is 2 years. Contact us for longer.'), { status: 400 });
  if (Date.parse(start) < Date.parse(new Date().toISOString().slice(0, 10))) throw Object.assign(new Error('Start date is in the past.'), { status: 400 });
  qty = int(qty, 1, 1, l.capacity);
  const periods = Math.ceil(days / PERIOD_DAYS[l.period]);
  const subtotal = l.price_cents * qty * periods;
  const feePct = parseFloat(getSetting('service_fee_pct')) || 0; const comPct = ownerCommissionPct(l.owner_id);
  const fee = Math.round(subtotal * feePct / 100); const commission = Math.round(subtotal * comPct / 100);
  return { days, periods, quantity: qty, unit_price_cents: l.price_cents, subtotal_cents: subtotal, service_fee_cents: fee, commission_cents: commission, total_cents: subtotal + fee, payout_cents: subtotal - commission, fee_pct: feePct, commission_pct: comPct };
}
function availableQty(l, start, end) {
  const used = q.get(`SELECT COALESCE(SUM(quantity),0) n FROM bookings WHERE listing_id = ? AND status IN ('accepted','active') AND start_date < ? AND end_date > ?`, l.id, end, start).n;
  return Math.max(0, l.capacity - used);
}
function refreshRating(listingId) {
  const a = q.get("SELECT COALESCE(AVG(rating),0) avg, COUNT(*) c FROM reviews WHERE listing_id = ? AND status='published'", listingId);
  q.run('UPDATE listings SET rating_avg = ?, rating_count = ? WHERE id = ?', Math.round(a.avg * 10) / 10, a.c, listingId);
}
const demoClause = () => getSetting('show_demo_listings') === '1' ? '' : ' AND is_demo = 0';

// ---------- site ----------
r.get('/site', (req, res) => {
  const s = allSettings(); const out = {};
  for (const k of PUBLIC_KEYS) out[k] = s[k];
  const stats = {
    spaces: q.get("SELECT COUNT(*) c FROM listings WHERE status='active'" + demoClause()).c,
    cities: q.get("SELECT COUNT(DISTINCT suburb) c FROM listings WHERE status='active'" + demoClause()).c,
    sqm: Math.round(q.get("SELECT COALESCE(SUM(total_sqm),0) c FROM listings WHERE status='active'" + demoClause()).c),
  };
  const founding = { slots: int(s.founding_owner_slots, 0), taken: q.get("SELECT COUNT(*) c FROM users WHERE role='owner' AND email NOT LIKE '%@demo.wairhouse.example'").c };
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ settings: out, media: require('../media').resolveAll(), mail: mailer.configured(), stats, founding, stripe: !!config.stripe.secret && s.stripe_enabled === '1' });
});

r.get('/pages', (_req, res) => res.json({ pages: q.all("SELECT slug,title,category,updated_at FROM pages WHERE published=1 ORDER BY category, title") }));
// Placeholders such as {{business_name}} are filled from Admin > Settings, so edits there flow into every legal page.
function fillPage(body, updatedAt) {
  const s = allSettings();
  return body.replace(/{{\s*(\w+)\s*}}/g, (_m, k) => k === 'updated' ? new Date(updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : (s[k] ?? ''));
}
r.get('/pages/:slug', (req, res) => {
  const p = q.get('SELECT slug,title,body,category,version,updated_at FROM pages WHERE slug = ? AND published = 1', req.params.slug);
  if (!p) return res.status(404).json({ error: 'Page not found.' });
  p.body = fillPage(p.body, p.updated_at);
  res.set('Cache-Control', 'public, max-age=60'); res.json({ page: p });
});
r.get('/faqs', (req, res) => {
  const a = req.query.audience;
  res.json({ faqs: a ? q.all('SELECT * FROM faqs WHERE audience = ? ORDER BY sort, id', a) : q.all('SELECT * FROM faqs ORDER BY audience, sort, id') });
});

// ---------- listings ----------
r.get('/listings', (req, res) => {
  const w = ["status = 'active'" + demoClause()]; const p = [];
  const Q = clean(req.query.q, 80);
  if (Q) { const like = `%${Q.replace(/[%_]/g, '')}%`; w.push('(title LIKE ? OR summary LIKE ? OR suburb LIKE ? OR state LIKE ? OR postcode LIKE ? OR type LIKE ?)'); p.push(like, like, like, like, like, like); }
  if (req.query.type) { w.push('type = ?'); p.push(clean(req.query.type, 30)); }
  if (req.query.state) { w.push('state = ?'); p.push(clean(req.query.state, 10).toUpperCase()); }
  if (req.query.unit) { w.push('unit = ?'); p.push(clean(req.query.unit, 10)); }
  if (req.query.feature) { w.push('features LIKE ?'); p.push(`%${clean(req.query.feature, 40).replace(/[%_"]/g, '')}%`); }
  if (req.query.instant === '1') w.push('instant_book = 1');
  const norm = "(price_cents * CASE period WHEN 'day' THEN 30 WHEN 'week' THEN 4.345 ELSE 1 END)";
  if (req.query.min) { w.push(`${norm} >= ?`); p.push(int(req.query.min, 0) * 100); }
  if (req.query.max) { w.push(`${norm} <= ?`); p.push(int(req.query.max, 0) * 100); }
  const order = { price_asc: `${norm} ASC`, price_desc: `${norm} DESC`, rating: 'rating_avg DESC, rating_count DESC', newest: 'created_at DESC' }[req.query.sort] || 'featured DESC, rating_avg DESC, id DESC';
  const limit = int(req.query.limit, 24, 1, 100); const page = int(req.query.page, 1, 1, 1000);
  const where = w.join(' AND ');
  const total = q.get(`SELECT COUNT(*) c FROM listings WHERE ${where}`, ...p).c;
  const rows = q.all(`SELECT * FROM listings WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...p, limit, (page - 1) * limit);
  res.json({ listings: rows.map((l) => shapeListing(l)), total, page, pages: Math.ceil(total / limit) });
});

r.get('/listings/:slug', (req, res) => {
  const l = q.get("SELECT * FROM listings WHERE slug = ? AND status = 'active'" + demoClause(), req.params.slug);
  if (!l) return res.status(404).json({ error: 'That space is not available.' });
  q.run('UPDATE listings SET views = views + 1 WHERE id = ?', l.id);
  const owner = q.get('SELECT name, created_at, company, bio FROM users WHERE id = ?', l.owner_id);
  const reviews = q.all("SELECT r.rating, r.body, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.customer_id WHERE r.listing_id = ? AND r.status='published' ORDER BY r.created_at DESC LIMIT 20", l.id)
    .map((x) => ({ rating: x.rating, body: x.body, created_at: x.created_at, name: x.name.split(' ')[0] + ' ' + (x.name.split(' ')[1]?.[0] || '') + '.' }));
  const similar = q.all("SELECT * FROM listings WHERE status='active' AND id != ? AND (type = ? OR state = ?)" + demoClause() + ' ORDER BY rating_avg DESC LIMIT 4', l.id, l.type, l.state).map((x) => shapeListing(x));
  res.json({ listing: shapeListing(l, { full: true }), owner: { name: owner.name.split(' ')[0], since: new Date(owner.created_at).getFullYear(), company: owner.company, bio: owner.bio }, reviews, similar,
    commission_note: undefined });
});

r.post('/quote', (req, res) => {
  const l = q.get("SELECT * FROM listings WHERE id = ? AND status='active'", int(req.body?.listing_id, 0));
  if (!l) return res.status(404).json({ error: 'Space not found.' });
  try {
    const qt = quote(l, String(req.body.start_date), String(req.body.end_date), req.body.quantity);
    res.json({ quote: { ...qt, available: availableQty(l, req.body.start_date, req.body.end_date) } });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

// ---------- contact form ----------
const contactLimiter = rateLimit({ windowMs: 3600_000, limit: 6, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages from this network. Please try later.' } });
r.post('/contact', contactLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot
  const m = { name: clean(b.name, 80), email: clean(b.email, 254).toLowerCase(), phone: clean(b.phone, 30), subject: clean(b.subject, 120) || 'General enquiry', message: clean(b.message, 4000) };
  if (m.name.length < 2 || !isEmail(m.email) || m.message.length < 10) return res.status(400).json({ error: 'Please fill in your name, a valid email and a message of at least 10 characters.' });
  if (getSetting('captcha_on_contact') === '1' && !(await captcha.check(req))) { audit(null, 'captcha_failed', `/contact (${req.captchaReason})`, ip(req)); return res.status(400).json({ error: captcha.message(req), captcha: true }); }
  q.run('INSERT INTO contact_messages(name,email,phone,subject,message,created_at) VALUES(?,?,?,?,?,?)', m.name, m.email, m.phone, m.subject, m.message, now());
  mailer.queue({ to: m.email, kind: 'contact', ...mailer.T.contactReceipt(m) });
  mailer.queue({ to: getSetting('contact_email'), kind: 'admin', ...mailer.T.adminAlert(`New enquiry: ${m.subject}`, [`From ${m.name} <${m.email}> ${m.phone}`, m.message], `${config.siteUrl}/admin/inbox`) });
  audit(null, 'contact', m.email, ip(req));
  res.json({ ok: true });
}));

// ---------- owner invite landing (from outreach emails) ----------
r.get('/invite/:token', (req, res) => {
  const p = q.get('SELECT id, company, contact_name, email, suburb, state, status FROM prospects WHERE invite_token = ?', clean(req.params.token, 80));
  if (!p) return res.status(404).json({ error: 'Invite not found.' });
  if (['new', 'contacted', 'invited'].includes(p.status)) q.run("UPDATE prospects SET status='replied' WHERE id = ? AND status IN ('invited','contacted')", p.id);
  res.json({ invite: { company: p.company, contact_name: p.contact_name, email: p.email, suburb: p.suburb, state: p.state } });
});

// ---------- unsubscribe (one-click safe; HMAC protects against forgery) ----------
function doUnsub(email, sig) {
  if (!isEmail(email) || !safeEqual(sig || '', hmac('unsub|' + email.toLowerCase()))) return false;
  q.run('INSERT OR IGNORE INTO suppression(email,reason,created_at) VALUES(?,?,?)', email.toLowerCase(), 'unsubscribed', now());
  q.run("UPDATE prospects SET status='unsubscribed' WHERE email = ?", email);
  q.run('UPDATE users SET marketing_opt_in = 0 WHERE email = ?', email);
  return true;
}
r.get('/unsubscribe', (req, res) => {
  const ok = doUnsub(String(req.query.e || ''), String(req.query.s || ''));
  res.status(ok ? 200 : 400).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font:18px/1.6 -apple-system,Segoe UI,sans-serif;background:#0a0f1a;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:32px;text-align:center"><h1 style="font-size:28px">${ok ? 'You are unsubscribed' : 'That link is not valid'}</h1><p style="color:#9fb0cf">${ok ? 'We will not email you marketing messages again.' : 'Reply to any of our emails and we will remove you by hand.'}</p><a style="color:#ff6b2c" href="/">Back to wAIRhouse</a></div>`);
});
r.post('/unsubscribe', (req, res) => { doUnsub(String(req.query.e || req.body?.e || ''), String(req.query.s || req.body?.s || '')); res.json({ ok: true }); });

module.exports = { router: r, shapeListing, quote, availableQty, refreshRating, ownerCommissionPct };
