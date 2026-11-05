// All 3D lives here. Procedural (no model downloads): a scroll-driven warehouse fly-through, a room "space planner",
// a floating-box backdrop, and still scenes used to render the site's photos and hero video.
import * as THREE from '/vendor/three/three.module.min.js';

export const lowPower = () => matchMedia('(pointer:coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const rng = (seed) => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function makeRenderer(canvas, { alpha = false, still = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: still || !lowPower(), alpha, powerPreference: 'high-performance', preserveDrawingBuffer: still });
  r.setPixelRatio(still ? 1 : Math.min(devicePixelRatio || 1, lowPower() ? 1.25 : 1.75));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
// Runs the render callback only while the canvas is on screen and the tab is visible.
function runLoop(canvas, frame) {
  let visible = true, raf = 0, alive = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { rootMargin: '100px' }); io.observe(canvas);
  const tick = (t) => { raf = 0; if (!alive || !visible || document.hidden) return; frame(t / 1000); raf = requestAnimationFrame(tick); };
  const kick = () => { if (!raf && alive && visible && !document.hidden) raf = requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange', kick); kick();
  return () => { alive = false; cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', kick); };
}
function fit(canvas, renderer, camera) {
  const apply = () => { const p = canvas.parentElement; const w = p.clientWidth || 1, h = p.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  apply(); const ro = new ResizeObserver(apply); ro.observe(canvas.parentElement); return () => ro.disconnect();
}

// ---------- textures ----------
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); } return t;
}
const floorTex = (tint = '#101a2e') => canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = tint; g.fillRect(0, 0, w, h); const r = rng(7);
  for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * w, r() * h, 2, 2); }
  if (tint.length > 0 && parseInt(tint.slice(1, 3), 16) < 90) for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 80, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
  g.globalAlpha = 0.85; g.fillStyle = '#ff6b2c'; // aisle safety lines (floor is 44 wide: aisle edges at +-3.2)
  const lx = (x) => (x + 22) / 44 * w; for (const x of [-3.15, 3.15, -9 - 3.15, -9 + 3.15, 9 - 3.15, 9 + 3.15]) g.fillRect(lx(x) - 3, 0, 6, h);
  g.fillStyle = '#9adbff'; g.globalAlpha = 0.35; for (const x of [0, -9, 9]) for (let y = 0; y < h; y += 96) g.fillRect(lx(x) - 2, y, 4, 48);
}, { repeat: [1, 7] });
const glowTex = () => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
const shaftTex = () => canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = sg; g.fillRect(0, 0, w, h); });

