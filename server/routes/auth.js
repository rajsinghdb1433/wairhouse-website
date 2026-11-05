'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const { q, now, audit, getSetting } = require('../db');
const { sha256, randomToken, clean, isEmail, passwordProblem, newTotpSecret, totpVerify, ip, wrap, encrypt, decrypt } = require('../util');
const { createSession, destroySession, requireAuth, publicUser } = require('../auth');
const captcha = require('../captcha');
const mailer = require('../mailer');
const config = require('../config');

const r = express.Router();
const lim = (windowMin, max, msg) => rateLimit({ windowMs: windowMin * 60_000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
const loginLimiter = lim(15, 20, 'Too many attempts. Try again in a few minutes.');
const registerLimiter = lim(60, 12, 'Too many sign-ups from this network. Try again later.');
const resetLimiter = lim(60, 8, 'Too many reset requests. Try again later.');

// A fixed dummy hash so unknown-email logins take the same time as wrong-password logins.
const DUMMY = bcrypt.hashSync('not-a-real-password', 12);
const needCaptcha = (key) => getSetting(key) === '1';

r.get('/captcha', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (captcha.turnstileSite) return res.json({ mode: 'turnstile', siteKey: captcha.turnstileSite });
  res.json({ mode: 'builtin', ...captcha.create() });
});

function makeToken(userId, kind, ttlMs) {
  q.run('DELETE FROM tokens WHERE user_id = ? AND kind = ?', userId, kind);
  const t = randomToken(32);
  q.run('INSERT INTO tokens(user_id,kind,token_hash,expires_at) VALUES(?,?,?,?)', userId, kind, sha256(t), now() + ttlMs);
  return t;
}
function useToken(token, kind) {
  const row = q.get('SELECT * FROM tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?', sha256(String(token || '')), kind, now());
  if (row) q.run('DELETE FROM tokens WHERE id = ?', row.id);
  return row;
}

r.post('/register', registerLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: pretend success to bots
  if (getSetting('registration_open') !== '1') return res.status(403).json({ error: 'Sign-ups are paused right now.' });
  const role = b.role === 'owner' ? 'owner' : 'customer';
  if (role === 'owner' && getSetting('owner_registration_open') !== '1') return res.status(403).json({ error: 'Owner sign-ups are paused right now.' });
  if (needCaptcha('captcha_on_register') && !(await captcha.check(req))) return res.status(400).json({ error: 'Human check failed. Please try the new code.', captcha: true });
  const email = clean(b.email, 254).toLowerCase(); const name = clean(b.name, 80);
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name.' });
  const pwProblem = passwordProblem(b.password, email); if (pwProblem) return res.status(400).json({ error: pwProblem });
  if (!b.accept_terms) return res.status(400).json({ error: 'Please accept the Terms and Privacy Policy.' });
  if (q.get('SELECT 1 FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
  const hash = await bcrypt.hash(b.password, 12);
  const info = q.run('INSERT INTO users(email,name,phone,company,password_hash,role,marketing_opt_in,created_at) VALUES(?,?,?,?,?,?,?,?)',
    email, name, clean(b.phone, 30), clean(b.company, 120), hash, role, b.marketing_opt_in ? 1 : 0, now());
  const uid = Number(info.lastInsertRowid);
  for (const doc of ['terms', 'privacy', ...(role === 'owner' ? ['host-agreement'] : [])]) {
    const pg = q.get('SELECT version FROM pages WHERE slug = ?', doc);
    if (pg) q.run('INSERT INTO consents(user_id,doc,version,ip,created_at) VALUES(?,?,?,?,?)', uid, doc, pg.version, ip(req), now());
  }
  // link a prospect invite, if the owner arrived from an outreach email
  if (b.invite_token) {
    const pr = q.get('SELECT id FROM prospects WHERE invite_token = ?', clean(b.invite_token, 80));
    if (pr) q.run("UPDATE prospects SET status='signed_up' WHERE id = ? AND status IN ('new','contacted','replied','invited')", pr.id);
  }
  const user = q.get('SELECT * FROM users WHERE id = ?', uid);
  mailer.queue({ to: email, kind: 'welcome', ...mailer.T.welcome(user) });
  mailer.queue({ to: email, kind: 'verify', ...mailer.T.verify(user, makeToken(uid, 'verify', 24 * 3600_000)) });
  mailer.queue({ to: getSetting('contact_email'), kind: 'admin', ...mailer.T.adminAlert(`New ${role} sign-up`, [`${name} (${email}) just joined as ${role}.`], `${config.siteUrl}/admin/users`) });
  audit(uid, 'register', role, ip(req));
  const csrf = createSession(req, res, user);
  res.json({ ok: true, user: publicUser(user), csrf });
}));

r.post('/login', loginLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 254).toLowerCase();
  if (needCaptcha('captcha_on_login') && !(await captcha.check(req))) return res.status(400).json({ error: 'Human check failed. Please try the new code.', captcha: true });
  const u = q.get('SELECT * FROM users WHERE email = ?', email);
  if (u && u.locked_until > now()) return res.status(429).json({ error: 'This account is temporarily locked after too many attempts. Try again in 15 minutes or reset your password.' });
  const ok = await bcrypt.compare(String(b.password || ''), u ? u.password_hash : DUMMY);
  if (!u || !ok) {
    if (u) {
      const fails = u.failed_logins + 1;
      q.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', fails >= 6 ? 0 : fails, fails >= 6 ? now() + 15 * 60_000 : 0, u.id);
      audit(u.id, 'login_failed', '', ip(req));
    }
    return res.status(401).json({ error: 'Email or password is not right.', captcha: true });
  }
  if (u.status !== 'active') return res.status(403).json({ error: 'This account is suspended. Contact support.' });
  if (u.totp_enabled) {
    if (!b.totp) return res.status(200).json({ need_totp: true });
    if (!totpVerify(decrypt(u.totp_secret), b.totp)) { audit(u.id, 'totp_failed', '', ip(req)); return res.status(401).json({ error: 'That 6-digit code is not right.', need_totp: true }); }
  }
  q.run('UPDATE users SET failed_logins = 0, locked_until = 0, last_login = ? WHERE id = ?', now(), u.id);
  destroySession(req, res);
  const csrf = createSession(req, res, u);
  audit(u.id, 'login', u.role, ip(req));
  res.json({ ok: true, user: publicUser(u), csrf });
}));

