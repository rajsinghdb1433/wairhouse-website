'use strict';
// Human verification. Two modes:
//  1. Built-in (default): server-rendered, distorted SVG letters. Stateless signed token, single use, 30 minute life.
//  2. Cloudflare Turnstile: switches on automatically when TURNSTILE_SITE_KEY and TURNSTILE_SECRET are set.
const crypto = require('crypto');
const config = require('./config');
const { hmac, safeEqual } = require('./util');

const used = new Map(); // token nonce -> expiry (single use)
setInterval(() => { const n = Date.now(); for (const [k, v] of used) if (v < n) used.delete(k); }, 60_000).unref();

const ALPHABET = 'ABCDEFGHJKMNPRSTUVWXYZ'; // letters only, no look-alikes (no I, L, O, Q)
const LENGTH = 5;
const MIN_AGE = 1000;            // faster than a human can read and type
const MAX_AGE = 30 * 60_000;     // people fill long forms slowly
const rnd = (n) => crypto.randomInt(n);

const sign = (answer, ts, nonce) => hmac(`captcha|${answer}|${ts}|${nonce}`);

// Returns { token, svg, answer }. The route sends only token + svg to the browser.
function create() {
  let answer = ''; for (let i = 0; i < LENGTH; i++) answer += ALPHABET[rnd(ALPHABET.length)];
  const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
  return { token: `${ts}.${nonce}.${sign(answer, ts, nonce)}`, svg: render(answer), answer };
}

// Letters are drawn as vector strokes (a tiny built-in stroke font), never as <text>, so the answer is not sitting in the page
// markup for a script to read, and no system fonts are needed on the server. Each letter is rotated and jittered.
const GLYPHS = {
  A: [[[0, 14], [5, 0], [10, 14]], [[2, 9], [8, 9]]],
  B: [[[0, 14], [0, 0], [6, 0], [9, 2], [9, 5], [6, 7], [0, 7]], [[6, 7], [10, 9], [10, 12], [7, 14], [0, 14]]],
  C: [[[10, 3], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [10, 11]]],
  D: [[[0, 0], [0, 14], [5, 14], [9, 11], [10, 7], [9, 3], [5, 0], [0, 0]]],
  E: [[[10, 0], [0, 0], [0, 14], [10, 14]], [[0, 7], [7, 7]]],
  F: [[[10, 0], [0, 0], [0, 14]], [[0, 7], [7, 7]]],
  G: [[[10, 3], [7, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7, 14], [10, 11], [10, 8], [6, 8]]],
  H: [[[0, 0], [0, 14]], [[10, 0], [10, 14]], [[0, 7], [10, 7]]],
  J: [[[10, 0], [10, 11], [7, 14], [3, 14], [0, 11]]],
  K: [[[0, 0], [0, 14]], [[10, 0], [0, 8]], [[3, 6], [10, 14]]],
  M: [[[0, 14], [0, 0], [5, 8], [10, 0], [10, 14]]],
  N: [[[0, 14], [0, 0], [10, 14], [10, 0]]],
  P: [[[0, 14], [0, 0], [7, 0], [10, 2], [10, 6], [7, 8], [0, 8]]],
  R: [[[0, 14], [0, 0], [7, 0], [10, 2], [10, 6], [7, 8], [0, 8]], [[5, 8], [10, 14]]],
  S: [[[10, 2], [7, 0], [3, 0], [0, 2], [0, 5], [3, 7], [7, 7], [10, 9], [10, 12], [7, 14], [3, 14], [0, 12]]],
  T: [[[0, 0], [10, 0]], [[5, 0], [5, 14]]],
  U: [[[0, 0], [0, 11], [3, 14], [7, 14], [10, 11], [10, 0]]],
  V: [[[0, 0], [5, 14], [10, 0]]],
  W: [[[0, 0], [2.5, 14], [5, 6], [7.5, 14], [10, 0]]],
  X: [[[0, 0], [10, 14]], [[10, 0], [0, 14]]],
  Y: [[[0, 0], [5, 7], [10, 0]], [[5, 7], [5, 14]]],
  Z: [[[0, 0], [10, 0], [0, 14], [10, 14]]],
};
function render(text) {
  const W = 220, H = 72; let g = '';
  const path = (pts, stroke, w, op) => `<path d="M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
  for (let i = 0; i < 3; i++) g += path([[rnd(W), rnd(H)], [rnd(W), rnd(H)], [rnd(W), rnd(H)]], `hsl(${rnd(360)} 55% 62%)`, 1.2, 0.35);
  for (let i = 0; i < 20; i++) g += `<circle cx="${rnd(W)}" cy="${rnd(H)}" r="${1 + rnd(2)}" fill="hsl(${rnd(360)} 50% 70%)" opacity=".45"/>`;
  let x = 16;
  for (const ch of text) {
    const rot = ((rnd(25) - 12) * Math.PI) / 180, sc = 2.8 + rnd(4) / 10, ox = x + 16, oy = 36 + rnd(7) - 3, color = `hsl(${rnd(360)} 75% 82%)`;
    const cos = Math.cos(rot), sin = Math.sin(rot), jit = () => (rnd(11) - 5) / 10;
    for (const stroke of GLYPHS[ch]) {
      g += path(stroke.map(([px, py]) => { const dx = (px + jit() - 5) * sc, dy = (py + jit() - 7) * sc; return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos]; }), color, 3.4, 1);
    }
    x += 40;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Human check: type the five letters shown"><rect width="100%" height="100%" rx="10" fill="#0d1424"/>${g}</svg>`;
}

// Returns 'ok' or the reason it failed: 'missing' | 'expired' | 'wrong'
async function verifyReason(token, answer, remoteIp) {
  if (config.captcha.turnstileSecret) {
    if (!token) return 'missing';
    try {
      const body = new URLSearchParams({ secret: config.captcha.turnstileSecret, response: String(token), remoteip: remoteIp || '' });
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
      const j = await r.json(); return j.success ? 'ok' : 'wrong';
    } catch (_) { return 'wrong'; }
  }
  if (typeof token !== 'string' || typeof answer !== 'string' || !token) return 'missing';
  const a = answer.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a) return 'missing';
  const parts = token.split('.'); if (parts.length !== 3) return 'wrong';
  const [ts, nonce, sig] = parts; const age = Date.now() - Number(ts);
  if (!(age >= 0)) return 'wrong';
  if (age >= MAX_AGE) return 'expired';
  if (age < MIN_AGE || used.has(nonce)) return 'wrong';
  if (!safeEqual(sig, sign(a, ts, nonce))) return 'wrong';
  used.set(nonce, Date.now() + MAX_AGE + 60_000);
  return 'ok';
}
const verify = async (token, answer, remoteIp) => (await verifyReason(token, answer, remoteIp)) === 'ok';

// Express helper: reads captcha_token + captcha_answer from the body. Sets req.captchaReason.
async function check(req) { req.captchaReason = await verifyReason(req.body?.captcha_token, req.body?.captcha_answer, req.ip); return req.captchaReason === 'ok'; }

// Friendly, specific message for the browser (the form shows a new picture right after).
const MESSAGES = {
  missing: 'Type the letters from the picture first.',
  expired: 'That picture timed out. We have shown you a new one.',
  wrong: 'Those letters did not match. We have shown you a new picture, please try again.',
};
const message = (req) => MESSAGES[req.captchaReason] || MESSAGES.wrong;

module.exports = { create, verify, verifyReason, check, message, turnstileSite: config.captcha.turnstileSite && config.captcha.turnstileSecret ? config.captcha.turnstileSite : '' };