// ---------- warehouse hall ----------
const CARTON = ['#b88a5a', '#c9a173', '#a97c4e', '#e9e4d8', '#d8dde8', '#3e6fb0', '#8a6a45', '#c9a173'];
function buildHall(scene, { low = false, tint = 0, cold = false } = {}) {
  const R = rng(42); const g = new THREE.Group(); scene.add(g);
  const BAYS = low ? 22 : 38, LEVELS = 4, Z0 = 47, DZ = 2.9;
  const RACKX = low ? [-3.8, 3.8, -5.2, 5.2] : [-3.8, 3.8, -5.2, 5.2, -12.8, 12.8, -14.2, 14.2];
  // floor, ceiling, walls
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 150), new THREE.MeshStandardMaterial({ map: floorTex(cold ? '#16294a' : '#18253f'), roughness: 0.32, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -25; g.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: cold ? 0x25395f : 0x22304f, roughness: 0.85 });
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(150, 16), wallMat); w.rotation.y = -s * Math.PI / 2; w.position.set(s * 22, 8, -25); g.add(w); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(44, 150), new THREE.MeshStandardMaterial({ color: 0x1a2748, roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 15, -25); g.add(ceil);
  // trusses + skylights
  const truss = new THREE.InstancedMesh(new THREE.BoxGeometry(44, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x1b2742, roughness: 0.6, metalness: 0.5 }), 26); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) { m4.makeTranslation(0, 14.6, 48 - i * 6); truss.setMatrixAt(i, m4); } g.add(truss);
  const skyMat = new THREE.MeshBasicMaterial({ color: cold ? 0xa9d8ff : 0xdff3ff });
  for (const x of [-9, 0, 9]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 140), skyMat); s.rotation.x = Math.PI / 2; s.position.set(x, 14.9, -22); g.add(s); }
  // far wall with glowing dock doors (the light at the end of the aisle)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), wallMat); far.position.set(0, 8, -61); g.add(far);
  const doorMat = new THREE.MeshBasicMaterial({ color: cold ? 0xbfe4ff : 0xfff1dc });
  [-14, -7, 0, 7, 14].forEach((x, i) => { const d = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 5.4), i === 2 ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : doorMat); d.position.set(x, 2.7, -60.9); g.add(d); });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: cold ? 0x8fd0ff : 0xffd9a8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false })); glow.scale.set(40, 22, 1); glow.position.set(0, 3, -58); g.add(glow);
  // racks
  const upMat = new THREE.MeshStandardMaterial({ color: 0x1f56b8, roughness: 0.45, metalness: 0.5 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xff6b2c, roughness: 0.4, metalness: 0.4, emissive: 0xff3c00, emissiveIntensity: 0.12 });
  const nUp = RACKX.length * (BAYS + 1) * 2, nBeam = RACKX.length * BAYS * LEVELS * 2, nPal = RACKX.length * BAYS * LEVELS * 2;
  const ups = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 7.8, 0.12), upMat, nUp);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(DZ - 0.12, 0.16, 0.1), beamMat, nBeam);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.14, 1.1), new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.9 }), nPal);
  const loads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 }), nPal);
  let iu = 0, ib = 0, ip = 0; const col = new THREE.Color(); const tmp = new THREE.Object3D();
  const place = (mesh, i, x, y, z, sx = 1, sy = 1, sz = 1) => { tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix); };
  for (const rx of RACKX) {
    for (let b = 0; b <= BAYS; b++) for (const dx of [-0.6, 0.6]) place(ups, iu++, rx + dx, 3.9, Z0 - b * DZ + DZ / 2);
    for (let b = 0; b < BAYS; b++) for (let lv = 0; lv < LEVELS; lv++) {
      const y = 0.6 + lv * 1.85; const z = Z0 - b * DZ;
      for (const dx of [-0.6, 0.6]) place(beams, ib++, rx + dx, y, z);
      for (const dz of [-0.7, 0.7]) {
        const i = ip++; if (R() < 0.16) { place(bases, i, 0, -50, 0, 0, 0, 0); place(loads, i, 0, -50, 0, 0, 0, 0); loads.setColorAt(i, col.set('#000')); continue; }
        const h = 0.8 + R() * 0.65, w = 0.9 + R() * 0.15; place(bases, i, rx, y + 0.15, z + dz); place(loads, i, rx, y + 0.22 + h / 2, z + dz, w, h, w);
        loads.setColorAt(i, col.set(CARTON[Math.floor(R() * CARTON.length)]).multiplyScalar(0.8 + R() * 0.3));
      }
    }
  }
  [ups, beams, bases, loads].forEach((m) => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; g.add(m); }); loads.instanceColor.needsUpdate = true;
  // lights
  scene.add(new THREE.HemisphereLight(cold ? 0xa9d6ff : 0xbfe3ff, 0x1a2036, 1.9));
  const sun = new THREE.DirectionalLight(cold ? 0xcfe8ff : 0xfff0dd, 1.5); sun.position.set(6, 30, 12); scene.add(sun);
  const warm = new THREE.PointLight(cold ? 0x9ad0ff : 0xff8a4c, 70, 26, 1.6); scene.add(warm);
  const key = new THREE.PointLight(0xcfe9ff, 40, 40, 1.6); key.position.set(0, 11, -20); scene.add(key);
  // light shafts
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex(), color: cold ? 0x9ad0ff : 0xcfeaff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shafts = []; for (let i = 0; i < (low ? 8 : 16); i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 15), shaftMat); s.position.set([-9, 0, 9][i % 3] + (R() - 0.5), 7.4, 40 - i * 6); s.rotation.set(0, R() * 3, (R() - 0.5) * 0.4); g.add(s); shafts.push(s); }
  // dust
  const N = low ? 300 : 900, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 30; pos[i * 3 + 1] = R() * 13; pos[i * 3 + 2] = 50 - R() * 105; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.07, color: cold ? 0xdff0ff : 0xfff3e0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(dust);
  // "air" cartons that lift off at the end of the story
  const floaters = []; const fl = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissive: 0x331100, emissiveIntensity: 0.2 }), low ? 40 : 90); fl.frustumCulled = false;
  for (let i = 0; i < fl.count; i++) { const c = [0xff6b2c, 0x9adbff, 0xf2f5fb, 0xffb36b][i % 4]; fl.setColorAt(i, col.set(c)); floaters.push({ x: (R() - 0.5) * 26, y: 8.5 + R() * 2, z: 40 - R() * 100, s: 0.8 + R() * 1.3, v: 3 + R() * 9, r: R() * 6, sp: (R() - 0.5) * 2 }); }
  g.add(fl);
  const upd = (p, t) => {
    const lift = clamp((p - 0.8) / 0.2);
    floaters.forEach((f, i) => { const k = ease(lift); tmp.position.set(f.x + Math.sin(t * 0.4 + i) * 0.4 * k, f.y + k * f.v + Math.sin(t + i) * 0.1, f.z); tmp.rotation.set(f.r + k * f.sp * 3, f.r + t * 0.1 * f.sp, 0); tmp.scale.setScalar(f.s * (0.2 + 0.8 * clamp(k * 4))); tmp.updateMatrix(); fl.setMatrixAt(i, tmp.matrix); });
    fl.instanceMatrix.needsUpdate = true; fl.visible = lift > 0.001; dust.rotation.y = t * 0.01; dust.position.y = Math.sin(t * 0.2) * 0.2;
    shaftMat.opacity = 0.16 + Math.sin(t * 0.5) * 0.03;
  };
  return { group: g, update: upd, warm };
}

