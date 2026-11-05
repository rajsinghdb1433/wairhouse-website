'use strict';
// End-to-end API smoke test: boots the real server on a temp database and walks the whole marketplace flow
// (owner lists -> admin approves -> customer books -> owner accepts) plus the main security checks.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const sharp = require('sharp');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-test-')); const PORT = 3999; const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT, SITE_URL: BASE, DATA_DIR: dir, UPLOAD_DIR: path.join(dir, 'up'), DB_FILE: path.join(dir, 't.db'), ADMIN_PASSWORD: 'Admin-Test-Passw0rd!', SEED_DEMO: 'true', NODE_ENV: 'test' };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); console.log(c ? '  ok  ' : '  --  ', m); };

function jar() { const c = {}; return { csrf: '', async req(m, p, body, { raw, headers = {} } = {}) { const h = { ...headers, Cookie: Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ') }; if (this.csrf) h['X-CSRF-Token'] = this.csrf; let b = body; if (body && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); } const r = await fetch(BASE + p, { method: m, headers: h, body: b }); for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } const j = raw ? null : await r.json().catch(() => ({})); return { s: r.status, j, h: r.headers, r }; } }; }

(async () => {
  // pre-seed: turn captcha off for the scripted flow (it is on by default and tested separately below)
  const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stdout.on('data', (d) => log += d); srv.stderr.on('data', (d) => log += d);
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/api/site'); break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); } }
  try {
    const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(env.DB_FILE); for (const k of ['captcha_on_login', 'captcha_on_register', 'captcha_on_contact']) db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k, '0'); db.close();
    console.log('Public');
    const anon = jar(); let r = await anon.req('GET', '/api/site'); ok(r.s === 200 && r.j.settings.contact_phone === '0470368696', 'site settings carry contact phone');
    ok(/default-src 'self'/.test(r.h.get('content-security-policy')) && r.h.get('x-content-type-options') === 'nosniff' && !r.h.get('x-powered-by'), 'security headers present (CSP, nosniff, no x-powered-by)');
    r = await anon.req('GET', '/api/listings'); ok(r.j.total >= 26, `sample listings visible (${r.j.total})`);
    r = await anon.req('GET', '/api/listings?type=garage'); ok(r.j.total >= 2 && r.j.listings.every((x) => x.type === 'garage'), 'household types are searchable (garage)');
    r = await anon.req('GET', '/api/listings?type=parking'); ok(r.j.total >= 2, 'car spaces and driveways are listed');
    r = await anon.req('GET', "/api/listings?q=' OR 1=1 --"); ok(r.s === 200 && r.j.total === 0, 'SQL injection attempt returns nothing');
    r = await anon.req('GET', '/api/pages/terms'); ok(r.j.page.body.includes('0470368696') && !r.j.page.body.includes('{{'), 'legal pages fill placeholders');
    r = await anon.req('GET', '/api/auth/captcha'); ok(r.j.mode === 'builtin' && r.j.svg.includes('<svg') && r.j.token, 'captcha challenge served');
    r = await anon.req('GET', '/nope', null, { raw: true }); ok(r.s === 200 && (await r.r.text()).includes('<div id="app">'), 'SPA fallback serves app shell');

    console.log('Auth + security');
    const adm = jar(); r = await adm.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: 'wrong-password' }); ok(r.s === 401, 'wrong password rejected');
    r = await adm.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: env.ADMIN_PASSWORD }); ok(r.s === 200 && r.j.user.role === 'admin', 'admin signs in'); adm.csrf = r.j.csrf;
    const noCsrf = jar(); await noCsrf.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: env.ADMIN_PASSWORD }); r = await noCsrf.req('PUT', '/api/admin/settings', { tagline: 'x' }); ok(r.s === 403, 'state-changing request without CSRF token is blocked');
    r = await adm.req('PUT', '/api/admin/settings', { tagline: 'x' }, { headers: { Origin: 'https://evil.example' } }); ok(r.s === 403, 'cross-site Origin is blocked');
    const owner = jar(); r = await owner.req('POST', '/api/auth/register', { name: 'Olive Owner', email: 'olive@example.com', password: 'short', role: 'owner', accept_terms: true }); ok(r.s === 400, 'weak password rejected');
    r = await owner.req('POST', '/api/auth/register', { name: 'Olive Owner', email: 'olive@example.com', password: 'correct horse battery', role: 'owner', company: 'Olive Storage', accept_terms: true }); ok(r.s === 200, 'owner registers'); owner.csrf = r.j.csrf;
    r = await owner.req('GET', '/api/admin/stats'); ok(r.s === 403, 'owner cannot reach admin API');
    const cust = jar(); r = await cust.req('POST', '/api/auth/register', { name: 'Cam Customer', email: 'cam@example.com', password: 'another long passphrase', role: 'customer', accept_terms: true, website: '' }); ok(r.s === 200, 'customer registers'); cust.csrf = r.j.csrf;
    r = await cust.req('POST', '/api/owner/listings', { title: 'x' }); ok(r.s === 403, 'customer cannot create listings');
    const bot = jar(); r = await bot.req('POST', '/api/auth/register', { name: 'Bot', email: 'bot@example.com', password: 'another long passphrase', accept_terms: true, website: 'http://spam' }); ok(r.s === 200 && !r.j.user, 'honeypot silently swallows bots');
    for (let i = 0; i < 7; i++) r = await jar().req('POST', '/api/auth/login', { email: 'cam@example.com', password: 'bad' + i }); r = await jar().req('POST', '/api/auth/login', { email: 'cam@example.com', password: 'another long passphrase' }); ok(r.s === 429, 'account locks after repeated failures');
    const db2 = new (require('node:sqlite').DatabaseSync)(env.DB_FILE); db2.prepare('UPDATE users SET failed_logins=0, locked_until=0').run(); db2.close();

    console.log('Marketplace flow');
    const bodyL = { title: '<script>alert(1)</script> Test Bay', type: 'warehouse', unit: 'pallet', period: 'week', price: 5, capacity: 50, suburb: 'Moorebank', state: 'NSW', postcode: '2170', min_days: 7, features: ['CCTV 24/7'], description: 'A very clean and secure test warehouse bay with forklift access.', instant_book: false };
    r = await owner.req('POST', '/api/owner/listings', bodyL); ok(r.s === 400 && /permission/i.test(r.j.error), 'listing needs the "I have permission to rent this" confirmation');
    r = await owner.req('POST', '/api/owner/listings', { ...bodyL, confirm_rights: true }); ok(r.s === 200, 'owner creates listing'); const lid = r.j.listing.id;
    const cust2 = jar(); r = await cust2.req('POST', '/api/auth/register', { name: 'Hana Household', email: 'hana@example.com', password: 'a household passphrase', role: 'customer', accept_terms: true }); cust2.csrf = r.j.csrf;
    r = await cust2.req('POST', '/api/me/become-host', {}); ok(r.s === 400, 'become-host requires accepting the owner agreement');
    r = await cust2.req('POST', '/api/me/become-host', { accept_terms: true }); ok(r.s === 200 && r.j.role === 'owner', 'a customer can start hosting with the same account');
    r = await cust2.req('POST', '/api/owner/listings', { ...bodyL, title: 'Spare room storage in Fitzroy', type: 'spare-room', unit: 'unit', period: 'month', price: 160, capacity: 1, suburb: 'Fitzroy', state: 'VIC', postcode: '3065', description: 'A dry spare room on the ground floor for boxes.', confirm_rights: true }); ok(r.s === 200 && r.j.listing.type === 'spare-room', 'household host lists a spare room');
    await cust2.req('DELETE', '/api/owner/listings/' + r.j.listing.id);
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#335' } }).png().toBuffer(); const fd = new FormData(); fd.append('images', new Blob([png], { type: 'image/png' }), 'a.png');
    r = await owner.req('POST', `/api/owner/listings/${lid}/images`, fd); ok(r.s === 200 && r.j.images[0].endsWith('.webp'), 'photo uploaded and re-encoded to webp');
    const fake = new FormData(); fake.append('images', new Blob(['<?php echo 1;'], { type: 'image/png' }), 'evil.png'); r = await owner.req('POST', `/api/owner/listings/${lid}/images`, fake); ok(r.s === 200 && r.j.images.length === 1, 'fake image file is discarded');
    r = await owner.req('POST', `/api/owner/listings/${lid}/submit`); ok(r.j.status === 'pending', 'submitted for approval');
    r = await anon.req('GET', '/api/listings?q=Test Bay'); ok(r.j.total === 0, 'pending listing is not public');
    r = await adm.req('POST', `/api/admin/listings/${lid}/decision`, { approve: true }); ok(r.s === 200, 'admin approves');
    r = await anon.req('GET', '/api/listings?q=Test Bay'); ok(r.j.total === 1, 'approved listing is public'); const slug = r.j.listings[0].slug;
    const start = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), end = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    r = await anon.req('POST', '/api/quote', { listing_id: lid, start_date: start, end_date: end, quantity: 4 }); ok(r.s === 200 && r.j.quote.total_cents > r.j.quote.subtotal_cents, `quote adds service fee ($${(r.j.quote?.total_cents / 100).toFixed(2)})`);
    r = await anon.req('POST', '/api/me/bookings', { listing_id: lid }); ok(r.s === 401, 'booking requires sign-in');
    r = await cust.req('POST', '/api/me/bookings', { listing_id: lid, start_date: start, end_date: end, quantity: 4, goods: 'Tea', accept_terms: true }); ok(r.s === 200 && r.j.booking.status === 'pending', 'customer requests booking'); const bid = r.j.booking.id;
    r = await cust.req('GET', '/api/me/bookings'); ok(!('address_line' in (r.j.bookings[0].listing || {})), 'address hidden until accepted');
    r = await owner.req('POST', `/api/owner/bookings/${bid}/decision`, { accept: true }); ok(r.s === 200, 'owner accepts');
    r = await cust.req('GET', '/api/me/bookings'); ok(r.j.bookings[0].status === 'accepted', 'customer sees accepted');
    r = await cust.req('POST', `/api/owner/bookings/${bid}/decision`, { accept: false }); ok(r.s === 403, 'customer cannot decide bookings');
    r = await cust.req('POST', '/api/me/messages', { listing_id: lid, body: 'Hello there' }); ok(r.s === 200, 'customer messages owner'); r = await owner.req('GET', '/api/me/messages'); ok(r.j.threads.length === 1 && r.j.threads[0].unread === 1, 'owner sees unread message');
    r = await cust.req('POST', `/api/me/bookings/${bid}/review`, { rating: 5, body: 'Great' }); ok(r.s === 200, 'customer reviews'); r = await anon.req('GET', '/api/listings/' + slug); ok(r.j.listing.rating_count === 1, 'rating shows on listing');

    console.log('Admin + outreach');
    r = await adm.req('GET', '/api/admin/stats'); ok(r.j.bookings === 1 && r.j.owners >= 6, 'admin stats');
    r = await adm.req('POST', '/api/admin/prospects', { company: 'Big Shed Pty Ltd', contact_name: 'Sam', email: 'sam@bigshed.example', suburb: 'Eastern Creek', state: 'NSW' }); ok(r.s === 200, 'admin adds prospect'); const pid = r.j.id;
    r = await adm.req('GET', `/api/admin/prospects/${pid}/preview`); ok(r.j.html.includes('wairhouse-logo') && r.j.html.includes('Raj Singh') && r.j.html.includes('0470368696') && r.j.html.includes('Unsubscribe'), 'invite email has logo, signature and unsubscribe');
    r = await adm.req('POST', '/api/admin/prospects/send', { ids: [pid] }); ok(r.s === 200 && /Saved to outbox|ok/.test(JSON.stringify(r.j)) || r.j.results.length === 1, 'outreach send stores to outbox when SMTP is not set');
    const m = r.j; r = await adm.req('GET', '/api/admin/outbox'); ok(r.j.emails.some((e) => e.to_email === 'sam@bigshed.example'), 'email recorded in outbox');
    const unsub = /unsubscribe\?e=[^"\s]+/.exec((await adm.req('GET', '/api/admin/outbox/' + r.j.emails.find((e) => e.to_email === 'sam@bigshed.example').id)).j.email.html.replace(/&amp;/g, '&'))[0];
    r = await anon.req('GET', '/api/' + unsub, null, { raw: true }); ok(r.s === 200, 'one-click unsubscribe works'); r = await adm.req('POST', '/api/admin/prospects/send', { ids: [pid] }); ok(r.j.results[0].ok === false, 'unsubscribed owners are never emailed again');
    r = await anon.req('GET', '/api/unsubscribe?e=x@y.com&s=forged', null, { raw: true }); ok(r.s === 400, 'forged unsubscribe link rejected');
    r = await adm.req('PUT', '/api/admin/settings', { contact_phone: '0400 111 222' }); ok(r.s === 200, 'admin edits phone'); r = await anon.req('GET', '/api/site'); ok(r.j.settings.contact_phone === '0400 111 222', 'phone updates site-wide instantly'); await adm.req('PUT', '/api/admin/settings', { contact_phone: '0470368696' });
    r = await adm.req('PUT', '/api/admin/pages/terms', { title: 'Terms of Service', body: '# Terms\n\nEdited by admin {{contact_email}}' }); r = await anon.req('GET', '/api/pages/terms'); ok(r.j.page.version === 2 && r.j.page.body.includes('raj_softdev@hotmail.com'), 'legal page edit bumps version');
    r = await adm.req('PUT', '/api/admin/settings', { service_fee_pct: '99' }); ok(r.s === 400, 'invalid fee rejected');
    r = await anon.req('POST', '/api/contact', { name: 'Jo', email: 'jo@example.com', message: 'Hello, I would like to know more.' }); ok(r.s === 200, 'contact form works'); r = await adm.req('GET', '/api/admin/inbox'); ok(r.j.messages.length === 1, 'enquiry reaches admin inbox');
    const csv = await adm.req('GET', '/api/admin/export/users', null, { raw: true }); ok(csv.s === 200 && (await csv.r.text()).includes('olive@example.com'), 'CSV export works');
    r = await adm.req('POST', '/api/admin/demo/purge'); ok(r.j.removed >= 16, 'one-click sample data purge'); r = await anon.req('GET', '/api/listings'); ok(r.j.total === 1, 'only the real listing remains');
    r = await adm.req('POST', '/api/auth/logout'); r = await adm.req('GET', '/api/admin/stats'); ok(r.s === 401, 'logout kills the session');
  } catch (e) { fail++; console.log('  ERROR', e); } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})();
