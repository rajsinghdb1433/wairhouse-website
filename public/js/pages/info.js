import { html, raw, $, $$, api, state, icon, md, setTitle, toast, esc, money, submitForm, formData, captchaHtml, captchaMount, captchaValues, reveal, splitWords, countUp } from '../lib.js';
import { boxesScene } from '../scenes.js';
import { TYPE_TILES, typeImage, TYPE_LABEL, slotImg, slotMedia, slotUrl } from '../lib.js';
import { calcHtml, wireCalc } from './calc.js';

export default async function info(c) {
  const { main, path } = c;
  if (path === '/host' || path === '/pricing') return host(c);
  if (path === '/how-it-works') return how(c);
  if (path === '/about') return about(c);
  if (path === '/faq') return faq(c);
  if (path === '/contact') return contact(c);
  if (path === '/legal') return legalIndex(c);
  if (path.startsWith('/legal/')) return legal(c);
  return notFound(c);
}

export async function notFound({ main }) {
  setTitle('Page not found');
  main.innerHTML = html`<div class="wrap" style="padding:220px 0 160px;text-align:center"><span class="mono eyebrow">404</span><h1 class="h-xl">Lost in the aisles.</h1><p class="lede" style="margin:24px auto 36px">We could not find that page. Let us get you back to space.</p><a class="btn btn-p btn-lg" href="/" data-link>Back home</a></div>`.s;
}

