# Security overview

What is built in, what to switch on, and what is still your job.

## Built in

| Threat | Defence |
|---|---|
| Bots, credential stuffing, spam | Built-in image captcha on sign-in, sign-up, password reset and contact (single use, 5 minute life, minimum solve time). Optional **Cloudflare Turnstile** upgrade (set 2 env vars). Hidden honeypot field. Per-IP rate limits on every sensitive route. Account lockout after 6 bad passwords (15 minutes). |
| Password theft | bcrypt cost 12, min 10 characters, common-password and email-in-password checks, constant-time login (no "email not found" leak), reset links single-use for 1 hour, all sessions revoked on reset. |
| Account takeover | Optional **TOTP two-factor** (Google Authenticator, 1Password, etc.) for everyone, strongly recommended for owners and admins. Admin sessions expire after 8 hours. Random temporary admin password on first run, forced change at first sign-in. |
| Session theft | Random 256-bit session tokens stored only as SHA-256 hashes; `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed cookie in production. |
| CSRF | Per-session CSRF token on every state-changing request, plus Origin check, plus SameSite cookies. |
| XSS | Strict Content-Security-Policy (`script-src 'self'`, no inline scripts, no third-party scripts). The front end HTML-escapes all dynamic values by default (templating tag). Legal pages are rendered by a markdown subset that escapes first. Uploaded files are served with `nosniff` and a sandboxing CSP. |
| SQL injection | Every query is parameterised. Search input is escaped for LIKE wildcards. |
| Malicious uploads | Only JPEG/PNG/WebP, 8 MB max, **re-encoded through sharp** (strips EXIF/GPS and any embedded payload), random file names, pixel limit against decompression bombs. |
| Clickjacking, MIME sniffing, leakage | `frame-ancestors 'none'`, `X-Content-Type-Options`, strict Referrer-Policy, Permissions-Policy, HSTS (preload) on HTTPS, `x-powered-by` removed. |
| Data at rest | Owner payout details encrypted with AES-256-GCM. Passwords hashed. Admin CSV exports neutralise spreadsheet formula injection. |
| Access control | Role checks on every API route (customer / owner / admin). Owners only see their own spaces and bookings. Customers only see exact addresses after a booking is accepted. |
| Location privacy | The street address is never in any public response; it is shown only to the host, admins, and a customer whose booking is accepted. Visitors see an approximate map pin: a stable offset of about 150 to 450 metres, different per listing and derived from the server secret, so a host who drops the pin on their house is not pinpointed. Pins are placed automatically from the suburb and postcode using a built-in list of Australian localities (no outside geocoding service, nothing is sent anywhere). |
| Email abuse | Outreach respects a permanent suppression list, signed one-click unsubscribe links (HMAC), 3-day contact cool-down, paced sending, `List-Unsubscribe` headers. Forged links are rejected. |
| Payments | Card data never touches this server (Stripe Checkout). Webhook is verified by HMAC signature with a 5-minute timestamp window. |
| Audit | Sign-ins, failed logins, role changes, approvals, outreach sends and settings changes are logged (Admin > Security log). |
| Privacy | Self-service data export and account deletion (anonymisation), consent records for terms and privacy. |

## Before you go live (checklist)

1. Set `SITE_URL` to your real https address and `NODE_ENV=production`.
2. Set a long `APP_SECRET` (see `.env.example`). Never lose it: payout details are encrypted with a key derived from it.
3. Turn on **two-factor** for your admin account (Admin > My security).
4. Optional but recommended: add **Cloudflare Turnstile** keys.
5. Put the site behind HTTPS (Hostinger and Cloudflare both do this for free).
6. Set up automatic backups of `data/wairhouse.db` and `uploads/` (see DEPLOYMENT.md).
7. Have a solicitor review the legal pages, and add your ABN in Site settings.
8. Run `npm test` after any change.

## Known limits (honest list)

- Rate limiting is in memory, per server process. One Node process is fine; if you ever scale to several, move limits to Redis.
- SQLite is perfect for launch and tens of thousands of listings. Move to Postgres when you need multiple servers.
- Identity verification of owners is email + admin review today. Add a document check (for example Stripe Identity) as volume grows.
- Personal Hotmail/Outlook.com cannot send through SMTP (Microsoft disabled password sign-in), so mail is sent from a mailbox on your own domain, with Hotmail as the Reply-To. A normal mailbox handles a few hundred emails a day; for marketing volume move to a transactional provider and set SPF, DKIM and DMARC so mail does not land in spam.
- The built-in picture check stops scripts and casual bots, not a determined attacker with a paid solving service. For stronger protection switch on Cloudflare Turnstile (free): set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` and the site uses it automatically.
