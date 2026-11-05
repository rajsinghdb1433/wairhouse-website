'use strict';
// Copies third-party browser libraries out of node_modules into /public/vendor so the site serves everything
// from its own origin (strict Content-Security-Policy, no CDN dependency, nothing to go down).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
try {
  const t = path.join(root, 'node_modules', 'three', 'build');
  for (const f of ['three.module.min.js', 'three.core.min.js']) if (fs.existsSync(path.join(t, f))) cp(path.join(t, f), path.join(out, 'three', f));
  const l = path.join(root, 'node_modules', 'leaflet', 'dist');
  cp(path.join(l, 'leaflet.js'), path.join(out, 'leaflet', 'leaflet.js'));
  cp(path.join(l, 'leaflet.css'), path.join(out, 'leaflet', 'leaflet.css'));
  for (const f of fs.readdirSync(path.join(l, 'images'))) cp(path.join(l, 'images', f), path.join(out, 'leaflet', 'images', f));
  const g = path.join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js');
  if (fs.existsSync(g)) cp(g, path.join(out, 'gsap', 'gsap.min.js'));
  console.log('vendor assets ready');
} catch (e) { console.warn('build-assets skipped:', e.message); }