// ---------- host (owner landing, pricing, benefits) ----------
async function host({ main, onLeave, query }) {
  setTitle('Earn from your spare space');
  const FIRST = { garage: 0, shed: 0, 'spare-room': 1, basement: 1, parking: 2, yard: 2, warehouse: 3, 'self-storage': 3, pallet: 4 }[query?.type] ?? 0;
  const s = state.site.settings; const f = state.site.founding; const faqs = (await api('/faqs?audience=owner').catch(() => ({ faqs: [] }))).faqs;
  const left = Math.max(0, f.slots - f.taken);
  main.innerHTML = html`
  <section class="sec" style="padding-top:calc(var(--hdr) + 90px);overflow:hidden"><div class="cta-band" style="position:absolute;inset:0;border-radius:0;border:0;background:radial-gradient(70% 60% at 80% 20%,rgba(255,107,44,.28),transparent 60%),radial-gradient(60% 60% at 10% 90%,rgba(79,180,255,.2),transparent 60%)"><canvas id="hb" aria-hidden="true"></canvas></div>
    <div class="wrap" style="position:relative"><div class="split2"><div><span class="mono eyebrow">For anyone with space to spare</span><h1 class="h-xl" data-split style="max-width:12ch">Your empty space is someone's <span class="grad-a">missing</span> space.</h1>
      <p class="lede rv" style="margin:30px 0 38px">A garage, spare room, shed, driveway, basement or a whole warehouse bay. List it free, set your price and your rules, and we bring verified customers and handle the booking, messages and payments. No business needed.</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap" class="rv"><a class="btn btn-p btn-lg" href="/host/join" data-link>List your space free</a><a class="btn btn-g btn-lg" href="#earn">What could I earn?</a></div>
      <p class="rv" style="margin-top:34px"><span class="badge acc" style="font-size:14px;padding:9px 18px">⚡ Founding owner offer: ${s.founding_owner_commission_pct}% commission for ${s.founding_owner_months} months · ${left} of ${f.slots} spots left</span></p></div><div class="photo ph-tall rv">${slotMedia('host_hero_image')}</div></div></div></section>

  <section class="sec ink2" id="what"><div class="wrap"><span class="mono eyebrow rv">What can you list?</span><h2 class="h-lg" data-split style="max-width:16ch;margin-bottom:46px">If it is dry, safe and lockable, it can earn.</h2>
    <div class="tiles">${TYPE_TILES.map((t, i) => html`<a class="tile rv" style="--d:${i % 4}" href="/host/join?type=${t.t}" data-link><img src="${typeImage(t.t)}" alt="${t.name}" loading="lazy" decoding="async"><span class="ic">${icon(t.icon)}</span><div class="in"><h3>${t.name}</h3><div class="earn">Earn ${t.earn} ${t.tip}</div><p>${t.blurb}</p><div class="go"><span class="e">List it free</span></div></div></a>`)}</div>
    <p class="muted rv" style="margin-top:30px;text-align:center;font-size:14px">Typical earnings come from published Australian platform and market figures and vary by suburb and demand. They are a guide, not a promise.</p></div></section>

  <section class="sec light"><div class="wrap"><span class="mono eyebrow rv">Why list with us</span><h2 class="h-lg" data-split style="max-width:16ch;margin-bottom:56px">Income from space you are not using.</h2>
    <div class="grid g3">${[['dollar', 'Free to list', 'No set-up fee, no monthly fee. You only pay a small commission when you actually earn.'], ['key', 'You are in control', 'Set the price, the dates, the rules and the hours. Accept or decline every request, or switch on Instant Book.'], ['shield', 'Verified customers', 'See who, what and when before you say yes. Prohibited goods are banned in the rental terms.'], ['chart', 'Pricing help', 'Our price guide shows what similar spaces earn near you, so you start at a smart number.'], ['clock', 'Fast payouts', 'Get paid after the booking starts. Track every dollar in your earnings dashboard.'], ['users', 'Real support', 'A real person, ' + s.contact_name + ', is one call away on ' + s.contact_phone + '.']].map(([i, t, p], k) => html`<div class="card hov rv" style="--d:${k % 3}"><div class="ico">${icon(i)}</div><h3>${t}</h3><p>${p}</p></div>`)}</div></div></section>

  <section class="sec light" id="allowed"><div class="wrap"><span class="mono eyebrow rv">Is it allowed?</span><h2 class="h-lg" data-split style="max-width:18ch;margin-bottom:20px">Four quick checks before you list.</h2><p class="lede rv" style="margin-bottom:46px">Most homes are fine. We ask you to confirm these when you list, so you and your customers are protected.</p>
    <div class="perm">${[['key', 'It is yours to rent', 'You own it, or you rent and your landlord agrees in writing. Check strata or owners corporation by-laws and any council rules.'], ['shield', 'Insurance', 'Home and contents cover often skips other people\'s goods. Tell your insurer. Some listings include goods insurance.'], ['lock', 'Your privacy', 'Your exact address stays hidden until you accept a booking. You choose the access times and can meet at the door.'], ['file', 'The rules are written down', 'Our rental terms ban dangerous goods and overnight stays, and set clear rules for care and access.']].map(([i, t, p], k) => html`<div class="card rv" style="--d:${k}"><div class="ico">${icon(i)}</div><h3 style="font-size:21px">${t}</h3><p style="font-size:15px">${p}</p></div>`)}</div></div></section>

  <section class="sec" id="earn"><div class="wrap"><div class="grid g2" style="gap:60px;align-items:center"><div><span class="mono eyebrow rv">Earnings calculator</span><h2 class="h-lg" data-split>See what your space could earn.</h2><p class="lede rv" style="margin-top:22px">Pick what you have and slide to your price. The starting points come from published Australian rates, and you can change your price any time.</p></div>
    ${calcHtml(FIRST)}</div></div></section>

  <section class="sec light"><div class="wrap"><span class="mono eyebrow rv">Simple, honest pricing</span><h2 class="h-lg" data-split style="max-width:18ch;margin-bottom:56px">One small commission. Nothing else.</h2>
    <div class="grid g3"><div class="card rv"><span class="badge acc">Founding owners</span><div class="bignum" style="margin:18px 0 8px">${s.founding_owner_commission_pct}%</div><h3>for ${s.founding_owner_months} months</h3><p>For our first ${f.slots} owners. Every booking, every dollar, yours. ${left} spots left.</p></div>
      <div class="card rv" style="--d:1"><span class="badge">Standard</span><div class="bignum" style="margin:18px 0 8px">${s.owner_commission_pct}%</div><h3>of each booking</h3><p>Taken from your payout only when a booking happens. Customers pay a separate ${s.service_fee_pct}% service fee on top.</p></div>
      <div class="card rv" style="--d:2"><span class="badge">Compare</span><div class="bignum" style="margin:18px 0 8px">15 to 23%</div><h3>What other platforms take</h3><p>Space and parking marketplaces have reported commissions of roughly 15% to 23%, and big travel platforms about 15.5%. Ours is about half of that, and often nothing.</p></div></div>
    <h3 class="h-md rv" style="margin:70px 0 10px;font-size:30px">What spaces earn: our price guide</h3><p class="muted rv" style="margin-bottom:22px">Typical Australian ranges from published platform and market rates (garages, rooms and car spaces are monthly per space). Use them as a starting point, not a promise.</p>
    <div style="overflow-x:auto" class="rv"><table class="compare"><thead><tr><th>Space type</th><th>Typical price</th><th>How it is priced</th></tr></thead><tbody>
      <tr><td>Garage (lock-up, single)</td><td>$200 to $350</td><td>per space, per month</td></tr><tr><td>Spare room, attic or basement</td><td>$110 to $250</td><td>per space, per month</td></tr><tr><td>Shed or backyard</td><td>$80 to $200</td><td>per space, per month</td></tr><tr><td>Driveway or car space</td><td>$150 to $250 (outer suburbs), $300 to $450+ (covered, near the city)</td><td>per space, per month</td></tr>
      <tr><td>Pallet position (racked)</td><td>$3.75 to $5.50</td><td>per pallet, per week</td></tr><tr><td>Cold-storage pallet</td><td>$8 to $14</td><td>per pallet, per week</td></tr><tr><td>Warehouse floor</td><td>$12 to $25</td><td>per m², per month</td></tr><tr><td>Self-storage unit (small to medium)</td><td>$80 to $350</td><td>per unit, per month</td></tr><tr><td>Container (20ft)</td><td>$180 to $300</td><td>per container, per month</td></tr><tr><td>Open yard / hardstand</td><td>$6 to $15</td><td>per m², per month</td></tr></tbody></table></div></div></section>

  <section class="sec"><div class="wrap"><span class="mono eyebrow rv">How hosting works</span><h2 class="h-lg" data-split style="margin-bottom:50px">Live in about ten minutes.</h2><div class="steps" style="max-width:820px">
    <div class="step rv"><div><h3 class="h-md">Create your owner account</h3><p class="lede" style="margin-top:8px">Tell us who you are. Takes two minutes.</p></div></div>
    <div class="step rv"><div><h3 class="h-md">Add your space</h3><p class="lede" style="margin-top:8px">Photos, size, features, price and rules. We guide you through each box.</p></div></div>
    <div class="step rv"><div><h3 class="h-md">We check it, you go live</h3><p class="lede" style="margin-top:8px">Our team usually approves within one business day. Then customers can find you.</p></div></div>
    <div class="step rv"><div><h3 class="h-md">Accept bookings, get paid</h3><p class="lede" style="margin-top:8px">Review each request, accept the ones you like, and get your payout after the booking starts.</p></div></div></div></div></section>

  <section class="sec light"><div class="wrap" style="max-width:900px"><span class="mono eyebrow rv">Owner questions</span><h2 class="h-lg" data-split style="margin-bottom:40px">Straight answers.</h2><div class="acc rv">${faqs.map((f2) => html`<details><summary>${f2.question}</summary><p>${f2.answer}</p></details>`)}</div></div></section>
  <section class="sec" style="padding-top:0"><div class="wrap"><div class="cta-band center has-img" style="--bg-img:url('${slotUrl('host_cta_image')}')"><span class="mono eyebrow">Ready?</span><h2 class="h-xl" style="margin:0 auto;max-width:11ch">Put your space to work.</h2><p class="lede" style="margin:24px auto 36px">Questions first? Call ${s.contact_name} on <a class="link" href="tel:${s.contact_phone}">${s.contact_phone}</a>.</p><a class="btn btn-p btn-lg" href="/host/join" data-link>List your space free</a></div></div></section>`.s;
  try { const b = boxesScene($('#hb'), { count: 40 }); onLeave(() => b.dispose()); } catch (_) { /* no webgl */ }
  // calculator
  wireCalc($('#earn'), FIRST);
  if (query?.type) setTimeout(() => $('#earn')?.scrollIntoView({ behavior: 'smooth' }), 400);
}

