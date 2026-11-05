'use strict';
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { q, getSetting, allSettings, now } = require('./db');
const { seed } = require('./seed');
const { loadUser, csrfGuard } = require('./auth');
const { esc } = require('./util');

seed();
const mediaLib = require('./media'); mediaLib.seedLibrary();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

const turnstile = config.captcha.turnstileSite && config.captcha.turnstileSecret;
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...(turnstile ? ['https://challenges.cloudflare.com'] : [])],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
      fontSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: turnstile ? ['https://challenges.cloudflare.com'] : ["'none'"],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      ...(config.secureCookies ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: config.secureCookies ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(self), usb=()'); next(); });
app.use(require('compression')());

// Stripe webhook needs the raw body, so it is mounted before the JSON parser.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
  const crypto = require('crypto');
  if (!config.stripe.webhookSecret) return res.status(501).end();
  const sig = String(req.get('stripe-signature') || ''); const t = /t=(\d+)/.exec(sig)?.[1]; const v1 = /v1=([a-f0-9]+)/.exec(sig)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.status(400).end();
  const expected = crypto.createHmac('sha256', config.stripe.webhookSecret).update(`${t}.${req.body.toString('utf8')}`).digest('hex');
  if (expected.length !== v1.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return res.status(400).end();
  const ev = JSON.parse(req.body.toString('utf8'));
  if (ev.type === 'checkout.session.completed') {
    const ref = ev.data?.object?.client_reference_id;
    q.run("UPDATE bookings SET payment_status='paid', updated_at=? WHERE ref = ? AND stripe_session = ?", now(), ref, ev.data.object.id);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(loadUser);

// maintenance mode (admins still get in)
app.use((req, res, next) => {
  if (getSetting('maintenance_mode') !== '1') return next();
  if (req.user?.role === 'admin' || req.path.startsWith('/api/auth') || /^\/(css|js|img|fonts|vendor|admin|login)/.test(req.path)) return next();
  if (req.path.startsWith('/api/')) return res.status(503).json({ error: getSetting('maintenance_message') });
  res.status(503).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back soon</title><body style="font:20px/1.6 -apple-system,Segoe UI,sans-serif;background:#0a0f1a;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><div style="padding:24px"><h1 style="font-size:40px;letter-spacing:-1px">w<span style="color:#9adbff">AIR</span>house</h1><p style="color:#9fb0cf">${esc(getSetting('maintenance_message'))}</p></div>`);
});

// ---------- API ----------
const api = express.Router();
api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Slow down a little.' } }));
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(csrfGuard);
api.use('/auth', require('./routes/auth'));
const pub = require('./routes/public');
api.use('/', pub.router);
api.use('/me', require('./routes/account'));
api.use('/owner', require('./routes/owner'));
api.use('/admin', require('./routes/admin'));
api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use('/api', api);

// ---------- static ----------
const PUB = path.join(config.ROOT, 'public');
app.use('/uploads', express.static(config.UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny', setHeaders: (res) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"); } }));
app.use(express.static(PUB, { maxAge: config.isProd ? '7d' : 0, index: false, dotfiles: 'deny', setHeaders: (res, p) => { if (/\.(html)$/.test(p)) res.set('Cache-Control', 'no-cache'); } }));

app.get('/robots.txt', (_req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /owner\nDisallow: /account\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`));
app.get('/sitemap.xml', (_req, res) => {
  const urls = ['/', '/search', '/host', '/how-it-works', '/about', '/contact', '/faq', ...q.all("SELECT slug FROM pages WHERE published=1 AND category='legal'").map((p) => '/legal/' + p.slug), ...q.all("SELECT slug FROM listings WHERE status='active'" + (getSetting('show_demo_listings') === '1' ? '' : ' AND is_demo=0')).map((l) => '/space/' + l.slug)];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${config.siteUrl}${esc(u)}</loc></url>`).join('')}</urlset>`);
});
app.get('/.well-known/security.txt', (_req, res) => res.type('text/plain').send(`Contact: mailto:${getSetting('contact_email')}\nExpires: ${new Date(Date.now() + 365 * 86400_000).toISOString()}\nPreferred-Languages: en\n`));

// ---------- SPA shell with per-page SEO tags ----------
let shell = null;
const readShell = () => (shell && config.isProd) ? shell : (shell = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'));
app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Not found');
  const s = allSettings(); let title = `${s.brand_name} | ${s.tagline} Warehouse and storage marketplace`, desc = s.site_description, image = config.siteUrl + (mediaLib.resolveAll().og_image?.url || '/img/og-cover.jpg');
  const m = req.path.match(/^\/space\/([\w-]+)/);
  if (m) {
    const l = q.get("SELECT title, summary, suburb, state, images FROM listings WHERE slug = ? AND status = 'active'", m[1]);
    if (l) { title = `${l.title}, ${l.suburb} ${l.state} | ${s.brand_name}`; desc = l.summary || desc; const im = JSON.parse(l.images || '[]')[0]; if (im) image = config.siteUrl + im; }
  } else if (req.path.startsWith('/legal/')) {
    const p = q.get('SELECT title FROM pages WHERE slug = ?', req.path.slice(7)); if (p) title = `${p.title} | ${s.brand_name}`;
  } else if (req.path === '/search') title = `Find warehouse and storage space | ${s.brand_name}`;
  else if (req.path === '/host') title = `Earn from your spare warehouse space | ${s.brand_name}`;
  const noindex = /^\/(admin|owner|account|login|register|reset|verify|forgot)/.test(req.path);
  const html = readShell()
    .replace('<!--SEO-->', `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(config.siteUrl + req.path)}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(s.brand_name)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(config.siteUrl + req.path)}"><meta name="twitter:card" content="summary_large_image">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}`)
    .replace('<!--ACCENT-->', `<style>:root{--accent:${/^#[0-9a-f]{6}$/i.test(s.accent_color) ? s.accent_color : '#ff6b2c'}}</style>`);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});

// ---------- errors ----------
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photos must be under 8 MB each.' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Bad request.' });
  console.error('[error]', req.method, req.originalUrl, err.stack || err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

// housekeeping
setInterval(() => { q.run('DELETE FROM sessions WHERE expires_at < ?', now()); q.run('DELETE FROM tokens WHERE expires_at < ?', now()); }, 3600_000).unref();

const server = app.listen(config.port, () => console.log(`wAIRhouse running on ${config.siteUrl} (port ${config.port}${config.isProd ? ', production' : ''})`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
module.exports = app;
