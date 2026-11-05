'use strict';
// Email: branded HTML templates + delivery. The mail account is chosen in Admin > Email (password stored encrypted),
// or falls back to environment variables. If no account is connected, mail is kept in the outbox (Admin > Email)
// instead of being lost, and can be sent later with one click.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('./config');
const { q, now, getSetting, allSettings, getSecret } = require('./db');
const { esc, hmac, decrypt } = require('./util');

// The active mail account: saved in Admin > Email, else environment variables.
function mailConfig() {
  const env = config.mail;
  let c = { host: env.host, port: env.port, secure: env.secure, user: env.user, pass: env.pass, from: env.from, fromName: env.fromName, replyTo: env.replyTo, source: 'env' };
  try {
    const raw = getSecret('smtp_config');
    if (raw) {
      const j = JSON.parse(raw); const pass = decrypt(j.pass_enc);
      if (j.host && j.user && pass) c = { host: j.host, port: Number(j.port) || 587, secure: !!j.secure, user: j.user, pass, from: j.from || j.user, fromName: j.from_name || env.fromName, replyTo: j.reply_to || env.replyTo, source: 'admin' };
    }
  } catch (_) { /* fall back to environment variables */ }
  return c;
}
// Tests and local development only: no network, messages are recorded as sent.
const sink = () => process.env.MAIL_SINK === '1' && !config.isProd;
const configured = () => { if (sink()) return true; const c = mailConfig(); return !!(c.user && c.pass); };

let transport = null, transportKey = '';
function getTransport() {
  if (sink()) return transport || (transport = nodemailer.createTransport({ jsonTransport: true }));
  const c = mailConfig(); if (!c.user || !c.pass) return null;
  const key = [c.host, c.port, c.secure, c.user, hmac(c.pass)].join('|');
  if (!transport || key !== transportKey) {
    try { transport && transport.close(); } catch (_) { /* ignore */ }
    transport = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure, requireTLS: !c.secure, auth: { user: c.user, pass: c.pass },
      tls: { minVersion: 'TLSv1.2' }, pool: true, maxConnections: 2, maxMessages: 50, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    });
    transportKey = key;
  }
  return transport;
}
function resetTransport() { try { transport && transport.close(); } catch (_) { /* ignore */ } transport = null; transportKey = ''; }

// Turn raw SMTP errors into something a non-technical person can act on.
function friendlyError(e) {
  const m = String((e && (e.response || e.message)) || e || '');
  if (/basic authentication|5\.7\.139|5\.7\.30|SmtpClientAuthentication/i.test(m)) return 'This provider no longer allows password sign-in for sending email (personal Hotmail and Outlook accounts do not). Use a Hostinger Email mailbox or another provider.';
  if (e && (e.code === 'EAUTH' || e.responseCode === 535) || /invalid login|authentication failed|535/i.test(m)) return 'The mail server did not accept that username or password.';
  if (e && e.code === 'ENOTFOUND') return 'That mail server name was not found. Check the host name.';
  if (e && (e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.code === 'ESOCKET' || e.code === 'ECONNECTION')) return 'Could not reach the mail server. Check the host and port.';
  return m.replace(/\s+/g, ' ').slice(0, 240) || 'Email could not be sent.';
}
async function verifyConnection() {
  const t = getTransport(); if (!t) return { ok: false, error: 'Email is not connected yet.' };
  if (sink()) return { ok: true };
  try { await t.verify(); return { ok: true }; } catch (e) { return { ok: false, error: friendlyError(e) }; }
}

const LOGO_PNG = path.join(__dirname, '..', 'public', 'img', 'logo-mark.png');
const attachments = () => fs.existsSync(LOGO_PNG) ? [{ filename: 'wairhouse.png', path: LOGO_PNG, cid: 'wairhouse-logo' }] : [];

function unsubscribeUrl(email) { return `${config.siteUrl}/api/unsubscribe?e=${encodeURIComponent(email)}&s=${hmac('unsub|' + String(email).toLowerCase())}`; }