// ---------- how it works ----------
async function how({ main }) {
  setTitle('How it works');
  main.innerHTML = html`<section class="sec" style="padding-top:calc(var(--hdr) + 90px)"><div class="wrap"><span class="mono eyebrow">How it works</span><h1 class="h-xl" data-split style="max-width:12ch">Simple for everyone.</h1></div></section>
  <section class="sec light"><div class="wrap"><div class="grid g2" style="gap:60px"><div><span class="badge acc">For customers</span><div class="photo ph-wide rv" style="margin:22px 0 4px">${slotMedia('how_customer_image')}</div><h2 class="h-lg" style="margin:18px 0 36px">Need space?</h2><div class="steps">${[['Search', 'Browse the map and filter by type, price and features. Open any listing for photos, exact size and a 3D planner.'], ['Request', 'Pick your dates and quantity. You see the full price first. Nothing is charged until the owner accepts.'], ['Store', 'Get the address and access details after confirmation. Extend or leave when you like.']].map(([t, p]) => html`<div class="step rv"><div><h3 class="h-md" style="font-size:28px">${t}</h3><p class="muted" style="margin-top:6px">${p}</p></div></div>`)}</div><a class="btn btn-l btn-lg" style="margin-top:36px" href="/search" data-link>Find space</a></div>
    <div><span class="badge acc">For hosts</span><div class="photo ph-wide rv" style="margin:22px 0 4px">${slotMedia('how_owner_image')}</div><h2 class="h-lg" style="margin:18px 0 36px">Have space?</h2><div class="steps">${[['List', 'Add photos, size, features and your price. It is free.'], ['Approve', 'Our team checks every listing. Then you are visible to customers.'], ['Earn', 'Accept the requests you like and get paid after the booking starts.']].map(([t, p]) => html`<div class="step rv"><div><h3 class="h-md" style="font-size:28px">${t}</h3><p class="muted" style="margin-top:6px">${p}</p></div></div>`)}</div><a class="btn btn-l btn-lg" style="margin-top:36px" href="/host" data-link>Start hosting</a></div></div></div></section>
  <section class="sec"><div class="wrap"><span class="mono eyebrow rv">Trust and safety</span><h2 class="h-lg" data-split style="margin-bottom:50px;max-width:16ch">Built to be trusted.</h2><div class="grid g3">${[['shield', 'Every listing reviewed', 'Our team checks new listings before they go live.'], ['lock', 'Secure by design', 'Encrypted connections, hashed passwords, human checks and two-factor sign-in.'], ['file', 'Clear rules', 'Written rental terms, a prohibited goods list and a fair cancellation policy.'], ['star', 'Honest reviews', 'Only customers with a real booking can review.'], ['key', 'Insurance options', 'Many spaces include insurance. Every owner carries public liability cover.'], ['phone', 'Humans on the line', 'Call or email any time. Real people answer.']].map(([i, t, p], k) => html`<div class="card hov rv" style="--d:${k % 3}"><div class="ico">${icon(i)}</div><h3>${t}</h3><p>${p}</p></div>`)}</div></div></section>`.s;
}

