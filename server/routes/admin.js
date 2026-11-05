'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, db, now, audit, allSettings, setSetting, DEFAULT_SETTINGS } = require('../db');
const { clean, int, isEmail, randomToken, wrap, ip, passwordProblem, cents } = require('../util');
const { requireRole } = require('../auth');
const { shapeListing, refreshRating } = require('./public');
const mailer = require('../mailer');
const config = require('../config');

const r = express.Router();
r.use(requireRole('admin'));
// Admin must have a strong second factor in production to touch money or users. (Soft-enforced: shown as a warning in the UI.)

const page = (req) => ({ limit: int(req.query.limit, 50, 1, 200), offset: (int(req.query.page, 1, 1, 10000) - 1) * int(req.query.limit, 50, 1, 200) });
const like = (s) => `%${clean(s, 60).replace(/[%_]/g, '')}%`;

// ---------- dashboard ----------
r.get('/stats', (_req, res) => {
  const c = (sql, ...p) => q.get(sql, ...p).c;
  const gmv = q.get("SELECT COALESCE(SUM(total_cents),0) v, COALESCE(SUM(service_fee_cents + commission_cents),0) rev FROM bookings WHERE status NOT IN ('declined','cancelled')");
  const series = q.all("SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') d, COUNT(*) n, SUM(total_cents) v FROM bookings WHERE created_at > ? GROUP BY d ORDER BY d", Date.now() - 30 * 86400_000);
  const signups = q.all("SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') d, COUNT(*) n FROM users WHERE created_at > ? GROUP BY d ORDER BY d", Date.now() - 30 * 86400_000);
  res.json({
    users: c("SELECT COUNT(*) c FROM users WHERE role='customer'"), owners: c("SELECT COUNT(*) c FROM users WHERE role='owner'"),
    listings: c('SELECT COUNT(*) c FROM listings'), live: c("SELECT COUNT(*) c FROM listings WHERE status='active'"), pending_listings: c("SELECT COUNT(*) c FROM listings WHERE status='pending'"),
    bookings: c('SELECT COUNT(*) c FROM bookings'), pending_bookings: c("SELECT COUNT(*) c FROM bookings WHERE status='pending'"),
    gmv_cents: gmv.v, revenue_cents: gmv.rev, inbox: c("SELECT COUNT(*) c FROM contact_messages WHERE status='new'"),
    prospects: c('SELECT COUNT(*) c FROM prospects'), prospects_listed: c("SELECT COUNT(*) c FROM prospects WHERE status IN ('signed_up','listed')"),
    outbox_failed: c("SELECT COUNT(*) c FROM email_outbox WHERE status IN ('failed','not_sent')"),
    smtp: mailer.configured(), stripe: !!config.stripe.secret, series, signups,
    admin_2fa: !!q.get('SELECT totp_enabled FROM users WHERE id = ?', _req.user.id).totp_enabled,
    demo_listings: c('SELECT COUNT(*) c FROM listings WHERE is_demo = 1'),
  });
});

