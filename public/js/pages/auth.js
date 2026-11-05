import { slot, html, raw, $, $$, api, state, esc, toast, setTitle, submitForm, formData, captchaHtml, captchaMount, captchaValues, captchaRefresh, logoSvg } from '../lib.js';
import { boxesScene } from '../scenes.js';
import { navigate } from '../app.js';

const home = (u) => u.must_change_password ? '/account/profile?force=1' : u.role === 'admin' ? '/admin' : u.role === 'owner' ? '/owner' : '/account/bookings';
const art = (title, sub) => { const m = slot('auth_image'); const vid = m?.kind === 'video'; return html`<div class="auth-art ${vid ? 'has-vid' : 'has-img'}" style="--bg-img:url('${vid ? '' : (m?.url || '')}')">${vid ? html`<video class="hero-bgvideo" data-bg src="${m.url}" poster="${m.poster || ''}" muted loop playsinline aria-hidden="true"></video>` : ''}<canvas id="aa" aria-hidden="true"></canvas><h2 class="h-lg" style="max-width:10ch">${title}</h2><p class="lede" style="margin-top:18px">${sub}</p></div>`; };
const withArt = (onLeave) => { try { const b = boxesScene($('#aa'), { count: 36 }); onLeave(() => b.dispose()); } catch (_) { /* no webgl */ } };

export default async function auth(c) {
  const { main, path } = c;
  if (state.user && path !== '/verify' && path !== '/reset') return navigate(home(state.user), { replace: true });
  return ({ '/login': login, '/register': register, '/forgot': forgot, '/reset': reset, '/verify': verify }[path])(c);
}

async function login({ main, query, onLeave }) {
  setTitle('Sign in'); const s = state.site.settings; const cap = s.captcha_on_login === '0' ? raw('') : await captchaHtml('cap'); let needTotp = false;
  main.innerHTML = html`<div class="auth">${art('Welcome back.', 'Your spaces, bookings and messages are waiting.')}<div class="auth-form"><div class="auth-card"><h1>Sign in</h1><p class="muted" style="margin-bottom:26px">New here? <a class="link" href="/register${query.next ? '?next=' + encodeURIComponent(query.next) : ''}" data-link>Create an account</a></p>
    <form id="f" novalidate><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="username" required autofocus></div><div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
      <div class="field hide" id="tf"><label for="t">6-digit code from your authenticator app</label><input id="t" name="totp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>${cap}<div class="err-slot"></div><button class="btn btn-p btn-lg btn-block" type="submit">Sign in</button></form>
    <p style="margin-top:20px"><a class="link" href="/forgot" data-link>Forgot your password?</a></p></div></div></div>`.s;
  withArt(onLeave); captchaMount(main);
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => {
    const r = await api('/auth/login', { method: 'POST', body: { ...formData(f), ...captchaValues(f) } });
    if (r.need_totp) { $('#tf').classList.remove('hide'); $('#t').focus(); needTotp = true; await captchaRefresh(f); toast('Enter your authenticator code'); return; }
    state.user = r.user; state.csrf = r.csrf; api('/me/wishlist').then((w) => { state.wish = new Set(w.ids); }).catch(() => {});
    const next = query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : null; navigate(r.user.must_change_password ? home(r.user) : (next || home(r.user)));
  }); });
}

