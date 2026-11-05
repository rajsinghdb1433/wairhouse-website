'use strict';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { q, now } = require('./db');
const { randomToken, slugify } = require('./util');
const legal = require('./legal');

const FAQS = [
  ['customer', 'How does wAIRhouse work?', 'Search spaces near you, pick dates and how much you need, and send a booking request. The owner accepts, you pay securely through wAIRhouse, and you get access details. Some spaces are Instant Book, so you are confirmed straight away.'],
  ['customer', 'Do I have to sign a long contract?', 'No. Most spaces start from 7 days and you can extend whenever you like. You choose the length that suits you.'],
  ['customer', 'When am I charged?', 'Not until the owner accepts your request. If they decline, you pay nothing.'],
  ['customer', 'Is my stuff insured?', 'Goods are stored at your risk, so we recommend your own insurance. Some listings include insurance and say so clearly. Every owner must carry public liability cover for the site.'],
  ['customer', 'What can I not store?', 'Dangerous goods, flammables, weapons, living things and unrefrigerated perishables. The full list is in our Acceptable Use policy.'],
  ['customer', 'Can I cancel?', 'Yes. Cancel free before the owner accepts, and with a full refund up to 7 days before you start. See the Cancellation policy for the details.'],
  ['customer', 'How do I know a space is real?', 'Owners are verified by email and phone, listings are reviewed by our team before they go live, and only people with a real booking can leave reviews.'],
  ['customer', 'How do I get in touch with a person?', 'Call or email us any time from the Contact page. A real person answers.'],
  ['owner', 'How much does it cost to list?', 'Nothing to list. We take a commission only when you earn. Our first owners pay 0% commission for their first 6 months, and then a simple low rate.'],
  ['owner', 'How do I get paid?', 'Add your payout details in your profile. We pay you after the customer\'s booking starts, minus our commission. You can see everything in your earnings dashboard.'],
  ['owner', 'Who sets the price?', 'You do. Choose per pallet, per square metre or per unit, per day, week or month. Our price guide shows what similar spaces earn in your area.'],
  ['owner', 'Do I have to accept every booking?', 'No. You see who, what and when, and choose to accept or decline. Or turn on Instant Book if you prefer.'],
  ['owner', 'What about insurance and damage?', 'You need public liability insurance for your site. Customers store goods at their own risk, and our rental terms set clear rules for care and access.'],
  ['owner', 'What kinds of space can I list?', 'Warehouse bays, racked pallet positions, self-storage units, shipping containers, cold rooms, yards and garages. If it is dry, safe and secure, it can earn.'],
  ['owner', 'Can I rent out just part of my home, like a garage or spare room?', 'Yes. Garages, sheds, spare rooms, basements, attics, driveways and backyards are all welcome. Your exact address is hidden until you accept a booking, and customers cannot sleep or live in the space.'],
  ['owner', 'Do I need a business or an ABN?', 'No. Plenty of hosts are everyday households renting out one space. Income can be taxable, so keep records and check with the ATO or an accountant.'],
  ['owner', 'What if I rent my home?', 'Get your landlord\'s written permission first, and check any strata or council rules. You confirm this when you list.'],
  ['owner', 'Will my home insurance cover it?', 'Often not. Tell your insurer you are renting out space. Some of our listings include goods insurance, and customers store goods at their own risk under the rental terms.'],
  ['customer', 'Can I rent a garage, spare room or driveway?', 'Yes. Search by type and pick Garage, Spare room, Shed, Basement or Parking. Everyday hosts are reviewed by our team like everyone else.'],
  ['owner', 'How long does approval take?', 'Our team usually reviews new listings within one business day.'],
];

