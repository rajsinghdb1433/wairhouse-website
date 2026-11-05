'use strict';
// Optimises the supplied photos into public/img/photos (full size + small). Usage: node scripts/prepare-photos.js <input-dir>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAP = {
  'Couple_relaxing_on_sofa': 'couple-sofa',
  'Family_standing_beside_packed_boxes': 'family-moving',
  'Movers_carrying_box_to_truck': 'movers-box',
  'Organized_self-storage_unit_inte': 'storage-interior',
  'Professional_standing_on_balcony': 'balcony',
  'Secure_storage_unit_door_keypad': 'keypad-door',
  'Specialist_managing_inventory_in': 'inventory',
  'Staff_unloading_boxes_from_truck': 'unloading',
  'Storage_boxes_arranged_on_pallets': 'pallet-boxes',
  'Storage_truck_near_apartment_bui': 'truck-apartment',
  'Store_owner_and_staff_organizing': 'owner-staff',
  'Truck_parked_at_storage_facility': 'facility-dusk',
};
const inDir = process.argv[2]; const out = path.join(__dirname, '..', 'public', 'img', 'photos');
if (!inDir) { console.error('usage: node scripts/prepare-photos.js <input-dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
(async () => {
  for (const f of fs.readdirSync(inDir)) {
    const key = Object.keys(MAP).find((k) => f.startsWith(k)); if (!key) { console.log('skip', f); continue; }
    const name = MAP[key]; const src = path.join(inDir, f);
    await sharp(src).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(out, name + '.jpg'));
    await sharp(src).rotate().resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toFile(path.join(out, name + '-sm.jpg'));
    console.log('ok', name);
  }
  // social share image from the facility photo
  await sharp(path.join(out, 'facility-dusk.jpg')).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(path.join(__dirname, '..', 'public', 'img', 'og-cover.jpg'));
})();
