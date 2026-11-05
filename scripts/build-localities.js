'use strict';
// Builds server/data/au-localities.json, the built-in list used to put a listing on the map from its suburb and postcode.
//
//   node scripts/build-localities.js path/to/aus_postcodes.json
//
// Source: Matthew Proctor's Australian Postcodes (https://www.matthewproctor.com/australian_postcodes), as packaged in the npm
// package "aus-postcode-suburbs" (lib/resources/aus_postcodes.json). Please credit the source if you publish the data.
// Only real delivery areas are kept (no PO boxes or bulk-mail receivers, which have no meaningful position).
const fs = require('fs'); const path = require('path');

const input = process.argv[2];
if (!input) { console.error('Usage: node scripts/build-localities.js path/to/aus_postcodes.json'); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
const norm = (s) => String(s || '').toUpperCase().replace(/[’'`.]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
const out = {}; let kept = 0;
for (const r of rows) {
  if (r.type === 'LVR' || r.type === 'Post Office Boxes') continue;
  const lat = Number(r.Lat_precise || r.lat), lng = Number(r.Long_precise || r.long);
  if (!(lat < -9 && lat > -44.5 && lng > 112 && lng < 154.5)) continue; // mainland and Tasmania only
  const pc = String(r.postcode || '').padStart(4, '0'); const name = norm(r.locality); if (!/^\d{4}$/.test(pc) || !name) continue;
  const list = out[pc] || (out[pc] = []);
  if (list.some((x) => x[0] === name && x[3] === r.state)) continue;
  list.push([name, Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4, r.state]); kept++;
}
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
const dest = path.join(__dirname, '..', 'server', 'data', 'au-localities.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(sorted));
console.log(`Wrote ${kept} localities in ${Object.keys(sorted).length} postcodes to ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
