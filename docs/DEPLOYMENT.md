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
   - `SMTP_USER=raj_softdev@hotmail.com`, `SMTP_PASS=` your **app password** (see "Email" below)
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

## Email: sending from raj_softdev@hotmail.com for now

All system emails (welcome, bookings, password resets, owner invitations) go from, and replies come back to, `raj_softdev@hotmail.com`.

1. Sign in at account.microsoft.com > **Security** > **Advanced security options**. Turn on **two-step verification**.
2. In the same place choose **Create a new app password**. Copy the 16-character code.
3. Put it in `SMTP_PASS` (host `smtp-mail.outlook.com`, port 587, `SMTP_SECURE=false`, already the defaults).
4. Restart the app, then in Admin > Email press **Send test email**.

Limits and advice: personal Hotmail is rate-limited (a few hundred emails a day) and mail may land in Junk. When you have a business domain, switch to a transactional sender (Amazon SES, Postmark, Brevo or Microsoft 365 / Google Workspace), set **SPF, DKIM and DMARC**, and change `SMTP_*` and `MAIL_FROM`. No code changes needed.

Until SMTP is connected nothing is lost: every email is saved in **Admin > Email** and can be retried.

## Backups

- Database: copy `wairhouse.db` (and the `-wal` file if present) nightly, or run `sqlite3 wairhouse.db ".backup backup.db"`.
- Photos: copy the `uploads/` folder.
- Keep `APP_SECRET` safe. Without it encrypted payout details cannot be read.
- Hostinger has daily backups on most plans; also keep your own weekly copy off the server.

## After every code change

```bash
npm test      # 54 end-to-end checks on a throwaway database
git push      # Hostinger redeploys automatically from GitHub
```

## Regenerating photos and the hero video

`node scripts/render-media.js` re-renders every listing photo and the fly-through video from the 3D scenes (needs Chromium via Playwright and ffmpeg). Real owners upload their own photos; these defaults are placeholders for sample listings.
