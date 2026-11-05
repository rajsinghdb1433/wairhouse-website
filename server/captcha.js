'use strict';
// Human verification. Two modes:
//  1. Built-in (default): server-rendered, distorted SVG text challenge. Stateless signed token, single use, 5 minute life.
//  2. Cloudflare Turnstile: switches on automatically when TURNSTILE_SITE_KEY and TURNSTILE_SECRET are set.
const crypto = require('crypto');
const config = require('./config');
const { hmac, safeEqual } = require('./util');

const used = new Map(); // token nonce -> expiry (single use)
setInterval(() => { const n = Date.now(); for (const [k, v] of used) if (v < n) used.delete(k); }, 60_000).unref();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes
const rnd = (n) => crypto.randomInt(n);

function sign(answer, ts, nonce) { return hmac(`captcha|${answer}|${ts}|${nonce}`); }

function create() {
  let answer = ''; for (let i = 0; i < 5; i++) answer += ALPHABET[rnd(ALPHABET.length)];
  const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
  const token = `${ts}.${nonce}.${sign(answer, ts, nonce)}`;
  return { token, svg: render(answer) };
}

function render(text) {
  const W = 190, H = 64; let g = '';
  for (let i = 0; i < 7; i++) g += `<path d="M${rnd(W)} ${rnd(H)} Q${rnd(W)} ${rnd(H)} ${rnd(W)} ${rnd(H)}" stroke="hsl(${rnd(360)} 60% 60%)" stroke-width="${1 + rnd(2)}" fill="none" opacity=".55"/>`;
  for (let i = 0; i < 40; i++) g += `<circle cx="${rnd(W)}" cy="${rnd(H)}" r="${1 + rnd(2)}" fill="hsl(${rnd(360)} 50% 70%)" opacity=".5"/>`;
  let x = 16;
  for (const ch of text) {
    const rot = rnd(50) - 25, y = 40 + rnd(10) - 5, size = 30 + rnd(8);
    g += `<text x="${x}" y="${y}" font-family="Verdana,DejaVu Sans,sans-serif" font-weight="700" font-size="${size}" fill="hsl(${rnd(360)} 70% 78%)" transform="rotate(${rot} ${x} ${y})">${ch}</text>`;
    x += 32;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" rx="10" fill="#0d1424"/>${g}</svg>`;
}

async function verify(token, answer, remoteIp) {
  if (config.captcha.turnstileSecret) {
    if (!token) return false;
    try {
      const body = new URLSearchParams({ secret: config.captcha.turnstileSecret, response: String(token), remoteip: remoteIp || '' });
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
      const j = await r.json(); return !!j.success;
    } catch (_) { return false; }
  }
  if (typeof token !== 'string' || typeof answer !== 'string') return false;
  const parts = token.split('.'); if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts; const age = Date.now() - Number(ts);
  if (!(age >= 1500 && age < 5 * 60_000)) return false; // too fast = bot, too old = expired
  if (used.has(nonce)) return false;
  const a = answer.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!safeEqual(sig, sign(a, ts, nonce))) return false;
  used.set(nonce, Date.now() + 6 * 60_000);
  return true;
}

// Express helper: req.body.captcha_token + req.body.captcha_answer
async function check(req) { return verify(req.body?.captcha_token, req.body?.captcha_answer, req.ip); }

module.exports = { create, verify, check, turnstileSite: config.captcha.turnstileSite && config.captcha.turnstileSecret ? config.captcha.turnstileSite : '' };