function strength(pw) { let s = 0; if (pw.length >= 10) s++; if (pw.length >= 14) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^\w]/.test(pw)) s++; return s; }
async function register({ main, query, onLeave, invite, forceOwner }) {
  setTitle('Create your account'); const s = state.site.settings; const cap = s.captcha_on_register === '0' ? raw('') : await captchaHtml('cap'); let role = forceOwner || query.role === 'owner' ? 'owner' : 'customer';
  main.innerHTML = html`<div class="auth">${art(role === 'owner' ? 'Turn space into income.' : 'Space, on demand.', role === 'owner' ? 'Garage, spare room, shed, driveway or warehouse. List free, set your price, we bring the customers.' : 'Find verified storage in minutes. No long contracts.')}<div class="auth-form"><div class="auth-card"><h1>${forceOwner ? 'List your space' : 'Create account'}</h1><p class="muted" style="margin-bottom:22px">Already have one? <a class="link" href="/login" data-link>Sign in</a></p>
    ${forceOwner ? '' : html`<div class="seg" id="seg"><button type="button" data-r="customer" class="${role === 'customer' ? 'on' : ''}">I need space</button><button type="button" data-r="owner" class="${role === 'owner' ? 'on' : ''}">I have space</button></div>`}
    <form id="f" novalidate>${invite ? html`<div class="okmsg">Welcome${invite.contact_name ? ', ' + invite.contact_name : ''}! We saved a spot for <b>${invite.company}</b>.</div>` : ''}
      <div class="field"><label for="n">Full name</label><input id="n" name="name" autocomplete="name" required></div><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="email" required value="${invite?.email || ''}"></div>
      <div class="row"><div class="field"><label for="ph">Phone <span class="muted">(optional)</span></label><input id="ph" name="phone" autocomplete="tel"></div><div class="field ${role === 'owner' ? '' : 'hide'}" id="cof"><label for="co">Business name <span class="muted">(optional)</span></label><input id="co" name="company" autocomplete="organization" value="${invite?.company || ''}"></div></div>
      <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="10" required><div class="hint" id="pw">At least 10 characters. A short phrase works great.</div></div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="check"><input type="checkbox" name="accept_terms" required><span>I agree to the <a class="link" href="/legal/terms" target="_blank">Terms</a> and <a class="link" href="/legal/privacy" target="_blank">Privacy Policy</a>${role === 'owner' ? html`, and the <a class="link" href="/legal/host-agreement" target="_blank">Owner Agreement</a>` : ''}.</span></label>
      <label class="check"><input type="checkbox" name="marketing_opt_in"><span>Send me occasional tips and offers. Unsubscribe any time.</span></label>${cap}<div class="err-slot"></div><button class="btn btn-p btn-lg btn-block" type="submit">Create account</button></form></div></div></div>`.s;
  withArt(onLeave); captchaMount(main);
  $('#seg')?.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; navigate('/register?role=' + b.dataset.r + (query.next ? '&next=' + encodeURIComponent(query.next) : ''), { replace: true }); });
  $('#p').addEventListener('input', (e) => { const n = strength(e.target.value); $('#pw').textContent = ['Too short', 'Weak', 'Okay', 'Good', 'Strong', 'Excellent'][n] + (n < 2 ? '. Try a longer phrase.' : ''); $('#pw').style.color = n < 2 ? 'var(--bad)' : n < 4 ? 'var(--warn)' : 'var(--ok)'; });
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => {
    const d = formData(f); const r = await api('/auth/register', { method: 'POST', body: { ...d, role, accept_terms: !!d.accept_terms, marketing_opt_in: !!d.marketing_opt_in, invite_token: invite?.token, ...captchaValues(f) } });
    state.user = r.user; state.csrf = r.csrf; toast('Welcome to wAIRhouse! Check your email to confirm.', 'ok');
    const next = query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : null; navigate(next || (role === 'owner' ? '/owner/listings/new' : '/search'));
  }); });
}
// /host/join?invite=TOKEN — owner onboarding, pre-filled from an outreach email
export async function joinPage(c) {
  const dest = '/owner/listings/new' + (c.query.type ? '?type=' + encodeURIComponent(c.query.type) : '');
  if (state.user) {
    if (state.user.role !== 'customer') return navigate(dest, { replace: true });
    return becomeHost(c, dest); // a customer can start hosting with the same account
  }
  let invite = null; if (c.query.invite) { try { invite = { ...(await api('/invite/' + encodeURIComponent(c.query.invite))).invite, token: c.query.invite }; } catch (_) { /* ignore bad token */ } }
  await register({ ...c, query: { ...c.query, next: dest }, invite, forceOwner: true });
}
async function becomeHost({ main, onLeave }, dest) {
  setTitle('Start hosting');
  main.innerHTML = html`<div class="auth">${art('Turn space into income.', 'Your account can rent space and host space. No second sign-up.')}<div class="auth-form"><div class="auth-card"><h1>Start hosting</h1><p class="muted" style="margin-bottom:22px">Hi ${state.user.name.split(' ')[0]}. One tick and you can list your garage, spare room, shed, driveway or warehouse.</p><form id="f" novalidate>
    <label class="check"><input type="checkbox" name="accept_terms" required><span>I agree to the <a class="link" href="/legal/host-agreement" target="_blank">Owner Agreement</a>, including the rules for home spaces.</span></label><div class="err-slot"></div><button class="btn btn-p btn-lg btn-block" type="submit">Start hosting</button></form></div></div></div>`.s; withArt(onLeave);
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { await api('/me/become-host', { method: 'POST', body: { accept_terms: !!formData(f).accept_terms } }); state.user.role = 'owner'; toast('Hosting is on. Add your first space.', 'ok'); navigate(dest); }); });
}

