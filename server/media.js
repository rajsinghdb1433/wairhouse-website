'use strict';
// Media library + "slots". A slot is a named place on the public site (e.g. the home page hero photo).
// Admin uploads photos and videos to the library, then picks which one fills each slot. Slots without a pick use a built-in default.
const { q, now, getSetting, setSetting } = require('./db');

const P = (n) => `/img/photos/${n}.jpg`;
const V = (n) => `/video/${n}.mp4`;
const SLOTS = {
  home_hero_image: { label: 'Home: hero picture (phones, and when 3D is off)', kind: 'image', def: P('facility-dusk'), alt: 'A modern storage facility at dusk' },
  home_hero_video: { label: 'Home: hero video (phones and tablets, plays behind the headline)', kind: 'video', def: V('warehouse-transform'), alt: 'An empty warehouse filling with stock' },
  home_intro_image: { label: 'Home: "the idea" section (photo or video)', kind: 'any', def: V('family-garage'), alt: 'Children playing in a garden, and a tidy garage with bikes and storage' },
  home_how_media: { label: 'Home: "how it works" section (photo or video)', kind: 'any', def: V('warehouse-transform'), alt: 'An empty warehouse becoming a busy, income-earning space' },
  home_showcase_video: { label: 'Home: showcase video ("Walk the aisles")', kind: 'video', def: '/video/flythrough.mp4', poster: '/video/flythrough-poster.jpg', alt: 'A fly-through of a warehouse' },
  home_trust_image: { label: 'Home: "secure by design" picture', kind: 'image', def: P('keypad-door'), alt: 'A keypad-secured storage door' },
  home_host_image: { label: 'Home: "for hosts" block (photo or video)', kind: 'any', def: V('empty-room-income'), alt: 'An empty room filling with labelled boxes: turn empty space into income' },
  home_cta_image: { label: 'Home: closing banner background', kind: 'image', def: P('truck-apartment'), alt: 'A storage truck outside an apartment building' },
  host_hero_image: { label: 'Host page: top (photo or video)', kind: 'any', def: V('host-lists-space'), alt: 'A host confirms a booking on her phone in an empty room' },
  host_cta_image: { label: 'Host page: closing banner background', kind: 'image', def: P('balcony'), alt: 'A person on a balcony overlooking a street' },
  how_customer_image: { label: 'How it works: renters (photo or video)', kind: 'any', def: P('movers-box'), alt: 'Two movers carrying a box' },
  how_owner_image: { label: 'How it works: hosts (photo or video)', kind: 'any', def: V('host-lists-space'), alt: 'A host confirms a booking on her phone' },
  about_image: { label: 'About page: banner (photo or video)', kind: 'any', def: V('warehouse-transform'), alt: 'An empty warehouse filling with stock' },
  contact_image: { label: 'Contact page: picture', kind: 'image', def: P('inventory'), alt: 'A warehouse specialist checking inventory' },
  auth_image: { label: 'Sign in and sign up: side (photo or video)', kind: 'any', def: V('host-lists-space'), alt: 'A host confirms a booking on her phone' },
  menu_image: { label: 'Right-hand menu: picture', kind: 'image', def: P('storage-interior'), alt: 'A tidy storage unit' },
  og_image: { label: 'Link preview picture (social sharing)', kind: 'image', def: '/img/og-cover.jpg', alt: 'wAIRhouse' },
};

const BUILTIN = ['couple-sofa', 'family-moving', 'movers-box', 'storage-interior', 'balcony', 'keypad-door', 'inventory', 'unloading', 'pallet-boxes', 'truck-apartment', 'owner-staff', 'facility-dusk'];
const TITLES = { 'couple-sofa': 'Couple at home', 'family-moving': 'Family with moving boxes', 'movers-box': 'Movers carrying a box', 'storage-interior': 'Self-storage unit interior', balcony: 'Person on a balcony', 'keypad-door': 'Keypad storage door', inventory: 'Warehouse inventory check', unloading: 'Staff unloading a truck', 'pallet-boxes': 'Boxes on pallets', 'truck-apartment': 'Truck by apartments', 'owner-staff': 'Owner and staff', 'facility-dusk': 'Storage facility at dusk' };

// Register built-in photos and video in the library so they can be re-assigned from the admin.
function seedLibrary() {
  for (const n of BUILTIN) q.run('INSERT OR IGNORE INTO media(kind,path,title,alt,builtin,created_at) VALUES(?,?,?,?,1,?)', 'image', P(n), TITLES[n], TITLES[n], now());
  for (const [n, t] of [['flythrough', 'Warehouse fly-through (3D)'], ['host-lists-space', 'Host lists a space and gets a booking'], ['warehouse-transform', 'Empty warehouse becomes income'], ['empty-room-income', 'Empty room: turn empty space into income'], ['family-garage', 'Family and a tidy garage']]) q.run('INSERT OR IGNORE INTO media(kind,path,title,alt,builtin,created_at) VALUES(?,?,?,?,1,?)', 'video', V(n), t, t, now());
}

// slot -> {kind,url,alt,poster?, id|null}
function resolveAll() {
  const out = {};
  for (const [slot, d] of Object.entries(SLOTS)) {
    const id = Number(getSetting('media_slot_' + slot)) || 0;
    const m = id ? q.get('SELECT id,kind,path,alt,title FROM media WHERE id = ?', id) : null;
    if (m && (d.kind === 'any' || m.kind === d.kind)) out[slot] = { id: m.id, kind: m.kind, url: m.path, alt: m.alt || m.title || d.alt || '', poster: m.kind === 'video' && m.path.startsWith('/video/') ? m.path.replace(/\.mp4$/, '.jpg') : undefined };
    else out[slot] = d.def ? { id: null, kind: d.def.endsWith('.mp4') ? 'video' : 'image', url: d.def, alt: d.alt || '', poster: d.def.startsWith('/video/') ? d.def.replace(/\.mp4$/, '.jpg') : undefined } : null;
  }
  return out;
}
const assign = (slot, mediaId) => setSetting('media_slot_' + slot, mediaId ? String(mediaId) : '');
const unassignMedia = (mediaId) => { for (const slot of Object.keys(SLOTS)) if (Number(getSetting('media_slot_' + slot)) === Number(mediaId)) assign(slot, 0); };

module.exports = { SLOTS, seedLibrary, resolveAll, assign, unassignMedia };