r.post('/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });

r.get('/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), csrf: req.session.csrf });
});

r.post('/forgot', resetLimiter, wrap(async (req, res) => {
  if (!(await captcha.check(req))) return res.status(400).json({ error: 'Human check failed. Please try the new code.', captcha: true });
  const u = q.get('SELECT * FROM users WHERE email = ?', clean(req.body?.email, 254).toLowerCase());
  if (u && u.status === 'active') mailer.queue({ to: u.email, kind: 'reset', ...mailer.T.reset(u, makeToken(u.id, 'reset', 3600_000)) });
  res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' }); // same answer either way
}));

r.post('/reset', resetLimiter, wrap(async (req, res) => {
  const t = useToken(req.body?.token, 'reset');
  if (!t) return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });
  const u = q.get('SELECT * FROM users WHERE id = ?', t.user_id);
  const problem = passwordProblem(req.body?.password, u.email); if (problem) return res.status(400).json({ error: problem });
  q.run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = 0, must_change_password = 0 WHERE id = ?', await bcrypt.hash(req.body.password, 12), u.id);
  q.run('DELETE FROM sessions WHERE user_id = ?', u.id); // log out everywhere
  audit(u.id, 'password_reset', '', ip(req));
  res.json({ ok: true });
}));

r.post('/verify', wrap(async (req, res) => {
  const t = useToken(req.body?.token, 'verify');
  if (!t) return res.status(400).json({ error: 'This link has expired.' });
  q.run('UPDATE users SET email_verified = 1 WHERE id = ?', t.user_id);
  res.json({ ok: true });
}));

r.post('/resend-verification', requireAuth, lim(60, 5, 'Slow down a little.'), (req, res) => {
  if (req.user.email_verified) return res.json({ ok: true });
  mailer.queue({ to: req.user.email, kind: 'verify', ...mailer.T.verify(req.user, makeToken(req.user.id, 'verify', 24 * 3600_000)) });
  res.json({ ok: true });
});

r.post('/change-password', requireAuth, loginLimiter, wrap(async (req, res) => {
  const u = req.user;
  if (!(await bcrypt.compare(String(req.body?.current || ''), u.password_hash))) return res.status(400).json({ error: 'Current password is not right.' });
  const problem = passwordProblem(req.body?.password, u.email); if (problem) return res.status(400).json({ error: problem });
  q.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', await bcrypt.hash(req.body.password, 12), u.id);
  q.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', u.id, req.session.id);
  audit(u.id, 'password_changed', '', ip(req));
  res.json({ ok: true });
}));

// ---- two-factor (TOTP) ----
r.post('/2fa/setup', requireAuth, wrap(async (req, res) => {
  const secret = newTotpSecret();
  q.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', encrypt(secret), req.user.id);
  const uri = `otpauth://totp/wAIRhouse:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=wAIRhouse`;
  res.json({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
}));
r.post('/2fa/enable', requireAuth, loginLimiter, (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!u.totp_secret || !totpVerify(decrypt(u.totp_secret), req.body?.code)) return res.status(400).json({ error: 'That code is not right. Check your authenticator app.' });
  q.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', u.id); audit(u.id, '2fa_enabled', '', ip(req));
  res.json({ ok: true });
});
r.post('/2fa/disable', requireAuth, loginLimiter, wrap(async (req, res) => {
  const u = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!(await bcrypt.compare(String(req.body?.password || ''), u.password_hash))) return res.status(400).json({ error: 'Password is not right.' });
  q.run("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?", u.id); audit(u.id, '2fa_disabled', '', ip(req));
  res.json({ ok: true });
}));

module.exports = r;
