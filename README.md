# wAIRhouse

**The marketplace for warehouse and storage space. Airbnb, but for pallets, units, containers and sheds.**
Animated 3D front end, three portals (Customer, Owner, Admin), a Node.js backend, and everything needed to go live.

Run it locally:

```bash
npm install
cp .env.example .env     # optional for local use
npm start                # http://localhost:3000
```
On first start an admin account is created for `raj_softdev@hotmail.com` with a random temporary password printed in the console (also saved to `data/INITIAL_ADMIN_PASSWORD.txt`). Sign in at `/login` and you will be asked to choose a new one. Set `ADMIN_PASSWORD` to choose it yourself.

## What is in the box

| Area | What you get |
|---|---|
| **Public site** | Scroll-driven 3D warehouse fly-through hero (three.js), pinned "find your size" 3D room, search with map and filters (Leaflet + OpenStreetMap), listing pages with gallery, 3D space planner, live price quote and booking, host landing page with earnings calculator and pricing, How it works, About, FAQ, Contact, 7 legal pages. |
| **Customer portal** `/account` | Bookings (cancel, pay, review), wishlist, messages, profile, password, two-factor, data export and account deletion. |
| **Owner portal** `/owner` | Overview and earnings charts, add/edit spaces (photos, map pin, features, pricing, Instant Book), booking requests (accept, decline, mark started/complete), messages, payouts (encrypted). |
| **Admin panel** `/admin` | Dashboard with go-live checklist, listing approvals, bookings and payments, users and roles, **owner outreach** (add or import warehouse owners, branded invite emails, tracking, unsubscribe handling), inbox, **legal and page editor**, FAQ editor, **site settings that control the whole site** (contact details, fees, homepage copy, switches, captcha toggles), email outbox, security log. |
| **Backend** | Express 5 + SQLite (`node:sqlite`, zero native database dependencies), REST API, signed sessions, TOTP 2FA, captcha, CSRF, rate limits, upload re-encoding, Stripe Checkout (optional), nodemailer. |
| **Email** | Branded HTML emails with logo, signature (Raj Singh, 0470368696) and unsubscribe, plus plain-text versions. Sent from and replying to `raj_softdev@hotmail.com` until you add a business mailbox. |
| **Media** | All photos and the hero video are rendered from the site's own 3D scenes (`node scripts/render-media.js`). |

Your details (name, phone, email, ABN, address) live in **Admin > Site settings** and flow into the header, footer, emails and every legal page automatically.

## Documents

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Hostinger and VPS steps, environment variables, Hotmail app-password email, backups.
- [`docs/SECURITY.md`](docs/SECURITY.md): every protection built in, a pre-launch checklist, and the honest limits.
- [`docs/PRICING-RESEARCH.md`](docs/PRICING-RESEARCH.md): Australian market pricing, what Airbnb charges, recommended wAIRhouse fees, and customer benefits.

## Project layout

```
server/           Express app, routes (auth, public, account, owner, admin), mailer, captcha, seed, legal text
public/           index.html, css, js (app, lib, scenes, pages), fonts, vendor (three.js, Leaflet), img, video
scripts/          smoke-test.js (54 checks), render-media.js, build-assets.js
docs/             deployment, security, pricing
```

## Legal notice

The legal pages are well-structured Australian-law templates (Australian Consumer Law, Privacy Act 1988 and APPs, Spam Act 2003, Notifiable Data Breaches). They are **not legal advice**. Have a solicitor review them and add your ABN before taking payments. You can edit all of them in the admin panel and each edit bumps the version.

## Testing

`npm test` boots the real server on a throwaway database and checks the full flow (owner lists, admin approves, customer books, owner accepts, messaging, reviews, outreach and unsubscribe) and the main security properties (CSRF, role guards, captcha, lockout, honeypot, upload sanitising, SQL injection, unsubscribe forgery).
