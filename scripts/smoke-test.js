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
    {
      // Code is served from a build-stamped address so a new deploy reaches visitors at once (not a copy cached for days).
      const rawGet = (p) => new Promise((resolve, reject) => require('http').get({ host: '127.0.0.1', port: PORT, path: p }, (res) => { let b = ''; res.on('data', (d) => b += d); res.on('end', () => resolve({ s: res.statusCode, b, h: res.headers })); }).on('error', reject));
      const shell = (await rawGet('/')).b; const js = shell.match(/\/v\/([a-z0-9]+)\/js\/app\.js/); const css = shell.match(/\/v\/([a-z0-9]+)\/css\/app\.css/);
      ok(!!js && !!css && js[1] === css[1] && !shell.includes('__BUILD__'), 'the page loads its code from a build-stamped address');
      let a = await rawGet(`/v/${js[1]}/js/lib.js`); ok(a.s === 200 && /javascript/.test(a.h['content-type']) && a.b.includes('captchaHtml'), 'the stamped address serves the real file');
      a = await rawGet(`/v/${js[1]}/js/pages/auth.js`); ok(a.s === 200, 'sub-modules load through the same stamp (all imports are relative)');
      a = await rawGet(`/v/${js[1]}/css/app.css`); ok(a.s === 200 && /text\/css/.test(a.h['content-type']), 'the stylesheet loads through the stamp');
      ok(/<script src="\/v\/[a-z0-9]+\/js\/theme-init\.js"><\/script>\s*<link rel="stylesheet" href="\/v\/[a-z0-9]+\/css\/app\.css">/.test(shell), 'a small script applies the saved theme before the stylesheet paints (no flash of the wrong theme)');
      const ti = await rawGet(`/v/${js[1]}/js/theme-init.js`); ok(ti.s === 200 && /javascript/.test(ti.h['content-type']) && /data-theme/.test(ti.b) && /wh_theme/.test(ti.b) && !/\bimport\b|\bexport\b/.test(ti.b), 'the theme script is served and is a plain script (it must run before modules load)');
      ok(/:root\[data-theme="light"\]/.test(a.b) && /\.theme-toggle/.test(a.b) && /\.sm-bar/.test(a.b), 'the stylesheet carries the light theme and the switch');
      const tj = await rawGet(`/v/${js[1]}/js/theme.js`); ok(tj.s === 200 && /export function setTheme/.test(tj.b), 'the theme module is served');
      a = await rawGet('/v/0123456789/js/lib.js'); ok(a.s === 200 && !/immutable/.test(a.h['cache-control'] || ''), 'a page opened just before a deploy still works, and its copy is not kept for long');
      for (const bad of [`/v/${js[1]}/js/../../server/index.js`, `/v/${js[1]}/js/%2e%2e/%2e%2e/server/index.js`, `/v/${js[1]}/js/..%5c..%5cserver/index.js`, `/v/${js[1]}/uploads/x`, `/v/${js[1]}/server/index.js`]) { a = await rawGet(bad); ok((a.s !== 200 || a.b.includes('<div id="app">')) && !a.b.includes('require(') && !a.b.includes("'use strict'"), `stamped address never returns server files (${bad.replace(js[1], 'BUILD').slice(0, 52)})`); }
      a = await rawGet('/js/lib.js'); ok(a.s === 200 && /no-cache/.test(a.h['cache-control'] || ''), 'the plain address is always re-checked, never trusted from cache');
    }

    console.log('Auth + security');
    const adm = jar(); r = await adm.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: 'wrong-password' }); ok(r.s === 401, 'wrong password rejected');
    r = await adm.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: env.ADMIN_PASSWORD }); ok(r.s === 200 && r.j.user.role === 'admin', 'admin signs in'); adm.csrf = r.j.csrf;
    const noCsrf = jar(); await noCsrf.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: env.ADMIN_PASSWORD }); r = await noCsrf.req('PUT', '/api/admin/settings', { tagline: 'x' }); ok(r.s === 403, 'state-changing request without CSRF token is blocked');
    r = await adm.req('PUT', '/api/admin/settings', { tagline: 'x' }, { headers: { Origin: 'https://evil.example' } }); ok(r.s === 403, 'cross-site Origin is blocked');
    const owner = jar(); r = await owner.req('POST', '/api/auth/register', { name: 'Olive Owner', email: 'olive@example.com', password: 'short', role: 'owner', accept_terms: true }); ok(r.s === 400, 'weak password rejected');
    r = await owner.req('POST', '/api/auth/register', { name: 'Olive Owner', email: 'olive@example.com', password: 'correct horse battery', role: 'owner', company: 'Olive Storage', accept_terms: true }); ok(r.s === 200, 'owner registers'); owner.csrf = r.j.csrf;
    ok(r.j.mail === false, 'sign-up works with no mailbox connected and tells the page that email is off');
    r = await owner.req('GET', '/api/admin/stats'); ok(r.s === 403, 'owner cannot reach admin API');
    const cust = jar(); r = await cust.req('POST', '/api/auth/register', { name: 'Cam Customer', email: 'cam@example.com', password: 'another long passphrase', role: 'customer', accept_terms: true, website: '' }); ok(r.s === 200, 'customer registers'); cust.csrf = r.j.csrf;
    r = await cust.req('POST', '/api/owner/listings', { title: 'x' }); ok(r.s === 403, 'customer cannot create listings');
    const bot = jar(); r = await bot.req('POST', '/api/auth/register', { name: 'Bot', email: 'bot@example.com', password: 'another long passphrase', accept_terms: true, website: 'http://spam' }); ok(r.s === 200 && !r.j.user, 'honeypot silently swallows bots');
    for (let i = 0; i < 7; i++) r = await jar().req('POST', '/api/auth/login', { email: 'cam@example.com', password: 'bad' + i }); r = await jar().req('POST', '/api/auth/login', { email: 'cam@example.com', password: 'another long passphrase' }); ok(r.s === 429, 'account locks after repeated failures');
    const db2 = new (require('node:sqlite').DatabaseSync)(env.DB_FILE); db2.prepare('UPDATE users SET failed_logins=0, locked_until=0').run();
    const waiting = db2.prepare("SELECT status FROM email_outbox WHERE to_email = 'olive@example.com'").all();
    ok(waiting.length === 1 && waiting[0].status === 'not_sent', 'with no mailbox, the one welcome email waits in the outbox (not lost, not duplicated)');
    db2.close();

    console.log('Marketplace flow');
    const bodyL = { title: '<script>alert(1)</script> Test Bay', type: 'warehouse', unit: 'pallet', period: 'week', price: 5, capacity: 50, suburb: 'Moorebank', state: 'NSW', postcode: '2170', address_line: '12 Secret Street', min_days: 7, features: ['CCTV 24/7'], description: 'A very clean and secure test warehouse bay with forklift access.', instant_book: false };
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
    {
      console.log('Map position and privacy');
      const metres = (a, b) => { const k = Math.PI / 180, dLat = (b.lat - a.lat) * 111320, dLng = (b.lng - a.lng) * 111320 * Math.cos(a.lat * k); return Math.sqrt(dLat * dLat + dLng * dLng); };
      const near = (p, lat, lng, tol = 0.05) => p.lat != null && Math.abs(p.lat - lat) < tol && Math.abs(p.lng - lng) < tol;
      const host = (await owner.req('GET', `/api/owner/listings/${lid}`)).j.listing;
      ok(near(host, -33.94, 150.92, 0.1), 'a listing saved without a map pin is placed from its suburb and postcode (Moorebank 2170)');
      ok(host.address_line === '12 Secret Street', 'the host still sees their own street address');
      r = await anon.req('GET', '/api/listings/' + slug); const pub = r.j.listing;
      ok(pub.lat != null && !('address_line' in pub) && !JSON.stringify(r.j).includes('Secret Street'), 'the public listing page never carries the street address');
      const off = metres(host, pub); ok(off >= 120 && off <= 500, `visitors get an approximate pin, not the real one (${Math.round(off)} m away)`);
      r = await anon.req('GET', '/api/listings?q=Test Bay'); ok(r.j.listings[0].lat === pub.lat && r.j.listings[0].lng === pub.lng && !JSON.stringify(r.j).includes('Secret Street'), 'search results use the same approximate pin and carry no street address');
      r = await anon.req('GET', '/api/listings/' + slug); ok(r.j.listing.lat === pub.lat, 'the approximate pin is stable between visits (it cannot be averaged out)');
      // a throwaway listing to try the placement rules without disturbing the booking flow below
      const base = { ...bodyL, title: 'Map position test bay', suburb: 'Caddens', postcode: '2747', address_line: '5 Hidden Lane' };
      const made = await owner.req('POST', '/api/owner/listings', { ...base, confirm_rights: true }); const tid = made.j.listing.id;
      ok(near(made.j.listing, -33.7745, 150.737, 0.01), 'Caddens 2747 is placed in Caddens');
      let u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, lat: -33.80, lng: 150.70 }); ok(u.j.listing.lat === -33.8 && u.j.listing.lng === 150.7, 'a pin the host places is kept exactly');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, lat: -33.80, lng: 150.70 }); ok(u.j.listing.lat === -33.8, 'saving again with nothing changed keeps the pin');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, suburb: 'caddens', lat: -33.80, lng: 150.70 }); ok(u.j.listing.lat === -33.8, 'a change of letter case in the suburb does not undo the host\'s pin');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, suburb: 'Fitzroy', state: 'VIC', postcode: '3065', lat: -33.80, lng: 150.70 }); ok(near(u.j.listing, -37.7975, 144.9805, 0.05), 'moving the suburb without moving the pin takes the pin to the new suburb');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, suburb: 'Fitzroy', state: 'VIC', postcode: '3065', lat: -37.9, lng: 145.0 }); ok(u.j.listing.lat === -37.9, 'a pin moved by the host is kept even in a new suburb');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, suburb: 'Nowhere', state: 'NSW', postcode: '9999', lat: -37.9, lng: 145.0 }); ok(u.j.listing.lat === null, 'a place that cannot be found drops the old pin rather than leave it in the wrong suburb');
      u = await owner.req('PUT', `/api/owner/listings/${tid}`, { ...base, suburb: 'Caddens', state: 'NSW', postcode: '2747', lat: 10, lng: 10 }); ok(near(u.j.listing, -33.7745, 150.737, 0.01), 'a pin outside Australia (a stray click or 0,0) is ignored and the suburb is used instead');
      let loc = await owner.req('GET', '/api/owner/locate?suburb=Mt%20Druitt&state=NSW&postcode=2770'); ok(loc.j.found && near(loc.j, -33.77, 150.82, 0.05), 'the form can ask where a suburb is (Mt Druitt = Mount Druitt)');
      loc = await owner.req('GET', '/api/owner/locate?suburb=Nowhere&state=NSW&postcode=9999'); ok(loc.j.found === false, 'an unknown place is reported as not found (a postcode from another state is not used)');
      loc = await anon.req('GET', '/api/owner/locate?suburb=Caddens&state=NSW&postcode=2747'); ok(loc.s === 401, 'the locate helper needs a sign-in');
      await owner.req('DELETE', `/api/owner/listings/${tid}`);
      // listings saved before pins were automatic (no position) are placed at start-up, and an existing pin is never moved
      process.env.DATA_DIR = dir; process.env.UPLOAD_DIR = path.join(dir, 'up'); const geo = require('../server/geo');
      const dbx = new DatabaseSync(env.DB_FILE); const fq = { all: (sql, ...a) => dbx.prepare(sql).all(...a), run: (sql, ...a) => dbx.prepare(sql).run(...a) };
      dbx.prepare('UPDATE listings SET lat = NULL, lng = NULL WHERE id = ?').run(lid);
      const placed = geo.backfill(fq); const after = dbx.prepare('SELECT lat, lng FROM listings WHERE id = ?').get(lid);
      ok(placed >= 1 && near(after, -33.94, 150.92, 0.1), 'listings with no position are placed on the map at start-up');
      geo.backfill(fq); const again = dbx.prepare('SELECT lat, lng FROM listings WHERE id = ?').get(lid); ok(again.lat === after.lat && again.lng === after.lng, 'start-up placement never moves a pin that is already set');
      dbx.prepare('UPDATE listings SET lat = 0, lng = 0 WHERE id = ?').run(lid); // a pin in the sea off Africa: certainly wrong for an Australian space
      const fixed = geo.backfill(fq); const repaired = dbx.prepare('SELECT lat, lng FROM listings WHERE id = ?').get(lid);
      ok(fixed >= 1 && near(repaired, -33.94, 150.92, 0.1), 'a pin outside Australia is repaired from the suburb at start-up');
      dbx.close();
      ok(!geo.inAustralia(0, 0) && !geo.inAustralia(NaN, 150) && !geo.inAustralia(null, null) && geo.inAustralia(-33.7, 150.7) && geo.inAustralia(-42.9, 147.3), 'Australia box: 0,0 and blanks are out, Sydney and Hobart are in');
      ok(geo.stats().places > 17000 && geo.stats().postcodes > 2500, 'the built-in locality list is loaded');
      ok(geo.locate({ suburb: 'Caddens', state: 'NSW', postcode: '2747' }).how === 'suburb' && geo.locate({ suburb: 'Zzyzx Heights', state: 'NSW', postcode: '2747' }).how === 'postcode' && geo.locate({ suburb: 'x', state: 'NSW', postcode: '9999' }) === null, 'lookup: exact suburb, else middle of the postcode, else nothing');
      const wrongPc = geo.locate({ suburb: 'CADDENS', state: 'NSW', postcode: '2750' }); ok(wrongPc.how === 'suburb' && near(wrongPc, -33.7745, 150.737, 0.01), 'a suburb typed with the wrong postcode is still placed by its name when the name means one place in that state');
      ok(geo.locate({ suburb: 'Broadway', state: 'NSW', postcode: '9999' }) === null, 'but an ambiguous name (Broadway NSW is two places) with an unknown postcode is not guessed');
    }
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
    console.log('Photos and videos');
    r = await anon.req('GET', '/api/site'); ok(r.j.media.home_intro_image?.url === '/video/family-garden.mp4' && r.j.media.home_showcase_video?.kind === 'video', 'site serves built-in placements by default');
    r = await owner.req('GET', '/api/admin/media'); ok(r.s === 403, 'only admins can open the media library');
    const pj = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#a33' } }).jpeg().toBuffer(); let mf = new FormData(); mf.append('file', new Blob([pj], { type: 'image/jpeg' }), 'hero.jpg'); mf.append('title', 'Test hero');
    r = await adm.req('POST', '/api/admin/media', mf); ok(r.s === 200 && r.j.item.path.endsWith('.webp') && r.j.item.kind === 'image', 'admin uploads a photo (re-encoded to webp)'); const imgId = r.j.item.id; const imgPath = r.j.item.path;
    r = await anon.req('GET', imgPath, null, { raw: true }); ok(r.s === 200 && /image\/webp/.test(r.h.get('content-type')), 'uploaded photo is publicly served');
    r = await adm.req('PUT', '/api/admin/media-slots', { slot: 'home_intro_image', media_id: imgId }); ok(r.s === 200, 'admin places the photo on the home page');
    r = await anon.req('GET', '/api/site'); ok(r.j.media.home_intro_image.url === imgPath, 'customers see the new photo through the site API');
    r = await adm.req('PUT', '/api/admin/media-slots', { slot: 'home_showcase_video', media_id: imgId }); ok(r.s === 400, 'a photo cannot be placed in a video slot');
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(200)]); mf = new FormData(); mf.append('file', new Blob([mp4], { type: 'video/mp4' }), 'tour.mp4');
    r = await adm.req('POST', '/api/admin/media', mf); ok(r.s === 200 && r.j.item.kind === 'video' && r.j.item.path.endsWith('.mp4'), 'admin uploads a video'); const vidId = r.j.item.id;
    r = await adm.req('PUT', '/api/admin/media-slots', { slot: 'home_hero_video', media_id: vidId }); r = await anon.req('GET', '/api/site'); ok(r.j.media.home_hero_video?.kind === 'video', 'customers see the new hero video');
    mf = new FormData(); mf.append('file', new Blob(['not a video at all'], { type: 'video/mp4' }), 'evil.mp4'); r = await adm.req('POST', '/api/admin/media', mf); ok(r.s === 400, 'a fake video file is rejected');
    mf = new FormData(); mf.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html'); r = await adm.req('POST', '/api/admin/media', mf); ok(r.s === 400, 'non-media file types are rejected');
    r = await adm.req('DELETE', '/api/admin/media/' + imgId); ok(r.s === 200, 'admin deletes an upload'); r = await anon.req('GET', '/api/site'); ok(r.j.media.home_intro_image.url === '/video/family-garden.mp4', 'deleting reverts the slot to the built-in default');
    r = await adm.req('GET', '/api/admin/media'); const builtin = r.j.media.find((m) => m.builtin); r = await adm.req('DELETE', '/api/admin/media/' + builtin.id); ok(r.s === 400, 'built-in media cannot be deleted');
    r = await adm.req('POST', '/api/admin/demo/purge'); ok(r.j.removed >= 16, 'one-click sample data purge'); r = await anon.req('GET', '/api/listings'); ok(r.j.total === 1, 'only the real listing remains');
    r = await adm.req('POST', '/api/auth/logout'); r = await adm.req('GET', '/api/admin/stats'); ok(r.s === 401, 'logout kills the session');
  } catch (e) { fail++; console.log('  ERROR', e); } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})();
