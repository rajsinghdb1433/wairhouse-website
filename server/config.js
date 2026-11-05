'use strict';
// Central configuration. Everything sensitive comes from environment variables (see .env.example).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Minimal .env loader (no dependency). Real environment variables always win.
try {
  const envFile = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
} catch (_) { /* ignore */ }

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Server secret: from env, else generated once and persisted (never committed).
function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return process.env.APP_SECRET;
  const f = path.join(DATA_DIR, '.secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (_) { /* create */ }
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

const isProd = process.env.NODE_ENV === 'production';
const siteUrl = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

module.exports = {
  ROOT, DATA_DIR, UPLOAD_DIR, isProd, siteUrl,
  port: Number(process.env.PORT) || 3000,
  secret: loadSecret(),
  secureCookies: siteUrl.startsWith('https://'),
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : (isProd ? 1 : 0),
  dbFile: process.env.DB_FILE || path.join(DATA_DIR, 'wairhouse.db'),
  admin: {
    email: (process.env.ADMIN_EMAIL || 'raj_softdev@hotmail.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Raj Singh',
  },
  seedDemo: process.env.SEED_DEMO !== 'false',
  mail: {
    host: process.env.SMTP_HOST || 'smtp-mail.outlook.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'raj_softdev@hotmail.com',
    fromName: process.env.MAIL_FROM_NAME || 'wAIRhouse',
    // Until a dedicated mailbox exists, every system email is sent from, and replies go to, this address.
    replyTo: process.env.MAIL_REPLY_TO || 'raj_softdev@hotmail.com',
  },
  captcha: {
    turnstileSite: process.env.TURNSTILE_SITE_KEY || '',
    turnstileSecret: process.env.TURNSTILE_SECRET || '',
  },
  stripe: {
    secret: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
};
