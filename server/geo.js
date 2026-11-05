'use strict';
// Map positions for listings, kept deliberately approximate.
//
//  - locate(): finds a suburb-level position from the suburb, state and postcode a host typed, using a built-in list of Australian
//    localities (server/data/au-localities.json, see scripts/build-localities.js). Nothing is sent to any outside service, and the
//    street address is never used, because it stays private until a booking is confirmed.
//  - fuzz():   what visitors see. A stable offset of roughly 150 to 450 metres, different for every listing and impossible to undo
//    without the server secret, so a host who drops the pin on their house is not pinpointed on the public map.
//  - backfill(): puts listings that have no position yet on the map (run at start-up).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hmac } = require('./util');

let table = null, byName = null; // postcode -> [[NAME, lat, lng, STATE], ...]   and   "NAME|STATE" -> [[lat, lng], ...]
function load() {
  if (table) return table;
  try { table = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'au-localities.json'), 'utf8')); } catch (_) { table = {}; }
  byName = new Map();
  for (const rows of Object.values(table)) for (const [n, lat, lng, st] of rows) { const k = `${n}|${st}`; byName.has(k) ? byName.get(k).push([lat, lng]) : byName.set(k, [[lat, lng]]); }
  return table;
}
// A suburb name that means one place within the state (several entries that are all within about 5 km count as one). "Broadway NSW" does not.
function uniqueByName(names, st) {
  if (!st) return null;
  for (const n of names) { const a = byName.get(`${n}|${st}`); if (a && a.every((c) => Math.abs(c[0] - a[0][0]) < 0.05 && Math.abs(c[1] - a[0][1]) < 0.05)) return a[0]; }
  return null;
}
const norm = (s) => String(s || '').toUpperCase().replace(/[’'`.]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
// "Mt Druitt" and "Mount Druitt", "St Marys" and "Saint Marys" are the same place
const spellings = (n) => [...new Set([n, n.replace(/^MT /, 'MOUNT '), n.replace(/^MOUNT /, 'MT '), n.replace(/^ST /, 'SAINT '), n.replace(/^SAINT /, 'ST ')])];
const mean = (rows, i) => Math.round((rows.reduce((s, r) => s + r[i], 0) / rows.length) * 1e4) / 1e4;

// -> { lat, lng, how: 'suburb' | 'postcode' } or null
function locate({ suburb, state, postcode } = {}) {
  const t = load(); const pc = String(postcode || '').trim(); const st = String(state || '').toUpperCase(); const names = spellings(norm(suburb)).filter(Boolean);
  const rows = t[pc];
  if (rows && rows.length) {
    for (const n of names) { const hit = rows.find((r) => r[0] === n && (!st || r[3] === st)) || rows.find((r) => r[0] === n); if (hit) return { lat: hit[1], lng: hit[2], how: 'suburb' }; }
    // The suburb is not on that postcode (a typo in one of them). Trust the suburb if its name means one place in the state, else use the middle
    // of the postcode, but only within the chosen state. A pin in the wrong state is worse than none.
    const named = uniqueByName(names, st); if (named) return { lat: named[0], lng: named[1], how: 'suburb' };
    const same = rows.filter((r) => !st || r[3] === st);
    if (same.length) return { lat: mean(same, 1), lng: mean(same, 2), how: 'postcode' };
  }
  const named = uniqueByName(names, st); if (named) return { lat: named[0], lng: named[1], how: 'suburb' }; // unknown postcode: the suburb name alone, if it is unambiguous
  return null;
}

// Stable approximate position for the public. `id` makes the offset different for every listing.
function fuzz(id, lat, lng) {
  const b = crypto.createHash('sha256').update(hmac(`pin|${id}`)).digest();
  const angle = (b.readUInt32BE(0) / 0xffffffff) * 2 * Math.PI;
  const metres = 150 + (b.readUInt32BE(4) / 0xffffffff) * 300;
  const dLat = (metres * Math.cos(angle)) / 111_320;
  const dLng = (metres * Math.sin(angle)) / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [Math.round((lat + dLat) * 1e5) / 1e5, Math.round((lng + dLng) * 1e5) / 1e5];
}

// Gives every listing without a position one. Never overwrites a pin a host placed. Returns how many were placed.
function backfill(q) {
  let placed = 0;
  for (const l of q.all('SELECT id, suburb, state, postcode FROM listings WHERE lat IS NULL OR lng IS NULL')) {
    const g = locate(l); if (!g) continue;
    q.run('UPDATE listings SET lat = ?, lng = ? WHERE id = ? AND (lat IS NULL OR lng IS NULL)', g.lat, g.lng, l.id); placed++;
  }
  return placed;
}

module.exports = { locate, fuzz, backfill };
