# Going live: step by step

wAIRhouse is one Node.js app (no build step, no external database). It needs **Node 22.13 or newer** and a place to keep the `data/` and `uploads/` folders.

## Option A: Hostinger (Node.js hosting) , recommended since you already have an account

1. **Domain.** Buy or choose the domain (for example `wairhouse.com.au`; `.com.au` needs an ABN). In hPanel add it to a **Node.js** website.
   *Your account currently holds three other sites, so deploy wAIRhouse to its own new domain or subdomain, never over those.*
2. **Connect GitHub.** In hPanel > Websites > your site > **Node.js** > Import Git repository > choose `rajsinghdb1433/wairhouse-website`, branch `main` (merge the working branch first). Framework: *Other*. Node version: **22**. Build command: `npm install`. Start command: `npm start`. Entry file: `server/index.js`.
3. **Environment variables.** In the same screen add the values from `.env.example`. The important ones:
   - `NODE_ENV=production`
   - `SITE_URL=https://your-domain` (exact, https, no trailing slash)
   - `APP_SECRET=` a long random string (run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Keep a copy in your password manager.**
   - `ADMIN_EMAIL=raj_softdev@hotmail.com`, `ADMIN_PASSWORD=` a strong password you choose (or leave empty and read the generated one in the app log on first start)
   - Email is connected afterwards inside the site, in **Admin > Email** (see "Email" below). Nothing to set here.
   - `SEED_DEMO=false` if you want a clean launch with no sample listings (you can also remove them in one click from Admin > Dashboard)
4. **Persistent storage.** Make sure `data/` (database) and `uploads/` (photos) survive redeploys. On Hostinger set `DATA_DIR` and `UPLOAD_DIR` to folders **outside** the deployed app folder, for example `/home/uXXXX/wairhouse-data` and `/home/uXXXX/wairhouse-uploads`, and create them first.
5. **Deploy**, open `https://your-domain`, sign in at `/login` with the admin email, set a new password, then follow the **Go-live checklist** on the Admin dashboard.
6. **SSL:** enable the free SSL certificate and "Force HTTPS" in hPanel.
7. **Stripe webhook** (when you add payments): endpoint `https://your-domain/api/stripe/webhook`, event `checkout.session.completed`.

## Option B: any VPS or Docker host

```bash
git clone https://github.com/rajsinghdb1433/wairhouse-website && cd wairhouse-website
cp .env.example .env     # fill it in
npm install --omit=dev
npm start                # or run under pm2 / systemd
```
Put nginx or Caddy in front for HTTPS and set `TRUST_PROXY=1`. A `Dockerfile` is included.

## Email: connect a mailbox in Admin > Email

The site sends the welcome and confirm-your-email message, password resets, booking updates and owner invitations. **The mailbox it sends from is chosen inside the admin area** (Admin > Email), so there is nothing to edit in code and no restart.

**Why not raj_softdev@hotmail.com?** Microsoft has switched off password and app-password sign-in (SMTP "basic authentication") for personal Hotmail, Outlook.com and Live accounts. A website can no longer log in as that address to send mail, whatever password is used. That address is still the right place to **receive** replies, so set it as the **Reply-to**: customers who press Reply write straight to your Hotmail inbox.

Recommended setup (about two minutes):

1. In hPanel > **Emails**, create a mailbox on your domain, for example `hello@your-domain`. Some Hosting plans include mailboxes; otherwise Hostinger Email is a small monthly fee.
2. In the site, open **Admin > Email**, pick **Hostinger Email** (it fills `smtp.hostinger.com`, port 465, SSL), then enter the mailbox address and its password. Leave **Reply-to** as `raj_softdev@hotmail.com`.
3. Press **Save and test connection**, then **Send test email** to your Hotmail address.
4. If sign-ups arrived before email was connected, press **Send N waiting emails now**. Nothing is lost while email is off: every message is kept in the outbox and sent once, never twice.

Other providers work the same way (Google Workspace, Microsoft 365 for business, Brevo and others): pick the preset, or choose *Custom* and type the server details.

How the password is kept: it is encrypted with AES-256-GCM (keyed from `APP_SECRET`) in the database, is never shown again, and is never returned by the API. Keep a copy of `APP_SECRET`; without it the saved mailbox password cannot be decrypted and you would simply enter it again.

Environment variables still work as a fallback when nothing is saved in Admin > Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`.

Deliverability: send From the mailbox's own address (never From a Hotmail address through another server, it fails SPF and DMARC and lands in spam). If your domain's DNS is at Hostinger, SPF and DKIM are normally added for you; also add a DMARC record (`v=DMARC1; p=none; rua=mailto:hello@your-domain`) and tighten it to `quarantine` after a few weeks of clean reports. For marketing volume (owner outreach in bulk), use a transactional sender such as Brevo, Postmark or Amazon SES.

## Backups

- Database: copy `wairhouse.db` (and the `-wal` file if present) nightly, or run `sqlite3 wairhouse.db ".backup backup.db"`.
- Photos: copy the `uploads/` folder.
- Keep `APP_SECRET` safe. Without it encrypted payout details cannot be read.
- Hostinger has daily backups on most plans; also keep your own weekly copy off the server.

## After every code change

```bash
npm test      # end-to-end checks (site, security, human check, email) on a throwaway database
git push      # Hostinger redeploys automatically from GitHub
```

## Regenerating photos and the hero video

`node scripts/render-media.js` re-renders every listing photo and the fly-through video from the 3D scenes (needs Chromium via Playwright and ffmpeg). Real owners upload their own photos; these defaults are placeholders for sample listings.