const CAM_POS = [[0, 22, 80], [0, 10, 54], [0, 2.4, 41], [0, 2.1, 6], [0, 2.1, -24], [3, 6.5, -36], [0, 15, -16], [0, 26, 36]];
const CAM_LOOK = [[0, 3, 20], [0, 3, 10], [0, 3.2, -10], [0, 3.2, -40], [0, 3, -62], [-1, 3, -52], [0, 4, -40], [0, 1, -20]];
const CAM_T = [0, 0.14, 0.3, 0.52, 0.68, 0.8, 0.9, 1];
const sampleKeys = (keys, p) => { let i = 0; while (i < CAM_T.length - 2 && p > CAM_T[i + 1]) i++; const t = clamp((p - CAM_T[i]) / (CAM_T[i + 1] - CAM_T[i])); const a = keys[Math.max(0, i - 1)], b = keys[i], c = keys[i + 1], d = keys[Math.min(keys.length - 1, i + 2)]; const e = ease(t); const cr = (k) => 0.5 * ((2 * b[k]) + (-a[k] + c[k]) * e + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * e * e + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * e * e * e); const lin = (k) => b[k] + (c[k] - b[k]) * t; return [0, 1, 2].map((k) => { const v = cr(k); return Number.isFinite(v) ? (v * 0.35 + lin(k) * 0.65) : lin(k); }); };

// The scroll-driven hero. Call setProgress(0..1) from a scroll handler.
export function heroScene(canvas) {
  const low = lowPower(); const renderer = makeRenderer(canvas); const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14); scene.fog = new THREE.Fog(0x070b14, 28, 120);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400); const hall = buildHall(scene, { low });
  const stop1 = fit(canvas, renderer, camera);
  let target = 0, shown = 0, mx = 0, my = 0, smx = 0, smy = 0, last = performance.now() / 1000;
  const pm = (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; }; addEventListener('pointermove', pm, { passive: true });
  const stop2 = runLoop(canvas, (t) => {
    const dt = Math.min(0.1, t - last); last = t; shown += (target - shown) * (1 - Math.pow(0.0009, dt)); smx += (mx - smx) * Math.min(1, dt * 3); smy += (my - smy) * Math.min(1, dt * 3);
    const pos = sampleKeys(CAM_POS, shown), look = sampleKeys(CAM_LOOK, shown);
    camera.position.set(pos[0] + smx * 0.7, pos[1] - smy * 0.35, pos[2]); camera.lookAt(look[0], look[1], look[2]); camera.fov = 55 - clamp(shown * 4, 0, 4) * 0 + (shown > 0.9 ? (shown - 0.9) * 120 : 0);
    camera.updateProjectionMatrix(); hall.warm.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, -3)); hall.update(shown, t); renderer.render(scene, camera);
  });
  return { setProgress: (p) => { target = clamp(p); }, get progress() { return shown; }, dispose: () => { stop1(); stop2(); removeEventListener('pointermove', pm); renderer.dispose(); } };
}

