'use strict';
// Human check (captcha) and email tests. Boots the real server with the human check ON (the production default)
// and a mail "sink" (no network), then exercises sign-up, the confirm-your-email message, and the admin email connection.
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs'); const os = require('os'); const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-mail-')); const PORT = 3998; const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT, SITE_URL: BASE, DATA_DIR: dir, UPLOAD_DIR: path.join(dir, 'up'), DB_FILE: path.join(dir, 't.db'), ADMIN_PASSWORD: 'Admin-Test-Passw0rd!', SEED_DEMO: 'false', NODE_ENV: 'test', MAIL_SINK: '1', CAPTCHA_TEST_HEADER: '1' };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); console.log(c ? '  ok  ' : '  --  ', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Mail is queued without making the visitor wait, so delivery finishes just after the HTTP reply: poll briefly.
async function until(fn, ms = 4000) { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return v; await sleep(100); } }

function jar() { const c = {}; return { csrf: '', async req(m, p, body, { headers = {} } = {}) { const h = { ...headers, Cookie: Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ') }; if (this.csrf) h['X-CSRF-Token'] = this.csrf; let b = body; if (body) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); } const r = await fetch(BASE + p, { method: m, headers: h, body: b }); for (const sc of r.headers.getSetCookie?.() || []) { const [kv] = sc.split(';'); const i = kv.indexOf('='); c[kv.slice(0, i)] = kv.slice(i + 1); } const j = await r.json().catch(() => ({})); return { s: r.status, j, h: r.headers }; } }; }
// Fetch a human-check picture. The test build exposes the answer in a header (never in production).
async function challenge(j) { const r = await j.req('GET', '/api/auth/captcha'); await sleep(1150); return { captcha_token: r.j.token, captcha_answer: r.h.get('x-captcha-answer'), svg: r.j.svg }; }
const cap = (c) => ({ captcha_token: c.captcha_token, captcha_answer: c.captcha_answer });

// Plain-English mail errors (pure functions, no server needed)
{
  const { friendlyError, accountError } = require('../server/mailerrors'); const E = (props, message = 'x') => Object.assign(new Error(message), props);
  console.log('Mail error wording');
  ok(/name was not found/.test(friendlyError(E({ code: 'ENOTFOUND' }, 'getaddrinfo ENOTFOUND smtp.example.com'))), 'unknown server name (ENOTFOUND) is explained');
  ok(/name was not found/.test(friendlyError(E({}, 'getaddrinfo ENOTFOUND smtp.hostinger.com'))), 'unknown server name is explained even when the error carries no code');
  ok(/name was not found/.test(friendlyError(E({ code: 'EDNS' }, 'DNS lookup failed'))), 'a DNS failure code (EDNS) is explained');
  ok(/Could not reach/.test(friendlyError(E({ code: 'ETIMEDOUT' }, 'Connection timeout'))), 'a timeout is explained');
  ok(/Could not reach/.test(friendlyError(E({ code: 'ECONNREFUSED' }, 'connect ECONNREFUSED 10.0.0.1:465'))), 'a refused connection is explained');
  ok(/username or password/.test(friendlyError(E({ code: 'EAUTH', responseCode: 535 }, 'Invalid login: 535 5.7.8 Authentication failed'))), 'a wrong password is explained');
  ok(/no longer allows password/.test(friendlyError(E({ code: 'EAUTH', responseCode: 535 }, '535 5.7.139 Authentication unsuccessful, basic authentication is disabled'))), 'Microsoft turning off password sign-in is explained, with the way out');
  ok(friendlyError(E({ responseCode: 550 }, '550 5.1.1 Recipient address rejected: User unknown')).includes('550 5.1.1'), 'a refused recipient keeps the server wording so the admin can see why');
  ok(accountError(E({ code: 'EAUTH' })) && accountError(E({}, 'getaddrinfo ENOTFOUND x.y')) && accountError(E({ code: 'ETIMEDOUT' })), 'login, DNS and timeout problems count as account problems');
  ok(!accountError(E({ responseCode: 550 }, '550 5.1.1 User unknown')) && !accountError(null), 'one refused recipient is not blamed on the account');
}

(async () => {
  const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let log = ''; srv.stdout.on('data', (d) => log += d); srv.stderr.on('data', (d) => log += d);
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/api/site'); break; } catch (_) { await sleep(250); } }
  try {
    const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(env.DB_FILE);
    const anon = jar(); const person = { name: 'Hana Household', email: 'hana@example.com', role: 'owner', accept_terms: true, company: '' };

    console.log('Human check');
    let c = await challenge(anon);
    ok(!/<text/i.test(c.svg) && c.svg.includes('<path'), 'the picture draws letters as strokes (no readable text in the page)');
    ok(/^[A-Z]{5}$/.test(c.captcha_answer) && !/[ILOQ]/.test(c.captcha_answer), 'answer is five unambiguous capital letters');
    let r = await anon.req('POST', '/api/auth/register', { ...person, password: 'a household passphrase', captcha_token: c.captcha_token, captcha_answer: 'ZZZZZ' });
    ok(r.s === 400 && r.j.captcha === true && /did not match/.test(r.j.error), 'a wrong answer gives a clear message and asks for a new picture');
    c = await challenge(anon);
    r = await anon.req('POST', '/api/auth/register', { ...person, password: 'a household passphrase', captcha_token: c.captcha_token, captcha_answer: '' });
    ok(r.s === 400 && /Type the letters/.test(r.j.error), 'an empty answer says to type the letters');
    c = await challenge(anon);
    r = await anon.req('POST', '/api/auth/register', { ...person, password: 'short', ...cap(c) });
    ok(r.s === 400 && !r.j.captcha && /10 characters/.test(r.j.error), 'a weak password is reported as a password problem, not a human-check problem');
    r = await anon.req('POST', '/api/auth/register', { ...person, password: 'a household passphrase', ...cap(c) });
    ok(r.s === 200 && r.j.user, 'the SAME answer still works after a typo (form errors no longer use it up)');
    ok(r.j.mail === true, 'sign-up reports that email is on');
    // Sign-up signs the browser in, so every later anonymous call comes from a fresh visitor (a signed-in call must carry the CSRF token).
    const visitor = jar();
    r = await visitor.req('POST', '/api/auth/register', { ...person, email: 'other@example.com', password: 'a household passphrase', ...cap(c) });
    ok(r.s === 400 && r.j.captcha === true, 'a used answer cannot be replayed');
    r = await anon.req('POST', '/api/auth/register', { ...person, email: 'third@example.com', password: 'a household passphrase', ...cap(c) });
    ok(r.s === 403, 'a signed-in browser must send its CSRF token (the server refuses without it)');
    // an expired picture (older than 30 minutes) is told apart from a wrong one
    const secret = fs.readFileSync(path.join(dir, '.secret'), 'utf8').trim(); const old = Date.now() - 31 * 60_000; const nonce = 'abcdef0123456789';
    const sig = crypto.createHmac('sha256', secret).update(`captcha|ABCDE|${old}|${nonce}`).digest('base64url');
    r = await visitor.req('POST', '/api/auth/register', { ...person, email: 'late@example.com', password: 'a household passphrase', captcha_token: `${old}.${nonce}.${sig}`, captcha_answer: 'ABCDE' });
    ok(r.s === 400 && /timed out/.test(r.j.error), 'an old picture says it timed out');
    const aud = db.prepare("SELECT detail FROM audit_log WHERE action = 'captcha_failed' ORDER BY id DESC LIMIT 5").all().map((x) => x.detail).join(' | ');
    ok(/wrong/.test(aud) && /expired/.test(aud), 'failed human checks are noted in the security log with the reason');

    console.log('Email on sign-up');
    r = await visitor.req('GET', '/api/site'); ok(r.j.mail === true, 'the site tells the front end that email is on');
    await until(() => db.prepare("SELECT 1 FROM email_outbox WHERE to_email = 'hana@example.com' AND status = 'sent'").get());
    const welcome = db.prepare("SELECT * FROM email_outbox WHERE to_email = 'hana@example.com'").all();
    ok(welcome.length === 1 && welcome[0].kind === 'welcome' && welcome[0].status === 'sent', 'exactly one email is sent to the new member (welcome and confirm together)');
    ok(/\/verify\?token=/.test(welcome[0].html) && /Confirm my email/.test(welcome[0].html) && /cid:wairhouse-logo/.test(welcome[0].html), 'it has the confirm button, the logo and the brand layout');
    ok(/0470368696/.test(welcome[0].html) && /Raj Singh/.test(welcome[0].html), 'it carries your name and phone');
    const tok = /verify\?token=([\w-]+)/.exec(welcome[0].html)[1]; r = await visitor.req('POST', '/api/auth/verify', { token: tok }); ok(r.s === 200, 'the confirm link works');
    const adminAlert = await until(() => db.prepare("SELECT 1 FROM email_outbox WHERE kind = 'admin' AND subject LIKE '%sign-up%'").get()); ok(!!adminAlert, 'you get an email when someone joins');

    console.log('Password reset email');
    c = await challenge(visitor); r = await visitor.req('POST', '/api/auth/forgot', { email: 'hana@example.com', ...cap(c) }); ok(r.s === 200, 'forgot password accepts a correct human check');
    ok(!!(await until(() => db.prepare("SELECT 1 FROM email_outbox WHERE kind = 'reset' AND to_email = 'hana@example.com' AND status = 'sent'").get())), 'the reset email is sent');

    console.log('Admin: connect email');
    const adm = jar(); c = await challenge(adm); r = await adm.req('POST', '/api/auth/login', { email: 'raj_softdev@hotmail.com', password: env.ADMIN_PASSWORD, ...cap(c) }); ok(r.s === 200, 'admin signs in with the human check'); adm.csrf = r.j.csrf;
    r = await visitor.req('GET', '/api/admin/email-settings'); ok(r.s === 401, 'email settings need a sign-in');
    const hana = jar(); c = await challenge(hana); r = await hana.req('POST', '/api/auth/login', { email: 'hana@example.com', password: 'a household passphrase', ...cap(c) }); hana.csrf = r.j.csrf;
    r = await hana.req('GET', '/api/admin/email-settings'); ok(r.s === 403, 'only an admin can see or change email settings');
    r = await adm.req('PUT', '/api/admin/email-settings', { host: 'not a host!', port: 465, user: 'hello@wairhouse.example', pass: 'x' }); ok(r.s === 400, 'a bad mail server name is rejected');
    r = await adm.req('PUT', '/api/admin/email-settings', { host: 'smtp.hostinger.com', port: 465, user: 'hello@wairhouse.example' }); ok(r.s === 400 && /password/.test(r.j.error), 'a password is required the first time');
    const SECRET_PASS = 'Sup3r-Secret-Mailbox-Pass!';
    r = await adm.req('PUT', '/api/admin/email-settings', { host: 'smtp.hostinger.com', port: 465, secure: true, user: 'hello@wairhouse.example', pass: SECRET_PASS, from_name: 'wAIRhouse', reply_to: 'raj_softdev@hotmail.com' });
    ok(r.s === 200 && r.j.verified === true && r.j.account.source === 'admin' && r.j.account.has_password === true, 'admin saves a mailbox and the connection is tested');
    ok(!JSON.stringify(r.j).includes(SECRET_PASS), 'the password is never sent back');
    ok(r.j.account.verified === true && r.j.account.checked_at > 0, 'the page can tell the connection test passed (so "Connected" is backed by proof)');
    r = await adm.req('GET', '/api/admin/email-settings'); ok(!JSON.stringify(r.j).includes(SECRET_PASS) && r.j.account.from === 'hello@wairhouse.example' && r.j.account.reply_to === 'raj_softdev@hotmail.com', 'settings show From and Reply-to but never the password');
    r = await adm.req('GET', '/api/admin/settings'); ok(!JSON.stringify(r.j).includes(SECRET_PASS) && !JSON.stringify(r.j).includes('pass_enc'), 'the general settings API cannot leak the password either');
    const stored = db.prepare("SELECT value FROM secrets WHERE key = 'smtp_config'").get().value; ok(!stored.includes(SECRET_PASS) && /pass_enc/.test(stored), 'the password is stored encrypted in the database');
    r = await adm.req('PUT', '/api/admin/email-settings', { host: 'smtp.hostinger.com', port: 465, secure: true, user: 'hello@wairhouse.example', from: 'hello@wairhouse.example' }); ok(r.s === 200, 'saving again without retyping the password keeps the saved one');
    r = await adm.req('PUT', '/api/admin/email-settings', { host: 'smtp.attacker.example', port: 465, secure: true, user: 'hello@wairhouse.example' }); ok(r.s === 400 && /password/.test(r.j.error), 'pointing the same mailbox at a different server needs the password typed again (no silent redirect of the saved one)');
    for (const bad of ['0x7f.1', '203.0.113.5', 'localhost', 'mail']) { r = await adm.req('PUT', '/api/admin/email-settings', { host: bad, port: 25, user: 'hello@wairhouse.example', pass: 'x' }); ok(r.s === 400, `mail server "${bad}" is refused (not a real domain name)`); }
    r = await adm.req('GET', '/api/admin/email-settings'); ok(r.j.account.host === 'smtp.hostinger.com', 'refused changes leave the saved mailbox untouched');
    r = await adm.req('POST', '/api/admin/email/test', {}); ok(r.s === 200 && r.j.ok === true, 'test email is sent');
    // mail that piled up while email was off goes out in one click, without duplicates
    db.prepare("INSERT INTO email_outbox(kind,to_email,subject,html,text,status,error,created_at) VALUES('welcome','late@example.com','Waiting','<p>hi</p>','hi','not_sent','Email is not connected yet.',?)").run(Date.now());
    const before = db.prepare('SELECT COUNT(*) c FROM email_outbox').get().c;
    r = await adm.req('POST', '/api/admin/outbox/retry-unsent'); ok(r.s === 200 && r.j.sent >= 1 && r.j.failed === 0, 'waiting emails are sent in one click');
    ok(db.prepare("SELECT status FROM email_outbox WHERE to_email = 'late@example.com'").get().status === 'sent' && db.prepare('SELECT COUNT(*) c FROM email_outbox').get().c === before, 'the same outbox row is updated (no duplicates)');
    r = await adm.req('DELETE', '/api/admin/email-settings'); ok(r.s === 200, 'admin can disconnect the mailbox');
    ok(db.prepare("SELECT COUNT(*) c FROM secrets WHERE key = 'smtp_config'").get().c === 0, 'disconnecting removes the saved password');
    r = await adm.req('GET', '/api/admin/email-settings'); ok(r.j.account.verified === null, 'disconnecting also forgets the old connection test result');
    db.close();
  } catch (e) { fail++; console.log('  ERROR', e); } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log(log.slice(-1500)); process.exit(1); }
})();