// ---------- about / cms ----------
async function about({ main }) {
  setTitle('About');
  const s = state.site.settings; const { page } = await api('/pages/about');
  main.innerHTML = html`<section class="sec" style="padding-top:calc(var(--hdr) + 80px)"><div class="wrap" style="max-width:900px"><div class="photo ph-banner rv" style="margin-bottom:44px">${slotMedia('about_image')}</div><div class="prose" style="max-width:none">${md(page.body)}</div>
    <div class="card" style="margin-top:50px;display:flex;gap:26px;align-items:center;flex-wrap:wrap"><div class="avatar" style="width:84px;height:84px;font-size:34px">${s.contact_name[0]}</div><div style="flex:1;min-width:220px"><h3 style="margin-bottom:4px">${s.contact_name}</h3><p>${s.contact_role}, ${s.business_name}</p><p><a class="link" href="tel:${s.contact_phone}">${s.contact_phone}</a> · <a class="link" href="mailto:${s.contact_email}">${s.contact_email}</a></p></div><a class="btn btn-p" href="/contact" data-link>Get in touch</a></div></div></section>`.s;
}

// ---------- faq ----------
async function faq({ main }) {
  setTitle('Help centre and FAQ'); const { faqs } = await api('/faqs');
  let aud = 'customer';
  const draw = () => { $('#fl').innerHTML = faqs.filter((f) => f.audience === aud).map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join(''); $$('#ft button').forEach((b) => b.classList.toggle('on', b.dataset.a === aud)); };
  main.innerHTML = html`<section class="sec light" style="padding-top:calc(var(--hdr) + 80px)"><div class="wrap" style="max-width:900px"><span class="mono eyebrow">Help centre</span><h1 class="h-lg" style="margin-bottom:36px">Questions, answered.</h1><div class="seg" id="ft"><button data-a="customer" class="on">Renting space</button><button data-a="owner">Hosting space</button></div><div class="acc" id="fl"></div>
    <div class="card" style="margin-top:50px;text-align:center"><h3>Still stuck?</h3><p style="margin-bottom:20px">Call ${state.site.settings.contact_name} on <a class="link" href="tel:${state.site.settings.contact_phone}">${state.site.settings.contact_phone}</a> (${state.site.settings.support_hours}) or send a message.</p><a class="btn btn-l" href="/contact" data-link>Contact us</a></div></div></section>`.s;
  $('#ft').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { aud = b.dataset.a; draw(); } }); draw();
}