const OWNERS = [
  ['Harbour Logistics Group', 'Harbour', 'Logistics'], ['Southern Cross Storage', 'Southern', 'Storage'], ['Apex Industrial Parks', 'Apex', 'Industrial'], ['Outback Yard Co', 'Outback', 'Yard'], ['Coastal Cold Chain', 'Coastal', 'Cold'],
  ['Maya Chen', 'Maya', 'Chen'], ['Tom Becker', 'Tom', 'Becker'], ['Priya Nair', 'Priya', 'Nair'],
];
// type, title, summary, suburb, state, postcode, lat, lng, unit, price, period, capacity, sqm, height, min_days, owner idx, features, img, instant, insured
const L = [
  ['pallet', 'Eastern Creek Pallet Hub', 'Racked pallet positions with forklift handling, 15 minutes from the M7.', 'Eastern Creek', 'NSW', '2766', -33.8, 150.85, 'pallet', 5.2, 'week', 400, 1200, 9, 7, 0, ['Forklift on site', 'CCTV 24/7', 'Loading dock', 'WMS reporting', 'Insured goods'], 'racking', 1, 1],
  ['self-storage', 'Alexandria Urban Storage Units', 'Clean, climate-aware units a few minutes from the CBD. Roller doors, bright corridors.', 'Alexandria', 'NSW', '2015', -33.9, 151.19, 'unit', 180, 'month', 60, 600, 3, 7, 1, ['24/7 access', 'Alarmed units', 'Trolleys provided', 'Climate aware', 'CCTV 24/7'], 'selfstorage', 1, 0],
  ['warehouse', 'Moorebank Logistics Bay', 'High-clearance warehouse bays with dock-height doors. Great for ecommerce and distribution.', 'Moorebank', 'NSW', '2170', -33.94, 150.92, 'sqm', 19.5, 'month', 800, 2400, 10, 30, 2, ['Dock-height doors', 'Forklift access', 'Office space', 'Truck parking', 'Sprinklers'], 'dock', 0, 1],
  ['cold-storage', 'Tullamarine Cold Chain', 'Temperature-controlled pallet storage, 2 to 8 degrees, monitored around the clock.', 'Tullamarine', 'VIC', '3043', -37.7, 144.87, 'pallet', 9.8, 'week', 120, 500, 6, 7, 4, ['Temperature monitored', 'Food grade', 'Backup power', 'Loading dock', 'CCTV 24/7'], 'cold', 0, 1],
  ['warehouse', 'Dandenong Pack and Store', 'Flexible bays with packing benches and shared forklift. Ideal for growing online brands.', 'Dandenong South', 'VIC', '3175', -37.99, 145.21, 'sqm', 16.9, 'month', 500, 1500, 8, 14, 2, ['Packing benches', 'Shared forklift', 'Fast Wi-Fi', 'Parcel pickup', 'Alarmed'], 'racking', 1, 0],
  ['container', 'Laverton Container Yard', 'Secure 20ft containers on a fenced, floodlit gravel yard with sealed access road.', 'Laverton North', 'VIC', '3026', -37.86, 144.77, 'unit', 240, 'month', 40, 600, 2.6, 14, 3, ['Fenced yard', 'Floodlit', 'Truck access', 'Gate code', 'CCTV 24/7'], 'containers', 0, 0],
  ['warehouse', 'Acacia Ridge Distribution Centre', 'Modern tilt-up warehouse near the Logan Motorway. Racking available.', 'Acacia Ridge', 'QLD', '4110', -27.58, 153.02, 'sqm', 14.8, 'month', 1200, 3000, 10, 30, 2, ['Racking available', 'Dock levellers', 'Sprinklers', 'Truck parking', 'Alarmed'], 'dock', 0, 1],
  ['self-storage', 'Northgate Self Storage', 'Drive-up and indoor units in every size. Close to the airport and the Gateway.', 'Northgate', 'QLD', '4013', -27.39, 153.06, 'unit', 150, 'month', 90, 900, 3, 7, 1, ['Drive-up access', 'Indoor units', 'CCTV 24/7', 'Online gate code', 'Trolleys provided'], 'selfstorage', 1, 0],
  ['yard', 'Yatala Trade Yard', 'Open hardstand for machinery, trailers, materials and tradies. Fenced and lit.', 'Yatala', 'QLD', '4207', -27.73, 153.23, 'sqm', 9, 'month', 2000, 2000, 0, 14, 3, ['Hardstand', 'Fenced yard', 'Floodlit', 'Truck access', 'Weighbridge nearby'], 'containers', 0, 0],
  ['warehouse', 'Welshpool Industrial Bay', 'Clean, dry warehouse in Perth\'s industrial heart, with three-phase power and a roller door.', 'Welshpool', 'WA', '6106', -31.98, 115.95, 'sqm', 15, 'month', 350, 800, 7, 14, 2, ['Three-phase power', 'Roller door', 'Office space', 'Truck access', 'Alarmed'], 'racking', 0, 0],
  ['pallet', 'Canning Vale Pallet Store', 'Affordable pallet positions with weekly flexible terms and in/out handling.', 'Canning Vale', 'WA', '6155', -32.07, 115.91, 'pallet', 4.8, 'week', 300, 900, 8, 7, 0, ['Forklift on site', 'In and out handling', 'CCTV 24/7', 'WMS reporting', 'Alarmed'], 'racking', 1, 1],
  ['warehouse', 'Wingfield Warehouse Space', 'Large clear-span warehouse in Adelaide\'s north-west, easy truck access.', 'Wingfield', 'SA', '5013', -34.85, 138.57, 'sqm', 12.5, 'month', 1000, 2600, 9, 30, 2, ['Clear span', 'Dock-height doors', 'Truck parking', 'Sprinklers', 'Alarmed'], 'dock', 0, 0],
  ['self-storage', 'Derwent Park Storage Units', 'Secure, well-lit storage units 10 minutes from Hobart CBD.', 'Derwent Park', 'TAS', '7009', -42.83, 147.28, 'unit', 130, 'month', 35, 350, 3, 7, 1, ['24/7 access', 'CCTV 24/7', 'Alarmed units', 'Trolleys provided', 'Drive-up access'], 'selfstorage', 1, 0],
  ['warehouse', 'Hume Business Store', 'Tidy warehouse units in Canberra\'s Hume for small business and ecommerce stock.', 'Hume', 'ACT', '2620', -35.36, 149.17, 'sqm', 17, 'month', 300, 700, 6, 14, 2, ['Roller door', 'Office space', 'Fast Wi-Fi', 'Parcel pickup', 'Alarmed'], 'racking', 0, 0],
  ['pop-up', 'Hexham Pop-up Event Storage', 'Short-stay space for events, markets and seasonal stock. Book by the day.', 'Hexham', 'NSW', '2322', -32.83, 151.69, 'sqm', 45, 'day', 200, 400, 6, 1, 3, ['Daily booking', 'Loading dock', 'Forklift on site', 'Truck access', 'CCTV 24/7'], 'dock', 1, 0],
  ['garage', 'Parramatta Lock-up Garage', 'Dry, secure single garage with a roller door and a power point. Ideal for furniture, tools and boxes.', 'Parramatta', 'NSW', '2150', -33.815, 151.0, 'unit', 260, 'month', 1, 18, 2.4, 14, 5, ['Lockable roller door', 'Dry and clean', 'Drive-in access', 'Power point', 'CCTV 24/7'], 'garage', 0, 0],
  ['spare-room', 'Fitzroy Spare Room Storage', 'A spare room on the ground floor, kept dry and climate-stable. Great for boxes, bikes and seasonal gear.', 'Fitzroy', 'VIC', '3065', -37.8, 144.98, 'unit', 160, 'month', 1, 12, 2.6, 14, 5, ['Ground floor', 'Lockable door', 'Dry and clean', 'Climate-stable', 'Easy parking'], 'room', 0, 0],
  ['shed', 'Penrith Backyard Shed', 'A tidy timber shed in a fenced backyard. Easy side-gate access for tools, outdoor gear and stock.', 'Penrith', 'NSW', '2750', -33.75, 150.69, 'unit', 120, 'month', 1, 8, 2.2, 14, 6, ['Fenced yard', 'Side-gate access', 'Lockable door', 'Dry and clean'], 'shed', 0, 0],
  ['basement', 'Paddington Basement Cellar', 'Cool, dry basement storage with shelving. Perfect for wine, archives and household overflow.', 'Paddington', 'QLD', '4064', -27.46, 153.0, 'unit', 180, 'month', 1, 20, 2.3, 14, 7, ['Shelving provided', 'Cool and dry', 'Lockable door', 'Ground-level access'], 'basement', 0, 0],
  ['parking', 'Bondi Junction Covered Car Space', 'Secure undercover car space two minutes from the station. Remote gate and CCTV.', 'Bondi Junction', 'NSW', '2022', -33.89, 151.25, 'unit', 380, 'month', 1, 12, 0, 7, 7, ['Undercover', 'Remote gate', 'CCTV 24/7', '24/7 access'], 'parking', 1, 0],
  ['parking', 'Dandenong Driveway Car Space', 'Off-street driveway space in a quiet street, close to the train line. Fits a standard car or small van.', 'Dandenong', 'VIC', '3175', -37.99, 145.2, 'unit', 190, 'month', 1, 14, 0, 7, 6, ['Off-street', '24/7 access', 'Easy parking', 'Quiet street'], 'parking', 1, 0],
  ['garage', 'Glenelg Double Garage', 'Large double garage near the beach with a tilt door. Room for a car and boxes, or a big storage run.', 'Glenelg', 'SA', '5045', -34.98, 138.51, 'unit', 220, 'month', 1, 30, 2.5, 14, 5, ['Lockable roller door', 'Power point', 'Dry and clean', 'Drive-in access'], 'garage', 0, 0],
  ['spare-room', 'Fremantle Spare Bedroom', 'A bright spare bedroom for boxes and furniture. Ground floor, lockable, and walkable from the port.', 'Fremantle', 'WA', '6160', -32.05, 115.75, 'unit', 140, 'month', 1, 11, 2.5, 14, 7, ['Ground floor', 'Lockable door', 'Dry and clean', 'Easy parking'], 'room', 0, 0],
  ['yard', 'Ipswich Backyard Hardstand', 'Fenced, level hardstand behind a house. Good for trailers, boats, caravans and materials.', 'Ipswich', 'QLD', '4305', -27.61, 152.76, 'sqm', 8, 'month', 150, 150, 0, 14, 6, ['Fenced yard', 'Hardstand', 'Truck access', 'Floodlit'], 'shed', 0, 0],
  ['basement', 'Sandy Bay Attic Storage', 'A dry, floored attic with a pull-down ladder. Light items only: seasonal clothes, decorations and archives.', 'Sandy Bay', 'TAS', '7005', -42.9, 147.33, 'unit', 110, 'month', 1, 10, 1.8, 14, 7, ['Floored attic', 'Dry and clean', 'Light items only'], 'basement', 0, 0],
  ['cold-storage', 'Corio Wine and Cool Room', 'Cellar-grade cool room for wine, produce and boutique food brands.', 'Corio', 'VIC', '3214', -38.08, 144.37, 'pallet', 11.5, 'week', 60, 220, 4, 14, 4, ['Temperature monitored', 'Food grade', 'Backup power', 'Low vibration', 'Insured goods'], 'cold', 0, 1],
];
// Business listings use the supplied photos; household listings keep the 3D pictures (no home-storage photos supplied yet).
const PHOTO = { racking: '/img/photos/inventory.jpg', dock: '/img/photos/unloading.jpg', selfstorage: '/img/photos/storage-interior.jpg', containers: '/img/photos/facility-dusk.jpg' };
const img = (k) => [PHOTO[k] || `/img/spaces/${k}.jpg`];