// ---------- space planner: a translucent room that fills with cartons ----------
export function spaceViz(canvas, { sqm = 200, height = 6, fill = 0.4, accent = 0xff6b2c } = {}) {
  const renderer = makeRenderer(canvas, { alpha: true }); const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  const room = new THREE.Group(); scene.add(room); const MAX = 520; let dims = { w: 10, l: 10, h: 4 }, cur = 0, goal = fill;
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x101830, 1.3)); const dl = new THREE.DirectionalLight(0xfff0dd, 2); dl.position.set(8, 14, 6); scene.add(dl);
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }), MAX); boxes.frustumCulled = false; room.add(boxes);
  const floorM = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.6, transparent: true, opacity: 0.95 })); floorM.rotation.x = -Math.PI / 2; room.add(floorM);
  const grid = new THREE.GridHelper(1, 10, 0x9adbff, 0x2a3c66); grid.material.transparent = true; grid.material.opacity = 0.35; room.add(grid);
  let edges = null; const slots = []; const R = rng(9); const col = new THREE.Color(); const tmp = new THREE.Object3D();
  function layout() {
    let { w, l, h } = dims; const s = 9 / Math.max(w, l); w *= s; l *= s; h = Math.min(h * s, 6.5);
    floorM.scale.set(w, l, 1); grid.scale.set(w, 1, l); if (edges) { room.remove(edges); edges.geometry.dispose(); }
    edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, l)), new THREE.LineBasicMaterial({ color: 0x9adbff, transparent: true, opacity: 0.8 })); edges.position.y = h / 2; room.add(edges);
    // cartons: fill floor grid first, then stack
    slots.length = 0; const cs = Math.max(0.55, Math.sqrt((w * l) / 110)); const nx = Math.max(1, Math.floor((w - 0.6) / (cs * 1.12))), nz = Math.max(1, Math.floor((l - 0.6) / (cs * 1.12))), ny = Math.max(1, Math.floor((h * 0.8) / (cs * 0.95)));
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) { if (slots.length >= MAX) break; slots.push({ x: -w / 2 + 0.3 + cs * 0.56 + x * cs * 1.12 + (R() - .5) * 0.03, y: cs * 0.48 + y * cs * 0.96, z: -l / 2 + 0.3 + cs * 0.56 + z * cs * 1.12, s: cs * (0.9 + R() * 0.05), c: [0xb88a5a, 0xc9a173, 0xe9e4d8, 0x3e6fb0, 0xff6b2c][Math.floor(R() * 5)] }); }
    slots.forEach((sl, i) => boxes.setColorAt(i, col.setHex(sl.c))); boxes.instanceColor.needsUpdate = true; boxes.count = slots.length; cur = 0; camR = Math.max(w, l) * 1.55 + 3;
  }
  let camR = 20, az = 0.7, drag = false, lastX = 0, lastT = 0;
  canvas.addEventListener('pointerdown', (e) => { drag = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointerup', () => { drag = false; canvas.style.cursor = 'grab'; }); canvas.addEventListener('pointermove', (e) => { if (drag) { az -= (e.clientX - lastX) * 0.008; lastX = e.clientX; } });
  const stop1 = fit(canvas, renderer, camera);
  function setDims(sq, height_) { const w = Math.sqrt(Math.max(4, sq) * 1.5), l = Math.max(4, sq) / w; dims = { w, l, h: Math.max(2.5, height_ || 4) }; layout(); }
  setDims(sqm, height);
  const stop2 = runLoop(canvas, (t) => {
    const dt = Math.min(0.05, t - lastT || 0.016); lastT = t; if (!drag) az += dt * 0.12;
    cur += (goal - cur) * Math.min(1, dt * 3.2); const n = slots.length, shownN = Math.round(cur * n);
    for (let i = 0; i < n; i++) { const sl = slots[i]; const k = clamp((cur * n - i) / 6); const sc = i < shownN ? ease(k) : 0; tmp.position.set(sl.x, sl.y, sl.z); tmp.scale.setScalar(Math.max(0.0001, sl.s * sc)); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); boxes.setMatrixAt(i, tmp.matrix); }
    boxes.instanceMatrix.needsUpdate = true;
    camera.position.set(Math.sin(az) * camR, camR * 0.62, Math.cos(az) * camR); camera.lookAt(0, dims.h * 0.15, 0); renderer.render(scene, camera);
  });
  return { setFill: (f) => { goal = clamp(f); }, setDims, dispose: () => { stop1(); stop2(); renderer.dispose(); } };
}