// ---------- contact ----------
async function contact({ main }) {
  setTitle('Contact us'); const s = state.site.settings; const cap = await captchaHtml('cap');
  main.innerHTML = html`<section class="sec" style="padding-top:calc(var(--hdr) + 80px)"><div class="wrap"><span class="mono eyebrow">Contact</span><h1 class="h-xl" style="max-width:10ch" data-split>Say hello.</h1><div class="grid g2" style="margin-top:60px;gap:50px;align-items:start">
    <div><p class="lede" style="margin-bottom:34px">Questions about renting, listing, bookings or partnering? We reply within one business day, usually much faster.</p>
      <div class="card" style="margin-bottom:16px"><div class="ico">${icon('user')}</div><h3>${s.contact_name}</h3><p>${s.contact_role}, ${s.business_name}</p></div>
      <div class="card" style="margin-bottom:16px"><div class="ico">${icon('phone')}</div><h3><a href="tel:${s.contact_phone}">${s.contact_phone}</a></h3><p>${s.support_hours}</p></div>
      <div class="card"><div class="ico">${icon('mail')}</div><h3><a href="mailto:${s.contact_email}">${s.contact_email}</a></h3><p>${s.business_address}</p></div><div class="photo ph-wide rv" style="margin-top:16px">${slotImg('contact_image')}</div></div>
    <form class="card" id="cf" novalidate><h3 style="margin-bottom:20px">Send a message</h3><div class="row"><div class="field"><label for="n">Name</label><input id="n" name="name" required autocomplete="name"></div><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email"></div></div>
      <div class="row"><div class="field"><label for="p">Phone <span class="muted">(optional)</span></label><input id="p" name="phone" autocomplete="tel"></div><div class="field"><label for="s">Topic</label><select id="s" name="subject"><option>Renting space</option><option>Listing my space</option><option>A booking</option><option>Partnerships</option><option>Something else</option></select></div></div>
      <div class="field"><label for="m">Message</label><textarea id="m" name="message" required minlength="10" maxlength="4000"></textarea></div><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">${cap}<div class="err-slot"></div><button class="btn btn-p btn-block btn-lg" type="submit">Send message</button></form></div></div></section>`.s;
  captchaMount(main);
  $('#cf').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; submitForm(f, async () => { await api('/contact', { method: 'POST', body: { ...formData(f), ...captchaValues(f) } }); f.innerHTML = '<div class="empty"><h3>Thank you.</h3><p>Your message is on its way. A confirmation is in your inbox, and we will reply soon.</p></div>'; }); });
}

// ---------- legal ----------
async function legalIndex({ main }) {
  setTitle('Legal'); const { pages } = await api('/pages');
  main.innerHTML = html`<section class="sec" style="padding-top:calc(var(--hdr) + 80px)"><div class="wrap" style="max-width:800px"><span class="mono eyebrow">Legal</span><h1 class="h-lg" style="margin-bottom:34px">Policies and terms.</h1><div class="grid">${pages.filter((p) => p.category === 'legal').map((p) => html`<a class="card hov" href="/legal/${p.slug}" data-link style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">${p.title}</h3><span class="link">Read →</span></a>`)}</div></div></section>`.s;
}
async function legal({ main, path }) {
  const slug = path.split('/')[2]; let page; try { page = (await api('/pages/' + slug)).page; } catch (_) { return notFound({ main }); }
  setTitle(page.title);
  main.innerHTML = html`<section class="sec" style="padding-top:calc(var(--hdr) + 80px)"><div class="wrap"><article class="prose">${md(page.body)}<hr style="border:0;border-top:1px solid var(--line);margin:40px 0 20px"><p class="muted" style="font-size:14px">Version ${page.version}. Questions about this document? Contact ${state.site.settings.contact_name} on ${state.site.settings.contact_phone} or ${state.site.settings.contact_email}. <a class="link" href="/legal" data-link>All policies</a></p></article></div></section>`.s;
}
