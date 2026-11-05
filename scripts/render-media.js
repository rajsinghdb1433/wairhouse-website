'use strict';
// Renders the site's photos and hero video from the procedural 3D scenes in public/js/scenes.js, using headless Chromium.
//   node scripts/render-media.js            -> all photos + hero video
//   node scripts/render-media.js stills     -> photos only
//   node scripts/render-media.js video      -> hero video only
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const sharp = require('sharp');
const { chromium } = require('playwright');

const PUB = path.join(__dirname, '..', 'public');
const what = process.argv[2] || 'all';
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const PAGE = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000"><script type=module>
import {stillScene,heroFrames} from '/js/scenes.js';
window.still=(kind,w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;document.body.innerHTML='';document.body.appendChild(c);const s=stillScene(c,kind,w,h);s.render(0.5);return c.toDataURL('image/png');};
let hf=null;window.hfInit=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;document.body.innerHTML='';document.body.appendChild(c);hf=heroFrames(c,w,h);return true;};
window.hfFrame=(p,t,q)=>{hf.render(p,t);return document.querySelector('canvas').toDataURL('image/jpeg',q||0.88);};
window.ready=true;</script>`;
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0]; if (u === '/__render') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  const f = path.join(PUB, path.normalize(u).replace(/^(\.\.[/\\])+/, '')); if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); }); page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(base + '/__render'); await page.waitForFunction('window.ready === true', null, { timeout: 30000 });
  const out = path.join(PUB, 'img', 'spaces'); fs.mkdirSync(out, { recursive: true });
  if (what === 'all' || what === 'stills') {
    for (const kind of ['racking', 'dock', 'cold', 'selfstorage', 'containers', 'hero']) {
      const t0 = Date.now(); const url = await page.evaluate(([k, w, h]) => window.still(k, w, h), [kind, 1600, 1000]);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, kind + '.jpg'));
      await sharp(buf).resize(640, 400).jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(out, kind + '-sm.jpg'));
      console.log('still', kind, Date.now() - t0, 'ms');
    }
    const og = await sharp(path.join(out, 'hero.jpg')).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer(); fs.writeFileSync(path.join(PUB, 'img', 'og-cover.jpg'), og);
  }
  if (what === 'all' || what === 'video') {
    const W = 1280, H = 720, FPS = 24, SECS = 10, N = FPS * SECS; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whframes-'));
    await page.evaluate(([w, h]) => window.hfInit(w, h), [W, H]); const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const p = i / (N - 1); const url = await page.evaluate(([p2, t]) => window.hfFrame(p2, t, 0.9), [p, i / FPS]);
      fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      if (i % 24 === 0) console.log('frame', i, '/', N, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    const vdir = path.join(PUB, 'video'); fs.mkdirSync(vdir, { recursive: true });
    const r = spawnSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.join(vdir, 'flythrough.mp4')], { stdio: 'inherit' });
    if (r.status !== 0) console.log('ffmpeg failed');
    fs.copyFileSync(path.join(dir, `f${String(Math.floor(N * 0.3)).padStart(4, '0')}.jpg`), path.join(vdir, 'flythrough-poster.jpg'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await browser.close(); server.close(); console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