// ---------- floating boxes backdrop (CTA bands, auth art) ----------
export function boxesScene(canvas, { count = 70 } = {}) {
  const renderer = makeRenderer(canvas, { alpha: true }); const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.z = 22;
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x101830, 1.2)); const dl = new THREE.DirectionalLight(0xfff0dd, 2.2); dl.position.set(5, 8, 10); scene.add(dl);
  const n = lowPower() ? Math.floor(count / 2) : count; const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 }), n); const R = rng(3); const col = new THREE.Color();
  const items = Array.from({ length: n }, (_, i) => { m.setColorAt(i, col.setHex([0xff6b2c, 0x9adbff, 0xf2f5fb, 0x23395f][i % 4])); return { x: (R() - 0.5) * 34, y: (R() - 0.5) * 18, z: (R() - 0.5) * 14, s: 0.5 + R() * 1.4, r: R() * 6, v: 0.1 + R() * 0.3, f: R() * 6 }; }); scene.add(m);
  let mx = 0, my = 0; const pm = (e) => { mx = (e.clientX / innerWidth - 0.5); my = (e.clientY / innerHeight - 0.5); }; addEventListener('pointermove', pm, { passive: true });
  const stop1 = fit(canvas, renderer, camera); const tmp = new THREE.Object3D();
  const stop2 = runLoop(canvas, (t) => { items.forEach((it, i) => { tmp.position.set(it.x, it.y + Math.sin(t * 0.5 + it.f) * 0.8, it.z); tmp.rotation.set(it.r + t * it.v, it.r * 2 + t * it.v * 0.7, 0); tmp.scale.setScalar(it.s); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix); }); m.instanceMatrix.needsUpdate = true; camera.position.x += (mx * 3 - camera.position.x) * 0.04; camera.position.y += (-my * 2 - camera.position.y) * 0.04; camera.lookAt(0, 0, 0); renderer.render(scene, camera); });
  return { dispose: () => { stop1(); stop2(); removeEventListener('pointermove', pm); renderer.dispose(); } };
}