// Sends (or re-sends) one stored message. The outbox row is updated in place, so retries never create duplicates.
async function deliver(id) {
  const e = q.get('SELECT * FROM email_outbox WHERE id = ?', id); if (!e) return { ok: false, error: 'Email not found.' };
  const t = getTransport();
  if (!t) { q.run("UPDATE email_outbox SET status='not_sent', error=? WHERE id=?", 'Email is not connected yet. Connect it in Admin > Email.', id); return { ok: false, id, error: 'smtp_not_configured' }; }
  const c = mailConfig();
  try {
    const headers = e.kind === 'outreach' ? { 'List-Unsubscribe': `<${unsubscribeUrl(e.to_email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};
    await t.sendMail({ from: { name: c.fromName, address: c.from }, replyTo: c.replyTo, to: e.to_email, subject: e.subject, html: e.html, text: e.text, attachments: attachments(), headers });
    q.run("UPDATE email_outbox SET status='sent', sent_at=?, error='' WHERE id=?", now(), id);
    return { ok: true, id };
  } catch (err) {
    const msg = friendlyError(err);
    q.run("UPDATE email_outbox SET status='failed', error=? WHERE id=?", msg.slice(0, 300), id);
    return { ok: false, id, error: msg };
  }
}
async function send({ to, subject, html, text, kind = 'system' }) {
  to = String(to || '').trim();
  if (!to) return { ok: false, error: 'no recipient' };
  if (q.get('SELECT 1 FROM suppression WHERE email = ?', to)) return { ok: false, error: 'suppressed' };
  const row = q.run('INSERT INTO email_outbox(kind,to_email,subject,html,text,status,created_at) VALUES(?,?,?,?,?,?,?)', kind, to, subject, html, text, 'queued', now());
  return deliver(Number(row.lastInsertRowid));
}
// Send everything that was saved while email was off or failing (newest week only).
async function retryUnsent(limit = 50) {
  const rows = q.all("SELECT id FROM email_outbox WHERE status IN ('not_sent','failed') AND created_at > ? ORDER BY id ASC LIMIT ?", now() - 7 * 86400_000, limit);
  let sent = 0, failed = 0, lastError = '';
  for (const r of rows) { const out = await deliver(r.id); if (out.ok) sent++; else { failed++; lastError = out.error; if (out.error === 'smtp_not_configured') break; } await new Promise((res) => setTimeout(res, 300)); }
  return { tried: rows.length, sent, failed, error: lastError };
}
// fire-and-forget wrapper used by request handlers
const queue = (m) => { send(m).catch(() => {}); };

// ---------- layout ----------
function layout({ title, preheader = '', body, cta, ctaUrl, footerExtra = '', marketingTo = '' }) {
  const s = allSettings();
  const orange = '#ff6b2c';
  const btn = cta && ctaUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="border-radius:999px;background:${orange}">
      <a href="${esc(ctaUrl)}" style="display:inline-block;padding:15px 30px;font:700 16px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:999px">${esc(cta)} &rarr;</a>
    </td></tr></table>` : '';
  const unsub = marketingTo ? `<p style="margin:14px 0 0"><a href="${unsubscribeUrl(marketingTo)}" style="color:#8a97b2">Unsubscribe</a> &middot; We will never contact you again once you do.</p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef1f6">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(10,15,26,.12)">
  <tr><td style="background:#0a0f1a;background-image:linear-gradient(135deg,#0a0f1a 0%,#14213d 100%);padding:30px 36px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle"><img src="cid:wairhouse-logo" width="46" height="46" alt="" style="display:block;border:0"></td>
      <td style="vertical-align:middle;padding-left:12px;font:800 28px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:-.5px;color:#ffffff">w<span style="color:#9adbff">AIR</span>house</td>
    </tr></table>
    <div style="margin-top:14px;font:500 14px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9fb0cf">${esc(s.tagline)}</div>
  </td></tr>
  <tr><td style="padding:36px 36px 10px;font:400 16px/1.65 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d2433">
    <h1 style="margin:0 0 14px;font:800 26px/1.2 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:-.4px;color:#0a0f1a">${esc(title)}</h1>
    ${body}
    ${btn}
  </td></tr>
  <tr><td style="padding:8px 36px 30px;font:400 15px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d2433">
    ${footerExtra}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:1px solid #e3e8f1;width:100%"><tr><td style="padding-top:18px;font:400 14px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#46506a">
      <strong style="color:#0a0f1a">${esc(s.contact_name)}</strong>, ${esc(s.contact_role)}<br>
      ${esc(s.brand_name)} &middot; <a href="tel:${esc(s.contact_phone.replace(/\s/g, ''))}" style="color:${orange};text-decoration:none">${esc(s.contact_phone)}</a> &middot; <a href="mailto:${esc(s.contact_email)}" style="color:${orange};text-decoration:none">${esc(s.contact_email)}</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="background:#f6f8fc;padding:20px 36px;font:400 12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#8a97b2">
    <p style="margin:0">${esc(s.email_footer_note)}</p>
    <p style="margin:8px 0 0">${esc(s.business_name)}${s.business_abn ? ' &middot; ABN ' + esc(s.business_abn) : ''} &middot; ${esc(s.business_address)}</p>
    <p style="margin:8px 0 0"><a href="${config.siteUrl}/legal/privacy" style="color:#8a97b2">Privacy</a> &middot; <a href="${config.siteUrl}/legal/terms" style="color:#8a97b2">Terms</a> &middot; <a href="${config.siteUrl}/contact" style="color:#8a97b2">Contact</a></p>
    ${unsub}
  </td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t) => `<p style="margin:0 0 14px">${t}</p>`;
const textOf = (title, lines, url) => [title, '', ...lines, url ? `\n${url}` : '', `\n${getSetting('contact_name')}  ${getSetting('contact_phone')}  ${getSetting('contact_email')}`].join('\n');
const row = (k, v) => `<tr><td style="padding:8px 0;color:#6b7893;width:42%">${esc(k)}</td><td style="padding:8px 0;font-weight:600;color:#0a0f1a">${esc(v)}</td></tr>`;
const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;border-top:1px solid #e3e8f1;border-bottom:1px solid #e3e8f1">${rows.join('')}</table>`;

// ---------- the emails ----------
const T = {
  welcome(u, token) {
    const owner = u.role === 'owner'; const first = u.name.split(' ')[0];
    const next = `${config.siteUrl}/${owner ? 'owner/listings/new' : 'search'}`; const verifyUrl = token ? `${config.siteUrl}/verify?token=${token}` : '';
    const intro = owner ? 'Your owner account is ready. Add your first space, upload a few photos and set your price. Most hosts go live in under 10 minutes.' : 'Your account is ready. Search verified space near you, compare prices and book in a few taps. No long contracts.';
    const body = p(intro) + (verifyUrl ? p('<strong>One quick step:</strong> confirm this is your email address. The button below works for 24 hours.') : '');
    const after = verifyUrl ? p(`Ready to get going? <a href="${esc(next)}" style="color:#ff6b2c;font-weight:700;text-decoration:none">${owner ? 'Add your first space' : 'Find storage'}</a>.`) : '';
    return { subject: verifyUrl ? `Welcome to wAIRhouse, ${first}: please confirm your email` : `Welcome to wAIRhouse, ${first}`,
      html: layout({ title: `Welcome aboard, ${first}`, preheader: verifyUrl ? 'Confirm your email to finish setting up.' : 'Your account is ready.', body, cta: verifyUrl ? 'Confirm my email' : (owner ? 'Add your first space' : 'Find storage'), ctaUrl: verifyUrl || next, footerExtra: after }),
      text: textOf(`Welcome to wAIRhouse, ${first}`, [intro, verifyUrl ? 'Please confirm your email address (link works for 24 hours):' : ''], verifyUrl || next) };
  },
  verify(u, token) {
    const url = `${config.siteUrl}/verify?token=${token}`;
    return { subject: 'Confirm your email for wAIRhouse',
      html: layout({ title: 'Confirm your email', preheader: 'One click and you are in.', body: p('Tap the button to confirm this is your email address. The link works for 24 hours.'), cta: 'Confirm email', ctaUrl: url }),
      text: textOf('Confirm your email', ['Open this link to confirm your email (valid 24 hours).'], url) };
  },
  reset(u, token) {
    const url = `${config.siteUrl}/reset?token=${token}`;
    return { subject: 'Reset your wAIRhouse password',
      html: layout({ title: 'Reset your password', preheader: 'This link works for 1 hour.', body: p('We got a request to reset your password. If that was you, tap the button. The link works for 1 hour. If it was not you, you can ignore this email and your password stays the same.'), cta: 'Choose a new password', ctaUrl: url }),
      text: textOf('Reset your password', ['Open this link within 1 hour to choose a new password.'], url) };
  },
  bookingRequestOwner(b, l, c) {
    const url = `${config.siteUrl}/owner/bookings`;
    return { subject: `New booking request: ${l.title}`,
      html: layout({ title: 'You have a new booking request', preheader: `${c.name} wants to book ${l.title}.`,
        body: p(`<strong>${esc(c.name)}</strong> would like to book your space. Review the details and accept or decline within 48 hours.`) + table([row('Space', l.title), row('Reference', b.ref), row('Dates', `${b.start_date} to ${b.end_date}`), row('Quantity', `${b.quantity} ${l.unit}${b.quantity > 1 ? 's' : ''}`), row('Your payout', (b.payout_cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })), row('Goods', b.goods || 'Not specified')]),
        cta: 'Review request', ctaUrl: url }),
      text: textOf('New booking request', [`${c.name} wants to book ${l.title}`, `Ref ${b.ref}, ${b.start_date} to ${b.end_date}`], url) };
  },
  bookingReceivedCustomer(b, l) {
    const url = `${config.siteUrl}/account/bookings`;
    return { subject: `Request sent: ${l.title}`,
      html: layout({ title: 'Your request is with the owner', preheader: `Reference ${b.ref}`,
        body: p('Thanks. The owner has been notified and usually replies within a few hours. You are not charged until they accept.') + table([row('Space', l.title), row('Reference', b.ref), row('Dates', `${b.start_date} to ${b.end_date}`), row('Total if accepted', (b.total_cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }))]),
        cta: 'View booking', ctaUrl: url }),
      text: textOf('Request sent', [`Ref ${b.ref} for ${l.title}`], url) };
  },
  bookingDecision(b, l, accepted, note) {
    const url = `${config.siteUrl}/account/bookings`;
    return { subject: accepted ? `Confirmed: ${l.title}` : `Update on your request: ${l.title}`,
      html: layout({ title: accepted ? 'Your space is confirmed' : 'The owner could not accept this one', preheader: `Reference ${b.ref}`,
        body: p(accepted ? 'Great news, the owner accepted your booking. Open your booking for access details and next steps.' : 'Sorry, the owner is not able to take this booking. You have not been charged, and there are plenty of other spaces nearby.') + (note ? p(`<em>"${esc(note)}"</em>`) : '') + table([row('Space', l.title), row('Reference', b.ref), row('Dates', `${b.start_date} to ${b.end_date}`)]),
        cta: accepted ? 'View booking' : 'Find another space', ctaUrl: accepted ? url : `${config.siteUrl}/search` }),
      text: textOf(accepted ? 'Booking confirmed' : 'Booking declined', [`Ref ${b.ref} for ${l.title}`], url) };
  },
  newMessage(from, to, l, body) {
    const url = `${config.siteUrl}/${to.role === 'owner' ? 'owner' : 'account'}/messages`;
    return { subject: `New message about ${l.title}`,
      html: layout({ title: `${from.name.split(' ')[0]} sent you a message`, preheader: body.slice(0, 90), body: p(`About <strong>${esc(l.title)}</strong>:`) + `<blockquote style="margin:0 0 14px;padding:12px 16px;background:#f6f8fc;border-left:4px solid #ff6b2c;border-radius:8px">${esc(body).replace(/\n/g, '<br>')}</blockquote>`, cta: 'Reply', ctaUrl: url }),
      text: textOf('New message', [body], url) };
  },
  listingDecision(l, approved, reason) {
    const url = `${config.siteUrl}/owner/listings`;
    return { subject: approved ? `Your space is live: ${l.title}` : `Changes needed: ${l.title}`,
      html: layout({ title: approved ? 'Your space is live' : 'A few changes are needed', preheader: l.title,
        body: p(approved ? `<strong>${esc(l.title)}</strong> passed our checks and is now visible to customers.` : `We could not approve <strong>${esc(l.title)}</strong> yet.`) + (reason ? p(`<strong>Note from our team:</strong> ${esc(reason)}`) : ''), cta: approved ? 'View my spaces' : 'Update my listing', ctaUrl: url }),
      text: textOf(approved ? 'Space approved' : 'Changes needed', [l.title, reason || ''], url) };
  },
  contactReceipt(m) {
    return { subject: 'We got your message',
      html: layout({ title: `Thanks ${esc(m.name.split(' ')[0])}, we got it`, preheader: 'We will reply soon.', body: p('Your message is with our team. We usually reply within one business day.') + `<blockquote style="margin:0 0 14px;padding:12px 16px;background:#f6f8fc;border-left:4px solid #9adbff;border-radius:8px">${esc(m.message).replace(/\n/g, '<br>')}</blockquote>` }),
      text: textOf('We got your message', [m.message]) };
  },
  adminAlert(subject, lines, url) {
    return { subject: `[wAIRhouse] ${subject}`,
      html: layout({ title: subject, preheader: lines[0] || '', body: lines.map((l) => p(esc(l))).join(''), cta: url ? 'Open admin' : '', ctaUrl: url }),
      text: textOf(subject, lines, url) };
  },
  // Outreach to warehouse owners. Spam Act 2003 compliant: identifies the sender, has a working unsubscribe.
  ownerInvite(prospect, inviteUrl) {
    const s = allSettings();
    const fill = (str) => String(str)
      .replace(/{{contact_name}}/g, prospect.contact_name || 'there')
      .replace(/{{company}}/g, prospect.company)
      .replace(/{{sender_name}}/g, s.contact_name)
      .replace(/{{founding_slots}}/g, s.founding_owner_slots)
      .replace(/{{founding_months}}/g, s.founding_owner_months);
    const bodyText = fill(s.outreach_body);
    const bodyHtml = esc(bodyText).split(/\n{2,}/).map((para) => p(para.replace(/\n/g, '<br>'))).join('');
    const perks = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 6px">${[
      ['Free to list', 'No set-up fee and no monthly fee.'],
      ['You set the price', 'Per pallet, per square metre or per unit.'],
      [`${s.founding_owner_commission_pct}% commission for ${s.founding_owner_months} months`, `For our first ${s.founding_owner_slots} owners. Then just ${s.owner_commission_pct}%.`],
      ['Verified customers', 'Every booking request shows who, what and when.'],
    ].map(([a, b]) => `<tr><td style="padding:7px 0;vertical-align:top;width:26px;color:#ff6b2c;font-weight:800">&#10003;</td><td style="padding:7px 0"><strong style="color:#0a0f1a">${esc(a)}</strong><br><span style="color:#46506a">${esc(b)}</span></td></tr>`).join('')}</table>`;
    return { subject: fill(s.outreach_subject),
      html: layout({ title: fill(s.outreach_subject), preheader: 'Earn from space you are not using.', body: bodyHtml + perks, cta: s.outreach_cta, ctaUrl: inviteUrl, marketingTo: prospect.email }),
      text: [bodyText, '', inviteUrl, '', `${s.contact_name}, ${s.contact_phone}, ${s.contact_email}`, `Unsubscribe: ${unsubscribeUrl(prospect.email)}`].join('\n') };
  },
};

module.exports = { send, queue, deliver, retryUnsent, verifyConnection, resetTransport, mailConfig, friendlyError, T, layout, configured, unsubscribeUrl };