// ---------- users ----------
r.get('/users', (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.q) { w.push('(name LIKE ? OR email LIKE ? OR company LIKE ?)'); p.push(like(req.query.q), like(req.query.q), like(req.query.q)); }
  if (req.query.role) { w.push('role = ?'); p.push(req.query.role); }
  const { limit, offset } = page(req);
  res.json({ users: q.all(`SELECT id,name,email,phone,company,role,status,email_verified,totp_enabled,created_at,last_login FROM users WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, limit, offset), total: q.get(`SELECT COUNT(*) c FROM users WHERE ${w.join(' AND ')}`, ...p).c });
});
r.patch('/users/:id', (req, res) => {
  const id = int(req.params.id); const u = q.get('SELECT * FROM users WHERE id = ?', id); if (!u) return res.status(404).json({ error: 'Not found.' });
  if (id === req.user.id && (req.body.status === 'suspended' || (req.body.role && req.body.role !== 'admin'))) return res.status(400).json({ error: 'You cannot lock yourself out.' });
  if (req.body.status && ['active', 'suspended'].includes(req.body.status)) { q.run('UPDATE users SET status = ? WHERE id = ?', req.body.status, id); if (req.body.status === 'suspended') q.run('DELETE FROM sessions WHERE user_id = ?', id); }
  if (req.body.role && ['customer', 'owner', 'admin'].includes(req.body.role)) q.run('UPDATE users SET role = ? WHERE id = ?', req.body.role, id);
  if (req.body.email_verified === true) q.run('UPDATE users SET email_verified = 1 WHERE id = ?', id);
  audit(req.user.id, 'admin_user_update', `${id} ${JSON.stringify(req.body).slice(0, 120)}`, ip(req)); res.json({ ok: true });
});
r.post('/users', wrap(async (req, res) => { // create another admin / staff account
  const b = req.body || {}; const email = clean(b.email, 254).toLowerCase();
  if (!isEmail(email) || q.get('SELECT 1 FROM users WHERE email = ?', email)) return res.status(400).json({ error: 'Enter a new, valid email.' });
  const pw = randomToken(12); const role = ['customer', 'owner', 'admin'].includes(b.role) ? b.role : 'customer';
  q.run('INSERT INTO users(email,name,password_hash,role,email_verified,must_change_password,created_at) VALUES(?,?,?,?,1,1,?)', email, clean(b.name, 80) || 'Team member', await bcrypt.hash(pw, 12), role, now());
  audit(req.user.id, 'admin_user_create', email, ip(req)); res.json({ ok: true, temp_password: pw });
}));

// ---------- listings ----------
r.get('/listings', (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.status) { w.push('l.status = ?'); p.push(req.query.status); }
  if (req.query.q) { w.push('(l.title LIKE ? OR l.suburb LIKE ?)'); p.push(like(req.query.q), like(req.query.q)); }
  const { limit, offset } = page(req);
  const rows = q.all(`SELECT l.*, u.name owner_name, u.email owner_email FROM listings l JOIN users u ON u.id = l.owner_id WHERE ${w.join(' AND ')} ORDER BY (l.status='pending') DESC, l.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  res.json({ listings: rows.map((l) => ({ ...shapeListing(l, { full: true }), owner_name: l.owner_name, owner_email: l.owner_email, rejection_reason: l.rejection_reason })) });
});
r.post('/listings/:id/decision', (req, res) => {
  const l = q.get('SELECT * FROM listings WHERE id = ?', int(req.params.id)); if (!l) return res.status(404).json({ error: 'Not found.' });
  const approve = req.body?.approve === true; const reason = clean(req.body?.reason, 400);
  q.run('UPDATE listings SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?', approve ? 'active' : 'rejected', approve ? '' : reason, now(), l.id);
  const o = q.get('SELECT email FROM users WHERE id = ?', l.owner_id); mailer.queue({ to: o.email, kind: 'listing', ...mailer.T.listingDecision(l, approve, reason) });
  audit(req.user.id, approve ? 'listing_approved' : 'listing_rejected', l.slug, ip(req)); res.json({ ok: true });
});
r.patch('/listings/:id', (req, res) => {
  const id = int(req.params.id);
  if (typeof req.body.featured === 'boolean') q.run('UPDATE listings SET featured = ? WHERE id = ?', req.body.featured ? 1 : 0, id);
  if (['active', 'paused', 'draft'].includes(req.body.status)) q.run('UPDATE listings SET status = ? WHERE id = ?', req.body.status, id);
  res.json({ ok: true });
});
r.delete('/listings/:id', (req, res) => { q.run('DELETE FROM bookings WHERE listing_id = ? AND status IN (\'declined\',\'cancelled\',\'pending\')', int(req.params.id)); try { q.run('DELETE FROM listings WHERE id = ?', int(req.params.id)); res.json({ ok: true }); } catch (_) { q.run("UPDATE listings SET status='paused' WHERE id = ?", int(req.params.id)); res.json({ ok: true, archived: true }); } });
r.post('/demo/purge', (req, res) => { // one click: remove all sample listings before launch
  const ids = q.all('SELECT id FROM listings WHERE is_demo = 1').map((x) => x.id);
  for (const id of ids) { q.run('DELETE FROM bookings WHERE listing_id = ?', id); q.run('DELETE FROM reviews WHERE listing_id = ?', id); q.run('DELETE FROM messages WHERE listing_id = ?', id); q.run('DELETE FROM listings WHERE id = ?', id); }
  q.run("DELETE FROM users WHERE email LIKE '%@demo.wairhouse.example'");
  audit(req.user.id, 'demo_purged', String(ids.length), ip(req)); res.json({ removed: ids.length });
});

// ---------- bookings, reviews ----------
r.get('/bookings', (req, res) => {
  const { limit, offset } = page(req);
  res.json({ bookings: q.all(`SELECT b.*, l.title, c.name customer_name, c.email customer_email, o.name owner_name FROM bookings b JOIN listings l ON l.id = b.listing_id JOIN users c ON c.id = b.customer_id JOIN users o ON o.id = b.owner_id ORDER BY b.id DESC LIMIT ? OFFSET ?`, limit, offset) });
});
r.patch('/bookings/:id', (req, res) => {
  const id = int(req.params.id);
  if (['pending', 'accepted', 'declined', 'active', 'completed', 'cancelled'].includes(req.body.status)) q.run('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', req.body.status, now(), id);
  if (['unpaid', 'paid', 'refunded'].includes(req.body.payment_status)) q.run('UPDATE bookings SET payment_status = ?, updated_at = ? WHERE id = ?', req.body.payment_status, now(), id);
  audit(req.user.id, 'admin_booking_update', `${id} ${JSON.stringify(req.body)}`, ip(req)); res.json({ ok: true });
});
r.get('/reviews', (_req, res) => res.json({ reviews: q.all('SELECT r.*, l.title, u.name FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.customer_id ORDER BY r.id DESC LIMIT 100') }));
r.patch('/reviews/:id', (req, res) => { const rv = q.get('SELECT * FROM reviews WHERE id = ?', int(req.params.id)); if (!rv) return res.status(404).json({ error: 'Not found.' }); q.run('UPDATE reviews SET status = ? WHERE id = ?', req.body.status === 'hidden' ? 'hidden' : 'published', rv.id); refreshRating(rv.listing_id); res.json({ ok: true }); });

// ---------- inbox ----------
r.get('/inbox', (_req, res) => res.json({ messages: q.all('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200') }));
r.patch('/inbox/:id', (req, res) => { q.run('UPDATE contact_messages SET status = ? WHERE id = ?', req.body.status === 'done' ? 'done' : 'new', int(req.params.id)); res.json({ ok: true }); });

// ---------- site settings (everything on the public site is driven from here) ----------
r.get('/settings', (_req, res) => res.json({ settings: allSettings(), smtp: { configured: mailer.configured(), host: config.mail.host, from: config.mail.from, reply_to: config.mail.replyTo }, captcha: config.captcha.turnstileSecret ? 'turnstile' : 'builtin', stripe: !!config.stripe.secret }));
r.put('/settings', (req, res) => {
  const b = req.body || {}; let n = 0;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (b[k] === undefined) continue;
    let v = String(b[k]).slice(0, 4000);
    if (/_pct$/.test(k)) { const x = parseFloat(v); if (!(x >= 0 && x <= 50)) return res.status(400).json({ error: `${k} must be between 0 and 50.` }); v = String(x); }
    if (k === 'accent_color' && !/^#[0-9a-fA-F]{6}$/.test(v)) return res.status(400).json({ error: 'Accent colour must be like #ff6b2c.' });
    if (k === 'contact_email' && !isEmail(v)) return res.status(400).json({ error: 'Enter a valid contact email.' });
    setSetting(k, v); n++;
  }
  audit(req.user.id, 'settings_updated', `${n} keys`, ip(req)); res.json({ ok: true, settings: allSettings() });
});

// ---------- legal / CMS pages ----------
r.get('/pages', (_req, res) => res.json({ pages: q.all('SELECT slug,title,category,version,published,updated_at FROM pages ORDER BY category,title') }));
r.get('/pages/:slug', (req, res) => { const p = q.get('SELECT * FROM pages WHERE slug = ?', req.params.slug); p ? res.json({ page: p }) : res.status(404).json({ error: 'Not found.' }); });
r.put('/pages/:slug', (req, res) => {
  const slug = clean(req.params.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, ''); if (!slug) return res.status(400).json({ error: 'Bad slug.' });
  const title = clean(req.body?.title, 120); const body = String(req.body?.body || '').slice(0, 100000);
  if (!title || body.length < 10) return res.status(400).json({ error: 'Title and body are required.' });
  const ex = q.get('SELECT * FROM pages WHERE slug = ?', slug);
  if (ex) q.run('UPDATE pages SET title=?, body=?, category=?, published=?, version=version+?, updated_at=? WHERE slug=?', title, body, clean(req.body?.category, 20) || ex.category, req.body?.published === false ? 0 : 1, body !== ex.body ? 1 : 0, now(), slug);
  else q.run('INSERT INTO pages(slug,title,body,category,version,published,updated_at) VALUES(?,?,?,?,1,?,?)', slug, title, body, clean(req.body?.category, 20) || 'info', req.body?.published === false ? 0 : 1, now());
  audit(req.user.id, 'page_saved', slug, ip(req)); res.json({ ok: true });
});
r.delete('/pages/:slug', (req, res) => { if (['terms', 'privacy'].includes(req.params.slug)) return res.status(400).json({ error: 'Terms and Privacy cannot be deleted.' }); q.run('DELETE FROM pages WHERE slug = ?', req.params.slug); res.json({ ok: true }); });

// ---------- FAQs ----------
r.get('/faqs', (_req, res) => res.json({ faqs: q.all('SELECT * FROM faqs ORDER BY audience, sort, id') }));
r.post('/faqs', (req, res) => { const b = req.body || {}; const info = q.run('INSERT INTO faqs(audience,question,answer,sort) VALUES(?,?,?,?)', ['customer', 'owner'].includes(b.audience) ? b.audience : 'customer', clean(b.question, 200), clean(b.answer, 2000), int(b.sort, 0)); res.json({ id: Number(info.lastInsertRowid) }); });
r.put('/faqs/:id', (req, res) => { const b = req.body || {}; q.run('UPDATE faqs SET audience=?, question=?, answer=?, sort=? WHERE id=?', ['customer', 'owner'].includes(b.audience) ? b.audience : 'customer', clean(b.question, 200), clean(b.answer, 2000), int(b.sort, 0), int(req.params.id)); res.json({ ok: true }); });
r.delete('/faqs/:id', (req, res) => { q.run('DELETE FROM faqs WHERE id = ?', int(req.params.id)); res.json({ ok: true }); });

// ---------- owner outreach: find warehouse owners, invite them to list ----------
const inviteUrl = (p) => `${config.siteUrl}/host/join?invite=${p.invite_token}`;
r.get('/prospects', (req, res) => {
  const w = ['1=1']; const p = [];
  if (req.query.status) { w.push('status = ?'); p.push(req.query.status); }
  if (req.query.q) { w.push('(company LIKE ? OR contact_name LIKE ? OR email LIKE ? OR suburb LIKE ?)'); p.push(like(req.query.q), like(req.query.q), like(req.query.q), like(req.query.q)); }
  res.json({ prospects: q.all(`SELECT * FROM prospects WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT 500`, ...p), counts: q.all('SELECT status, COUNT(*) n FROM prospects GROUP BY status') });
});
function addProspect(b) {
  const email = clean(b.email, 254).toLowerCase(); const company = clean(b.company, 120);
  if (!isEmail(email) || company.length < 2) return { error: 'Company and a valid email are required.' };
  if (q.get('SELECT 1 FROM prospects WHERE email = ?', email)) return { error: 'Already in your list.' };
  const info = q.run('INSERT INTO prospects(company,contact_name,email,phone,suburb,state,website,space_notes,notes,invite_token,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    company, clean(b.contact_name, 80), email, clean(b.phone, 30), clean(b.suburb, 60), clean(b.state, 4).toUpperCase(), clean(b.website, 200), clean(b.space_notes, 300), clean(b.notes, 800), randomToken(18), now());
  return { id: Number(info.lastInsertRowid) };
}
r.post('/prospects', (req, res) => { const o = addProspect(req.body || {}); o.error ? res.status(400).json(o) : res.json(o); });
r.post('/prospects/import', (req, res) => { // CSV text: company,contact_name,email,phone,suburb,state,website
  const lines = String(req.body?.csv || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 2000);
  let added = 0, skipped = 0;
  for (const line of lines) {
    const c = line.split(',').map((x) => x.replace(/^"|"$/g, '').trim());
    if (/^company$/i.test(c[0])) continue;
    const o = addProspect({ company: c[0], contact_name: c[1], email: c[2], phone: c[3], suburb: c[4], state: c[5], website: c[6] });
    o.error ? skipped++ : added++;
  }
  res.json({ added, skipped });
});
r.patch('/prospects/:id', (req, res) => {
  const b = req.body || {}; const id = int(req.params.id);
  if (b.status && ['new', 'contacted', 'replied', 'invited', 'signed_up', 'listed', 'declined', 'unsubscribed'].includes(b.status)) q.run('UPDATE prospects SET status = ? WHERE id = ?', b.status, id);
  if (typeof b.notes === 'string') q.run('UPDATE prospects SET notes = ? WHERE id = ?', clean(b.notes, 800), id);
  res.json({ ok: true });
});
r.delete('/prospects/:id', (req, res) => { q.run('DELETE FROM prospects WHERE id = ?', int(req.params.id)); res.json({ ok: true }); });
r.get('/prospects/:id/preview', (req, res) => {
  const p = q.get('SELECT * FROM prospects WHERE id = ?', int(req.params.id)); if (!p) return res.status(404).json({ error: 'Not found.' });
  res.json(mailer.T.ownerInvite(p, inviteUrl(p)));
});
r.post('/prospects/send', wrap(async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map((x) => int(x)).filter(Boolean).slice(0, 100);
  const results = [];
  for (const id of ids) {
    const p = q.get('SELECT * FROM prospects WHERE id = ?', id); if (!p) continue;
    if (p.status === 'unsubscribed' || q.get('SELECT 1 FROM suppression WHERE email = ?', p.email)) { results.push({ id, ok: false, error: 'Unsubscribed' }); continue; }
    if (Date.now() - p.last_contacted_at < 3 * 86400_000) { results.push({ id, ok: false, error: 'Contacted in the last 3 days' }); continue; }
    const m = mailer.T.ownerInvite(p, inviteUrl(p));
    const out = await mailer.send({ to: p.email, kind: 'outreach', marketing: true, ...m });
    if (out.ok) q.run("UPDATE prospects SET status = CASE WHEN status IN ('new') THEN 'invited' ELSE status END, last_contacted_at = ?, contact_count = contact_count + 1 WHERE id = ?", now(), id);
    results.push({ id, ok: out.ok, error: out.ok ? '' : (out.error === 'smtp_not_configured' ? 'Saved to outbox: add SMTP details to send' : out.error) });
    if (ids.length > 1) await new Promise((r2) => setTimeout(r2, 1200)); // gentle pacing protects sender reputation
  }
  audit(req.user.id, 'outreach_sent', `${results.filter((x) => x.ok).length}/${ids.length}`, ip(req)); res.json({ results });
}));

// ---------- email ----------
r.get('/outbox', (_req, res) => res.json({ emails: q.all('SELECT id,kind,to_email,subject,status,error,created_at,sent_at FROM email_outbox ORDER BY id DESC LIMIT 200'), smtp: mailer.configured() }));
r.get('/outbox/:id', (req, res) => { const e = q.get('SELECT * FROM email_outbox WHERE id = ?', int(req.params.id)); e ? res.json({ email: e }) : res.status(404).json({ error: 'Not found.' }); });
r.post('/outbox/:id/retry', wrap(async (req, res) => {
  const e = q.get('SELECT * FROM email_outbox WHERE id = ?', int(req.params.id)); if (!e) return res.status(404).json({ error: 'Not found.' });
  const out = await mailer.send({ to: e.to_email, subject: e.subject, html: e.html, text: e.text, kind: e.kind }); res.json(out);
}));
r.post('/email/test', wrap(async (req, res) => {
  const to = isEmail(req.body?.to) ? req.body.to : req.user.email;
  const out = await mailer.send({ to, kind: 'test', ...mailer.T.adminAlert('Test email from your wAIRhouse admin', ['If you can read this, email sending works.', 'This is exactly how customers and owners will see your emails.'], config.siteUrl) });
  res.json(out);
}));

r.get('/audit', (_req, res) => res.json({ log: q.all('SELECT a.*, u.email FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 300') }));

r.get('/export/:what', (req, res) => {
  const map = { users: 'SELECT id,name,email,phone,company,role,status,created_at FROM users', bookings: 'SELECT * FROM bookings', listings: 'SELECT id,slug,title,type,suburb,state,price_cents,period,status,created_at FROM listings', prospects: 'SELECT company,contact_name,email,phone,suburb,state,status,contact_count FROM prospects' };
  const sql = map[req.params.what]; if (!sql) return res.status(404).end();
  const rows = q.all(sql); if (!rows.length) return res.type('text/csv').send('');
  const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // blocks CSV formula injection
  res.type('text/csv').set('Content-Disposition', `attachment; filename="${req.params.what}.csv"`).send([Object.keys(rows[0]).join(','), ...rows.map((x) => Object.values(x).map(esc).join(','))].join('\n'));
});

// ---------- media library: photos and videos shown on the public site ----------
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const media = require('../media');
const mediaUpload = multer({ dest: path.join(config.UPLOAD_DIR, '.tmp'), limits: { fileSize: 90 * 1024 * 1024, files: 1 }, fileFilter: (_req, f, cb) => cb(null, /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(f.mimetype)) });
const rm = (f) => fs.rm(f, { force: true }, () => {});

r.get('/media', (_req, res) => {
  const cur = media.resolveAll();
  res.json({
    media: q.all('SELECT id,kind,path,title,alt,builtin,size_bytes,created_at FROM media ORDER BY kind, builtin DESC, id DESC'),
    slots: Object.entries(media.SLOTS).map(([slot, d]) => ({ slot, label: d.label, kind: d.kind, current: cur[slot], is_default: !cur[slot] || cur[slot].id === null })),
  });
});
r.post('/media', mediaUpload.single('file'), wrap(async (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP photo (up to 8 MB), or an MP4 or WebM video (up to 90 MB).' });
  const title = clean(req.body?.title, 120) || clean(f.originalname.replace(/\.[^.]+$/, ''), 120); const alt = clean(req.body?.alt, 200) || title;
  try {
    const fd = fs.openSync(f.path, 'r'); const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    const id = crypto.randomBytes(10).toString('hex'); let name, kind;
    if (f.mimetype.startsWith('image/')) {
      if (f.size > 8 * 1024 * 1024) { rm(f.path); return res.status(400).json({ error: 'Photos must be under 8 MB.' }); }
      kind = 'image'; name = `m-${id}.webp`;
      await sharp(f.path, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(config.UPLOAD_DIR, name));
    } else {
      const isMp4 = head.subarray(4, 8).toString('latin1') === 'ftyp'; const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
      if (!isMp4 && !isWebm) { rm(f.path); return res.status(400).json({ error: 'That file is not a real MP4 or WebM video.' }); }
      kind = 'video'; name = `v-${id}.${isWebm ? 'webm' : 'mp4'}`; fs.renameSync(f.path, path.join(config.UPLOAD_DIR, name));
    }
    rm(f.path);
    const size = fs.statSync(path.join(config.UPLOAD_DIR, name)).size;
    const info = q.run('INSERT INTO media(kind,path,title,alt,size_bytes,created_at) VALUES(?,?,?,?,?,?)', kind, '/uploads/' + name, title, alt, size, now());
    audit(req.user.id, 'media_uploaded', `${kind} ${name}`, ip(req));
    res.json({ item: q.get('SELECT id,kind,path,title,alt,builtin,size_bytes,created_at FROM media WHERE id = ?', Number(info.lastInsertRowid)) });
  } catch (e) { rm(f.path); return res.status(400).json({ error: 'We could not read that file. Try another one.' }); }
}));
r.patch('/media/:id', (req, res) => { q.run('UPDATE media SET title = ?, alt = ? WHERE id = ?', clean(req.body?.title, 120), clean(req.body?.alt, 200), int(req.params.id)); res.json({ ok: true }); });
r.delete('/media/:id', (req, res) => {
  const m = q.get('SELECT * FROM media WHERE id = ?', int(req.params.id)); if (!m) return res.status(404).json({ error: 'Not found.' });
  if (m.builtin) return res.status(400).json({ error: 'Built-in media cannot be deleted. Pick something else for the slot instead.' });
  media.unassignMedia(m.id); q.run('DELETE FROM media WHERE id = ?', m.id); rm(path.join(config.UPLOAD_DIR, path.basename(m.path)));
  audit(req.user.id, 'media_deleted', m.path, ip(req)); res.json({ ok: true });
});
r.put('/media-slots', (req, res) => {
  const slot = String(req.body?.slot || ''); const d = media.SLOTS[slot]; if (!d) return res.status(400).json({ error: 'Unknown placement.' });
  const id = int(req.body?.media_id, 0);
  if (id) { const m = q.get('SELECT kind FROM media WHERE id = ?', id); if (!m || (d.kind !== 'any' && m.kind !== d.kind)) return res.status(400).json({ error: `This placement needs a ${d.kind}.` }); }
  media.assign(slot, id); audit(req.user.id, 'media_slot', `${slot}=${id}`, ip(req)); res.json({ ok: true, current: media.resolveAll()[slot] });
});

module.exports = r;