// ---------- stills (used by scripts/render-media.js to produce photos + hero video) ----------
function buildCorridor(scene) {
  scene.background = new THREE.Color(0xdfe7f3); scene.fog = new THREE.Fog(0xdfe7f3, 20, 70);
  const R = rng(5); const g = new THREE.Group(); scene.add(g);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 90), new THREE.MeshStandardMaterial({ map: floorTex('#aab4c6'), roughness: 0.3, metalness: 0.1 })); floor.rotation.x = -Math.PI / 2; floor.position.z = -30; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 90), new THREE.MeshStandardMaterial({ color: 0xf2f5fa })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.4, -30); g.add(ceil);
  const doorsA = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 2.8, 2.3), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05, emissive: 0x552200, emissiveIntensity: 0.35 }), 60); const col = new THREE.Color(); const tmp = new THREE.Object3D(); let k = 0;
  for (const s of [-1, 1]) for (let i = 0; i < 30; i++) { tmp.position.set(s * 2.6, 1.4, 12 - i * 2.45); tmp.updateMatrix(); doorsA.setMatrixAt(k, tmp.matrix); doorsA.setColorAt(k, col.set(i % 3 === 1 ? '#f4f6fa' : '#ff8a4c').multiplyScalar(0.96 + R() * 0.1)); k++; }
  g.add(doorsA);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 3.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x2b3550 }), 62); for (let i = 0, j = 0; i < 2; i++) for (let n = 0; n < 31; n++) { tmp.position.set((i ? 1 : -1) * 2.6, 1.6, 13.2 - n * 2.45); tmp.updateMatrix(); frames.setMatrixAt(j++, tmp.matrix); } g.add(frames);
  for (let i = 0; i < 14; i++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 2.6), new THREE.MeshBasicMaterial({ color: 0xffffff })); lamp.position.set(0, 3.36, 10 - i * 5); g.add(lamp); }
  const end = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); end.position.set(0, 2, -62); g.add(end);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4c8, 2.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(0, 3, 5); scene.add(dl);
  const open = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.8, 2.3), new THREE.MeshStandardMaterial({ color: 0x1a2236 })); open.position.set(-2.6, 1.4, 5.3); g.add(open);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: CARTON[i % 6] })); b.position.set(-3.5 + (i % 3) * 0.3, 0.25 + Math.floor(i / 3) * 0.5, 4.2 + (i % 2) * 0.4); g.add(b); }
}
function buildYard(scene) {
  const sky = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d6fb6'); gr.addColorStop(0.55, '#f2b88a'); gr.addColorStop(1, '#ffd7a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); scene.background = sky; scene.fog = new THREE.Fog(0xf2c9a0, 60, 220);
  const R = rng(11); const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#7a6f60'; g.fillRect(0, 0, w, h); const r = rng(2); for (let i = 0; i < 30000; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .18})`; g.fillRect(r() * w, r() * h, 2, 2); } }, { repeat: [24, 24] }), roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const ribs = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 4, 0, 2, h); } });
  const colors = ['#c8452d', '#2f5fa0', '#d9d4c7', '#3d7a5e', '#e0902c', '#6b7683', '#a8362a'];
  for (let row = 0; row < 7; row++) for (let i = 0; i < 9; i++) { if (R() < 0.12) continue; const stack = 1 + Math.floor(R() * 3); for (let s = 0; s < stack; s++) { const m = new THREE.Mesh(new THREE.BoxGeometry(6.06, 2.59, 2.44), new THREE.MeshStandardMaterial({ color: colors[Math.floor(R() * colors.length)], map: ribs, roughness: 0.55, metalness: 0.45 })); m.position.set(-28 + i * 6.5, 1.3 + s * 2.6, -26 + row * 5.6 + (row > 3 ? 4 : 0)); scene.add(m); } }
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7560, 1.2)); const sun = new THREE.DirectionalLight(0xffc891, 3); sun.position.set(-40, 22, 30); scene.add(sun);
}
export function stillScene(canvas, kind, w, h) {
  const renderer = makeRenderer(canvas, { still: true }); renderer.setSize(w, h, false); const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(kind === 'selfstorage' ? 62 : 56, w / h, 0.1, 500); let hall = null;
  if (kind === 'selfstorage') { buildCorridor(scene); camera.position.set(0.4, 1.55, 16); camera.lookAt(0, 1.3, -30); renderer.toneMappingExposure = 0.95; }
  else if (kind === 'containers') { buildYard(scene); camera.position.set(34, 16, 38); camera.lookAt(-4, 1.5, -6); camera.fov = 48; renderer.toneMappingExposure = 1.0; }
  else {
    const cold = kind === 'cold'; scene.background = new THREE.Color(cold ? 0x0b1830 : 0x070b14); scene.fog = new THREE.Fog(cold ? 0x0b1830 : 0x070b14, 26, 130); hall = buildHall(scene, { cold });
    if (kind === 'racking') { camera.position.set(0.6, 1.9, 40); camera.lookAt(0, 3.0, -40); }
    if (kind === 'dock') { camera.position.set(3.2, 1.55, -22); camera.lookAt(-1, 2.5, -62); camera.fov = 62; }
    if (kind === 'cold') { camera.position.set(8.6, 1.7, 30); camera.lookAt(9, 3, -40); camera.fov = 60; }
    if (kind === 'hero') { camera.position.set(0, 9, 62); camera.lookAt(0, 3, 0); }
    hall.warm.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, -3));
  }
  camera.updateProjectionMatrix();
  return { render: (t = 0) => { hall?.update(0, t); renderer.render(scene, camera); }, canvas };
}
// Frame-accurate hero fly-through for video rendering
export function heroFrames(canvas, w, h) {
  const renderer = makeRenderer(canvas, { still: true }); renderer.setSize(w, h, false); const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b14); scene.fog = new THREE.Fog(0x070b14, 28, 120);
  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 400); const hall = buildHall(scene, {});
  return { render: (p, t) => { const pos = sampleKeys(CAM_POS, p), look = sampleKeys(CAM_LOOK, p); camera.position.set(...pos); camera.lookAt(...look); camera.fov = 55 + (p > 0.9 ? (p - 0.9) * 120 : 0); camera.updateProjectionMatrix(); hall.warm.position.copy(camera.position).add(new THREE.Vector3(0, 1.2, -3)); hall.update(p, t); renderer.render(scene, camera); } };
}
