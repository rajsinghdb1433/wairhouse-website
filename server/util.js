'use strict';
const crypto = require('crypto');
const config = require('./config');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const hmac = (s) => crypto.createHmac('sha256', config.secret).update(String(s)).digest('base64url');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// AES-256-GCM for sensitive-at-rest fields such as payout details.
const aesKey = crypto.createHash('sha256').update('enc:' + config.secret).digest();
function encrypt(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(blob) {
  if (!blob) return '';
  try {
    const b = Buffer.from(blob, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', aesKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (_) { return ''; }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max = 500) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const isEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(s);
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'space';
const cents = (n) => Math.max(0, Math.round(Number(n) || 0));
const money = (c, cur = 'AUD') => new Intl.NumberFormat('en-AU', { style: 'currency', currency: cur }).format((c || 0) / 100);
const int = (v, d = 0, min = -Infinity, max = Infinity) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

// Password policy: length + not trivially common. No composition theatre.
const COMMON = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwertyuiop', 'iloveyou1', 'welcome123', 'admin12345', 'letmein123', 'wairhouse', 'warehouse']);
function passwordProblem(pw, email = '') {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 128) return 'Password is too long.';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 'That password is too common. Try a short phrase instead.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Do not use your email in your password.';
  return '';
}

// RFC 6238 TOTP (SHA1, 30s, 6 digits) with base32 secrets for authenticator apps.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; }
function unbase32(s) { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
const newTotpSecret = () => base32(crypto.randomBytes(20));
function totpAt(secret, t) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(t / 30)));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000;
  return String(code).padStart(6, '0');
}
function totpVerify(secret, code) {
  const c = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(c) || !secret) return false;
  const t = Math.floor(Date.now() / 1000);
  return [-30, 0, 30].some((d) => safeEqual(totpAt(secret, t + d), c));
}

const ip = (req) => req.ip || req.socket?.remoteAddress || '';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { sha256, randomToken, hmac, safeEqual, encrypt, decrypt, esc, clean, isEmail, slugify, cents, money, int, passwordProblem, newTotpSecret, totpVerify, ip, wrap };
