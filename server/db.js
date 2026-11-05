'use strict';
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company TEXT DEFAULT '',
  abn TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','owner','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  totp_secret TEXT DEFAULT '',
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  payout_details TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  last_login INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf TEXT NOT NULL,
  ip TEXT, ua TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'warehouse',
  address_line TEXT DEFAULT '',
  suburb TEXT DEFAULT '',
  state TEXT DEFAULT '',
  postcode TEXT DEFAULT '',
  lat REAL, lng REAL,
  unit TEXT NOT NULL DEFAULT 'sqm' CHECK (unit IN ('sqm','pallet','unit')),
  price_cents INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL DEFAULT 'month' CHECK (period IN ('day','week','month')),
  capacity INTEGER NOT NULL DEFAULT 1,
  total_sqm REAL DEFAULT 0,
  height_m REAL DEFAULT 0,
  min_days INTEGER NOT NULL DEFAULT 7,
  features TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  access_hours TEXT DEFAULT '',
  instant_book INTEGER NOT NULL DEFAULT 0,
  insurance_included INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','active','paused','rejected')),
  rejection_reason TEXT DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, type, state);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  goods TEXT DEFAULT '',
  message TEXT DEFAULT '',
  unit_price_cents INTEGER NOT NULL,
  periods INTEGER NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  payout_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','active','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  stripe_session TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wishlist (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  read_at INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(listing_id, customer_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Secrets (for example the mail account password) live apart from settings so they can never be returned by a settings API.
CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'legal', version INTEGER NOT NULL DEFAULT 1,
  published INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience TEXT NOT NULL DEFAULT 'customer', question TEXT NOT NULL, answer TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_name TEXT DEFAULT '',
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT DEFAULT '',
  suburb TEXT DEFAULT '', state TEXT DEFAULT '',
  website TEXT DEFAULT '',
  space_notes TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','replied','invited','signed_up','listed','declined','unsubscribed')),
  invite_token TEXT NOT NULL UNIQUE,
  last_contacted_at INTEGER DEFAULT 0,
  contact_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE TABLE IF NOT EXISTS suppression (email TEXT PRIMARY KEY COLLATE NOCASE, reason TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'system',
  to_email TEXT NOT NULL, subject TEXT NOT NULL, html TEXT NOT NULL, text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', error TEXT DEFAULT '',
  created_at INTEGER NOT NULL, sent_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, email TEXT, phone TEXT, subject TEXT, message TEXT,
  status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, action TEXT NOT NULL, detail TEXT DEFAULT '', ip TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  path TEXT NOT NULL UNIQUE,
  title TEXT DEFAULT '',
  alt TEXT DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, doc TEXT NOT NULL, version INTEGER NOT NULL, ip TEXT DEFAULT '', created_at INTEGER NOT NULL
);
`);

// ---- helpers ----
const now = () => Date.now();
const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---- site settings (all editable from the admin portal) ----
const DEFAULT_SETTINGS = {
  brand_name: 'wAIRhouse',
  tagline: 'Space, on demand.',
  site_description: 'wAIRhouse is the marketplace for spare space. Rent a warehouse, garage, spare room, shed or driveway by the day, week or month, or list the space you are not using and start earning.',
  contact_name: 'Raj Singh',
  contact_role: 'Founder',
  contact_phone: '0470368696',
  contact_email: 'raj_softdev@hotmail.com',
  support_hours: 'Mon to Fri, 8am to 6pm AEST',
  business_name: 'wAIRhouse',
  business_abn: '',
  business_address: 'Australia',
  governing_law: 'New South Wales, Australia',
  currency: 'AUD',
  social_linkedin: '', social_facebook: '', social_instagram: '', social_x: '',
  // money
  service_fee_pct: '6',          // paid by the customer on top of the price
  owner_commission_pct: '8',     // taken from the owner's payout
  founding_owner_commission_pct: '0', // launch promo for the first listings
  founding_owner_slots: '50',
  founding_owner_months: '6',
  // hero / marketing copy (editable)
  hero_eyebrow: 'The marketplace for space',
  hero_title: 'Store anything.\nAnywhere.',
  hero_subtitle: 'Warehouses, garages, spare rooms, sheds and driveways. Book verified space by the day, week or month, or list yours and start earning.',
  announcement: 'Got a spare room, garage or shed? List it free and keep 100% of what you earn for 6 months.',
  announcement_enabled: '1',
  // switches
  registration_open: '1',
  owner_registration_open: '1',
  maintenance_mode: '0',
  maintenance_message: 'We are making wAIRhouse even better. Back shortly.',
  require_listing_approval: '1',
  allow_instant_book: '1',
  show_demo_listings: '1',
  // outreach
  outreach_subject: 'List your spare warehouse space on wAIRhouse',
  outreach_body: 'Hi {{contact_name}},\n\nI am {{sender_name}}, founder of wAIRhouse, a new Australian marketplace that connects businesses who need storage with owners who have space to spare.\n\nWe found {{company}} and think your space could earn more with us. Listing is free, you set your own price and terms, and we bring the customers. Our first {{founding_slots}} owners pay zero commission for {{founding_months}} months.\n\nIf you would like to see how it works, the link below takes you straight to a quick sign-up with your details pre-filled.',
  outreach_cta: 'See how it works',
  // theming
  accent_color: '#ff6b2c',
  // email
  email_footer_note: 'You are receiving this email because of activity on wAIRhouse.',
  // captcha
  captcha_on_login: '1',
  captcha_on_register: '1',
  captcha_on_contact: '1',
  captcha_on_booking: '0',
  // seo / analytics
  analytics_note: '',
  // integrations
  stripe_enabled: '0',
};
const getSetting = (k) => {
  const r = q.get('SELECT value FROM settings WHERE key = ?', k);
  return r ? r.value : (DEFAULT_SETTINGS[k] ?? '');
};
function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of q.all('SELECT key, value FROM settings')) out[r.key] = r.value;
  return out;
}
function setSetting(k, v) {
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v));
}
// Settings that may be shown to anyone.
const PUBLIC_KEYS = Object.keys(DEFAULT_SETTINGS).filter(k => !/^(outreach_|email_footer|captcha_on_|stripe_)/.test(k));

function audit(userId, action, detail = '', ip = '') {
  try { q.run('INSERT INTO audit_log(user_id,action,detail,ip,created_at) VALUES(?,?,?,?,?)', userId || null, action, String(detail).slice(0, 500), ip, now()); } catch (_) { /* never break a request for logging */ }
}

const getSecret = (k) => { const r = q.get('SELECT value FROM secrets WHERE key = ?', k); return r ? r.value : ''; };
const setSecret = (k, v) => q.run('INSERT INTO secrets(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', k, String(v), now());
const delSecret = (k) => q.run('DELETE FROM secrets WHERE key = ?', k);

module.exports = { db, q, tx, now, DEFAULT_SETTINGS, PUBLIC_KEYS, getSetting, allSettings, setSetting, getSecret, setSecret, delSecret, audit };
