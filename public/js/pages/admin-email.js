// Admin > Email: connect the mailbox the site sends from, send a test, and see everything sent or waiting.
import { html, raw, esc, $, $$, api, date, toast, confirmBox, formData, submitForm, setTitle } from '../lib.js';
import { head, badge, empty } from './portal.js';
import { previewMail } from './admin.js';

export default async function email(pc) {
  setTitle('Email');
  const [{ account, presets, unsent }, { emails }] = await Promise.all([api('/admin/email-settings'), api('/admin/outbox')]);
  const own = account.source === 'admin';
  const preset = presets.find((p) => p.host === account.host) || presets[0];
  const form = (open) => html`<form id="ef" class="${open ? '' : 'hide'}" novalidate style="margin-top:18px">
    <div class="field"><label>Email provider</label><select id="pv">${presets.map((p) => html`<option value="${p.id}" ${p.id === preset.id ? 'selected' : ''}>${p.label}</option>`)}</select><div class="hint" id="ph">${preset.help}</div></div>
    <div class="row3"><div class="field" style="grid-column:span 2"><label>Mail server</label><input name="host" value="${account.host}" placeholder="smtp.hostinger.com" required></div><div class="field"><label>Port</label><input name="port" type="number" value="${account.port}" required></div></div>
    <div class="row"><div class="field"><label>Security</label><select name="secure"><option value="true" ${account.secure ? 'selected' : ''}>SSL (port 465)</option><option value="false" ${account.secure ? '' : 'selected'}>STARTTLS (port 587)</option></select></div><div class="field"><label>Username <span class="muted">(usually the full email address)</span></label><input name="user" value="${own ? account.user : ''}" autocomplete="off" required></div></div>
    <div class="field"><label>Password</label><input name="pass" type="password" autocomplete="new-password" placeholder="${own && account.has_password ? 'Saved. Leave blank to keep it' : 'Mailbox password'}"><div class="hint">Stored encrypted on the server. It is never shown again.</div></div>
    <div class="row"><div class="field"><label>Send from <span class="muted">(defaults to the username)</span></label><input name="from" value="${own ? account.from : ''}" placeholder="hello@your-domain.com.au"></div><div class="field"><label>Sender name</label><input name="from_name" value="${account.from_name || 'wAIRhouse'}"></div></div>
    <div class="field"><label>Replies go to</label><input name="reply_to" value="${account.reply_to}"><div class="hint">Customers who press Reply reach this address, for example your Hotmail.</div></div>
    <div class="err-slot"></div><div id="er"></div><button class="btn btn-p" type="submit">Save and test connection</button></form>`;

  pc.innerHTML = html`${head('Email', 'Connect the mailbox the site sends from, and see everything it has sent.', account.configured ? html`<button class="btn btn-p" id="te">Send test email</button>` : '')}
  <div class="panel" style="${account.configured ? '' : 'border-color:rgba(255,194,75,.45)'}"><h3>Sending account</h3>
    ${account.configured
      ? html`<div>${badge('ok')} <b>Connected.</b> Sending as <b>${account.from_name} &lt;${account.from}&gt;</b> through ${account.host}:${account.port}. Replies go to ${account.reply_to}.</div><p class="muted" style="font-size:14px;margin-top:6px">${own ? 'Set up here in the admin.' : 'Set from the server settings. Save details below to take over from here.'}</p><div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-g btn-sm" id="chg">Change account</button>${own ? html`<button class="btn btn-g btn-sm" id="dis" style="color:var(--bad)">Disconnect</button>` : ''}</div>`
      : html`<div><b>Email is not connected yet.</b></div><p class="muted" style="margin-top:6px;max-width:70ch">Welcome emails, booking updates, password resets and owner invitations are saved below and will be sent as soon as you connect a mailbox. Nothing is lost.</p>
        <div class="card" style="margin-top:14px;padding:16px 18px;font-size:15px"><b>Which mailbox?</b> The easiest and most reliable is a free <b>Hostinger Email</b> mailbox on your own domain, for example <code>hello@your-domain.com.au</code>. Personal Hotmail and Outlook.com accounts no longer let websites send with a password, so they cannot be used here. Replies can still land in your Hotmail through the "Replies go to" box.</div>`}
    ${form(!account.configured)}</div>
  <div class="panel tscroll"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><h3 style="margin:0">Sent and waiting</h3>${unsent && account.configured ? html`<button class="btn btn-p btn-sm" id="ru">Send ${unsent} waiting email${unsent > 1 ? 's' : ''} now</button>` : ''}</div>
    ${emails.length ? html`<table class="tbl"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${emails.map((e) => html`<tr><td style="white-space:nowrap">${date(e.created_at)}</td><td>${e.to_email}</td><td>${e.subject}${e.error ? html`<div style="font-size:12px;color:var(--bad);max-width:360px">${e.error}</div>` : ''}</td><td>${e.kind}</td><td>${badge(e.status)}</td><td style="white-space:nowrap"><button class="btn btn-g btn-sm" data-v="${e.id}">View</button> ${e.status !== 'sent' && account.configured ? html`<button class="btn btn-g btn-sm" data-r="${e.id}">Send</button>` : ''}</td></tr>`)}</tbody></table>` : empty('No email yet', 'Send a test to see how your emails look.')}</div>`.s;

  const f = $('#ef', pc);
  $('#pv', pc)?.addEventListener('change', (e) => { const p = presets.find((x) => x.id === e.target.value); $('#ph', pc).textContent = p.help; if (p.host) { f.host.value = p.host; f.port.value = p.port; f.secure.value = String(p.secure); } });
  f.secure.addEventListener('change', () => { if (f.secure.value === 'true' && +f.port.value === 587) f.port.value = 465; if (f.secure.value === 'false' && +f.port.value === 465) f.port.value = 587; });
  $('#chg', pc)?.addEventListener('click', () => { f.classList.toggle('hide'); });
  f.addEventListener('submit', (e) => {
    e.preventDefault(); submitForm(f, async () => {
      const d = formData(f); $('#er', f).innerHTML = '';
      const r = await api('/admin/email-settings', { method: 'PUT', body: { ...d, secure: d.secure === 'true' } });
      if (r.verified) { toast('Connected. Your emails can now be sent.', 'ok'); email(pc); }
      else { $('#er', f).innerHTML = `<div class="err" role="alert"><b>Saved, but the mail server said no:</b> ${esc(r.error)}</div>`; toast('Saved, but the connection test failed', 'bad'); }
    });
  });
  pc.onclick = async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    try {
      if (b.id === 'te') { const r = await api('/admin/email/test', { method: 'POST', body: {} }); toast(r.ok ? 'Test email sent to your inbox' : 'Failed: ' + r.error, r.ok ? 'ok' : 'bad'); email(pc); }
      if (b.id === 'ru') { toast('Sending…'); const r = await api('/admin/outbox/retry-unsent', { method: 'POST' }); toast(`${r.sent} sent${r.failed ? `, ${r.failed} failed: ${r.error}` : ''}`, r.failed ? 'bad' : 'ok'); email(pc); }
      if (b.id === 'dis' && await confirmBox('Disconnect this mailbox?', 'The site will stop sending email until you connect another one. Emails are saved and can be sent later.', 'Disconnect')) { await api('/admin/email-settings', { method: 'DELETE' }); toast('Disconnected'); email(pc); }
      if (b.dataset.v) { const { email: em } = await api('/admin/outbox/' + b.dataset.v); previewMail({ subject: em.subject, html: em.html }); }
      if (b.dataset.r) { const r = await api(`/admin/outbox/${b.dataset.r}/retry`, { method: 'POST' }); toast(r.ok ? 'Sent' : 'Failed: ' + r.error, r.ok ? 'ok' : 'bad'); email(pc); }
    } catch (er) { toast(er.message, 'bad'); }
  };
}