async function forgot({ main, onLeave }) {
  setTitle('Reset password'); const cap = await captchaHtml('cap');
  main.innerHTML = html`<div class="auth">${art('Forgot it?', 'It happens. We will email you a secure link.')}<div class="auth-form"><div class="auth-card"><h1>Reset password</h1><p class="muted" style="margin-bottom:26px">Enter your email and we will send a link that works for 1 hour.</p><form id="f" novalidate><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" required autofocus></div>${cap}<div class="err-slot"></div><button class="btn btn-p btn-lg btn-block" type="submit">Send reset link</button></form><p style="margin-top:20px"><a class="link" href="/login" data-link>Back to sign in</a></p></div></div></div>`.s;
  withArt(onLeave); captchaMount(main);
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { const r = await api('/auth/forgot', { method: 'POST', body: { ...formData(f), ...captchaValues(f) } }); f.innerHTML = `<div class="okmsg">${esc(r.message)}</div>`; }); });
}
async function reset({ main, query, onLeave }) {
  setTitle('Choose a new password');
  main.innerHTML = html`<div class="auth">${art('New password.', 'Make it long and memorable.')}<div class="auth-form"><div class="auth-card"><h1>New password</h1><form id="f" novalidate style="margin-top:20px"><div class="field"><label for="p">New password</label><input id="p" name="password" type="password" autocomplete="new-password" minlength="10" required autofocus></div><div class="err-slot"></div><button class="btn btn-p btn-lg btn-block" type="submit">Save password</button></form></div></div></div>`.s; withArt(onLeave);
  $('#f').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { await api('/auth/reset', { method: 'POST', body: { token: query.token, password: formData(f).password } }); toast('Password updated. Sign in.', 'ok'); navigate('/login'); }); });
}
async function verify({ main, query }) {
  setTitle('Confirm email'); main.innerHTML = '<div class="wrap" style="padding:220px 0;text-align:center"><h1 class="h-lg">Confirming…</h1></div>';
  try { await api('/auth/verify', { method: 'POST', body: { token: query.token } }); if (state.user) state.user.email_verified = true; main.innerHTML = html`<div class="wrap" style="padding:220px 0;text-align:center"><h1 class="h-lg">Email confirmed.</h1><p class="lede" style="margin:20px auto 34px">You are all set.</p><a class="btn btn-p btn-lg" href="${state.user ? home(state.user) : '/login'}" data-link>Continue</a></div>`.s; }
  catch (e) { main.innerHTML = html`<div class="wrap" style="padding:220px 0;text-align:center"><h1 class="h-lg">Link expired.</h1><p class="lede" style="margin:20px auto 34px">${e.message} Sign in and we will send a new one.</p><a class="btn btn-p btn-lg" href="/login" data-link>Sign in</a></div>`.s; }
}