function seed() {
  // 1. admin (never ships with a known password)
  if (!q.get("SELECT 1 FROM users WHERE role = 'admin'")) {
    const given = !!config.admin.password;
    const pw = config.admin.password || randomToken(9) + 'aA1';
    q.run("INSERT INTO users(email,name,password_hash,role,email_verified,must_change_password,created_at,phone) VALUES(?,?,?,?,1,?,?,?)",
      config.admin.email, config.admin.name, bcrypt.hashSync(pw, 12), 'admin', given ? 0 : 1, now(), '0470368696');
    if (!given) {
      const f = path.join(config.DATA_DIR, 'INITIAL_ADMIN_PASSWORD.txt');
      fs.writeFileSync(f, `Admin login: ${config.admin.email}\nTemporary password: ${pw}\nYou will be asked to change it at first sign-in. Delete this file afterwards.\n`, { mode: 0o600 });
      console.log(`\n  ┌─ FIRST RUN ─────────────────────────────────────────────\n  │ Admin account created: ${config.admin.email}\n  │ Temporary password:    ${pw}\n  │ (also saved to ${f})\n  └─ Change it at first login. Set ADMIN_PASSWORD to choose your own.\n`);
    }
  }
  // 2. legal + info pages (never overwrites edits)
  for (const p of legal) q.run('INSERT OR IGNORE INTO pages(slug,title,body,category,version,published,updated_at) VALUES(?,?,?,?,1,1,?)', p.slug, p.title, p.body.trim(), p.category, now());
  // 3. FAQs
  if (!q.get('SELECT 1 FROM faqs')) FAQS.forEach(([a, qq, ans], i) => q.run('INSERT INTO faqs(audience,question,answer,sort) VALUES(?,?,?,?)', a, qq, ans, i));
  // 4. sample marketplace so the site is full on day one (one click removes it in Admin > Dashboard)
  if (config.seedDemo && !q.get('SELECT 1 FROM listings')) {
    const ids = OWNERS.map(([company, first, last], i) => {
      const email = `${slugify(company)}@demo.wairhouse.example`;
      const info = q.run('INSERT INTO users(email,name,company,password_hash,role,email_verified,created_at,bio) VALUES(?,?,?,?,?,1,?,?)', email, `${first} ${last}`, i >= 5 ? '' : company, bcrypt.hashSync(randomToken(24), 4), 'owner', now() - (i + 2) * 86400_000 * 20, i >= 5 ? 'Local host sharing a little space.' : `${company} manages industrial space across Australia.`);
      return Number(info.lastInsertRowid);
    });
    for (const x of L) {
      const [type, title, summary, suburb, state, postcode, lat, lng, unit, price, period, capacity, sqm, height, minDays, oi, features, im, instant, insured] = x;
      const slug = slugify(`${title} ${suburb}`);
      q.run(`INSERT INTO listings(owner_id,slug,title,summary,description,type,address_line,suburb,state,postcode,lat,lng,unit,price_cents,period,capacity,total_sqm,height_m,min_days,features,images,access_hours,instant_book,insurance_included,status,featured,is_demo,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,1,?,?)`,
        ids[oi], slug, title, summary, `${summary}\n\nThis is a sample listing shown so you can explore how wAIRhouse works. ${title} offers ${unit === 'sqm' ? capacity + ' square metres' : unit === 'unit' ? (capacity === 1 ? 'a single space' : capacity + ' spaces') : capacity + ' pallets'} available, with a ${minDays}-day minimum booking. Access, handling and security are described in the feature list. Message the owner with any question before you book.`,
        type, '', suburb, state, postcode, lat, lng, unit, Math.round(price * 100), period, capacity, sqm, height, minDays, JSON.stringify(features), JSON.stringify(/Pallet/.test(title) && im === 'racking' ? ['/img/photos/pallet-boxes.jpg'] : img(im)),
        ['garage', 'spare-room', 'shed', 'basement'].includes(type) ? 'By arrangement with the host' : type === 'parking' ? '24/7' : type === 'self-storage' || type === 'pop-up' ? '24/7 with code' : 'Mon to Fri 7am to 5pm, Sat 8am to 12pm', instant, insured, x === L[0] || x === L[3] || x === L[7] || /Parramatta|Bondi|Fitzroy/.test(title) ? 1 : 0, now(), now());
    }
  }
}
module.exports = { seed };
