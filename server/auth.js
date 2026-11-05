'use strict';
const config = require('./config');
const { q, now, audit } = require('./db');
const { sha256, randomToken, safeEqual } = require('./util');

const COOKIE = config.secureCookies ? '__Host-wh_session' : 'wh_session';
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const ADMIN_SESSION_MS = 1000 * 60 * 60 * 8;

const cookieOpts = (maxAge) => ({ httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/', maxAge });

function createSession(req, res, user) {
  const token = randomToken(32); const csrf = randomToken(24);
  const ttl = user.role === 'admin' ? ADMIN_SESSION_MS : SESSION_MS;
  q.run('INSERT INTO sessions(user_id,token_hash,csrf,ip,ua,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
    user.id, sha256(token), csrf, req.ip || '', String(req.get('user-agent') || '').slice(0, 200), now(), now() + ttl);
  res.cookie(COOKIE, token, cookieOpts(ttl));
  return csrf;
}

function destroySession(req, res) {
  const t = req.cookies?.[COOKIE];
  if (t) q.run('DELETE FROM sessions WHERE token_hash = ?', sha256(t));
  res.clearCookie(COOKIE, { path: '/' });
}

// Loads req.user / req.session on every request (never throws).
function loadUser(req, _res, next) {
  req.user = null; req.session = null;
  const t = req.cookies?.[COOKIE];
  if (t) {
    const s = q.get('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', sha256(t), now());
    if (s) {
      const u = q.get('SELECT * FROM users WHERE id = ?', s.user_id);
      if (u && u.status === 'active') { req.user = u; req.session = s; }
    }
  }
  next();
}

// Strict CSRF defence for every state-changing /api call:
//  1. Origin/Referer must match our own site (when present)
//  2. Authenticated requests must carry the per-session token in X-CSRF-Token
//  3. SameSite=Lax cookies + JSON-only bodies as extra layers
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/stripe/webhook')) return next(); // verified by signature instead
  const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : '');
  if (origin) {
    const allowed = new Set([config.siteUrl, `${req.protocol}://${req.get('host')}`]);
    if (!allowed.has(origin)) return res.status(403).json({ error: 'Blocked: cross-site request.' });
  }
  if (req.user) {
    const sent = req.get('x-csrf-token') || '';
    if (!safeEqual(sent, req.session.csrf)) return res.status(403).json({ error: 'Session check failed. Please refresh the page.' });
  }
  next();
}

const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in.' });
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (!roles.includes(req.user.role)) { audit(req.user.id, 'forbidden', `${req.method} ${req.originalUrl}`, req.ip); return res.status(403).json({ error: 'You do not have access to this.' }); }
  next();
};

const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, company: u.company, abn: u.abn, role: u.role,
  email_verified: !!u.email_verified, totp_enabled: !!u.totp_enabled, must_change_password: !!u.must_change_password,
  marketing_opt_in: !!u.marketing_opt_in, bio: u.bio, created_at: u.created_at,
});

module.exports = { COOKIE, createSession, destroySession, loadUser, csrfGuard, requireAuth, requireRole, publicUser };
