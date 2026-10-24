// ThermalLoop AI Center: Audience Mode (simple, guided) + Expert Mode (engineering view).
// Both modes drive the same simulate() model and the same 3D facility.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DEFAULTS, SEASONS, ZONES, TAPS, LIMITS, CHALLENGES, SCENARIOS, VAULT_FRIDGE_KW, simulate, evaluateTriggers, ambient, clamp } from './sim.js';
window.__READY = true;

/* ═════════════════════════ state ═════════════════════════ */
const state = {
  mode: 'audience', step: 0, maxStep: 0, stop: 0, fac: 'zone_robot_lab',
  inp: { ...DEFAULTS }, expertDraft: null,
  look: 'auto', cutaway: true, hydro: 'temperature', hidden: new Set(), focusFloor: null,
  lastWhy: [], whySev: '', done: new Set(), playing: false,
};
let R = simulate(state.inp);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (n, d = 0) => (isFinite(n) ? Number(n) : 0).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
const hhmm = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');

/* ═════════════════════════ three.js setup ═════════════════════════ */
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);
const labelDiv = document.createElement('div'); labelDiv.className = 'labels'; stage.appendChild(labelDiv);
const labelRenderer = new CSS2DRenderer({ element: labelDiv });

const scene = new THREE.Scene();
const SKY_NIGHT = new THREE.Color('#1a2638');
scene.background = new THREE.Color('#c7d6e4');
scene.fog = new THREE.Fog(scene.background.clone(), 120, 260);
const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 600);
camera.position.set(62, 40, 74);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(14, 2, 0);
controls.maxDistance = 220; controls.minDistance = 3;

const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x3a4030, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(-40, 70, 45); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -40, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004; scene.add(sun);
const plantLamp = new THREE.PointLight(0xfff0d8, 60, 40, 1.6); plantLamp.position.set(2, -4.8, 3); scene.add(plantLamp);
const labLamp = new THREE.PointLight(0xffffff, 30, 30, 1.6); labLamp.position.set(-4, 3.8, 0); scene.add(labLamp);
const seedLamp = new THREE.PointLight(0xffe9c8, 24, 24, 1.6); seedLamp.position.set(0, -1.2, -2); scene.add(seedLamp);

/* temperature ramp 15°C → 65°C */
const RAMP = [[15, '#2f7bff'], [28, '#22c3d6'], [40, '#f2c14e'], [52, '#ff8a3d'], [65, '#ff3b3b']].map(([t, c]) => [t, new THREE.Color(c)]);
function tcol(t) {
  if (t <= RAMP[0][0]) return RAMP[0][1].clone();
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i]; return ca.clone().lerp(cb, (t - a) / (b - a)); }
  return RAMP[RAMP.length - 1][1].clone();
}
const tcss = t => '#' + tcol(t).getHexString();

/* registry: group key → meshes (for focus/dim and visibility) */
const groups = {};
function grp(key) { if (!groups[key]) { const g = new THREE.Group(); g.name = key; scene.add(g); groups[key] = { g, mats: [], dim: 1 }; } return groups[key]; }
function mat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.05, transparent: true, opacity: o.opacity ?? 1,
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 1, depthWrite: o.depthWrite ?? true, side: o.side ?? THREE.FrontSide });
  m.userData.base = m.opacity; return m;
}
const clickables = [];
function add(key, geo, m, pos, o = {}) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); if (o.rot) mesh.rotation.set(...o.rot); if (o.scale) mesh.scale.set(...o.scale);
  mesh.castShadow = o.shadow ?? true; mesh.receiveShadow = true;
  if (o.look) { mesh.userData.look = o.look; clickables.push(mesh); }
  const G = grp(key); G.g.add(mesh); G.mats.push(m); return mesh;
}
const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/* ═════════════════════════ facility geometry (ThermalLoop dimensions, metres) ═════════════════════════ */
const FLOORS = [
  { key: 'b2', name: 'B2 · Plant room', y: -8.5, h: 4.5 },
  { key: 'b1', name: 'B1 · Seed center', y: -4, h: 4 },
  { key: 'gf', name: 'GF · Robot lab', y: 0, h: 4.5 },
  { key: 'f1', name: '1F · GPU hall', y: 4.5, h: 4.5 },
  { key: 'f2', name: '2F · GPU hall', y: 9, h: 4.5 },
  { key: 'f3', name: '3F · GPU hall', y: 13.5, h: 4.5 },
];
const FY = Object.fromEntries(FLOORS.map(f => [f.key, f.y]));

const grass = mat('#5f6b45', { rough: 1 }), soil = mat('#4a3c2c', { rough: 1 }), soilDeep = mat('#3a2f23', { rough: 1 });
add('ground', BX(160, 0.6, 50), grass, [5, -0.3, -36]);
add('ground', BX(62, 0.6, 22), grass, [-49, -0.3, 0]);
add('ground', BX(80, 0.6, 22), grass, [58, -0.3, 0]);
add('cutfront', BX(160, 0.6, 50), grass, [5, -0.3, 36]);
add('ground', BX(62, 9.4, 0.4), soil, [-49, -5.3, 10.8], { shadow: false });
add('ground', BX(80, 9.4, 0.4), soil, [58, -5.3, 10.8], { shadow: false });
add('ground', BX(36, 1.2, 22), soilDeep, [0, -9.1, 0]);
add('ground', BX(160, 9.4, 0.4), soil, [5, -5.3, -11.2], { shadow: false });
add('ground', BX(8, 0.62, 30), mat('#7d7a6f', { rough: 1 }), [22, -0.29, 26], { shadow: false });
add('ground', BX(40, 0.62, 3), mat('#7d7a6f', { rough: 1 }), [10, -0.29, 13], { shadow: false });

const slabM = () => mat('#8c96a1', { rough: 0.8 });
for (const f of FLOORS) add(f.key, BX(36, 0.3, 22), slabM(), [0, f.y + 0.15, 0], { look: f.key });
add('roof', BX(36, 0.35, 22), mat('#7e8892'), [0, 18.15, 0], { look: 'roof' });
const steel = mat('#2c3540', { metal: 0.6, rough: 0.4 });
for (const x of [-18, -6, 6, 18]) for (const z of [-11, 11]) add('shell', BX(0.4, 26.5, 0.4), steel, [x, 4.75, z]);
const glassM = mat('#9fc3d8', { opacity: 0.16, rough: 0.05, metal: 0.2, depthWrite: false, side: THREE.DoubleSide });
add('shell', BX(36, 18, 0.06), glassM, [0, 9, -11], { shadow: false });
add('shell', BX(0.06, 18, 22), glassM, [-18, 9, 0], { shadow: false });
add('shell', BX(0.06, 18, 22), glassM, [18, 9, 0], { shadow: false });
add('cutfront', BX(36, 18, 0.06), mat('#9fc3d8', { opacity: 0.22, rough: 0.05, metal: 0.2, depthWrite: false, side: THREE.DoubleSide }), [0, 9, 11], { shadow: false });
const concrete = mat('#6f747a', { rough: 0.95 });
add('shell', BX(36, 8.5, 0.3), concrete, [0, -4.25, -11]);
add('shell', BX(0.3, 8.5, 22), concrete, [-18, -4.25, 0]);
add('shell', BX(0.3, 8.5, 22), concrete, [18, -4.25, 0]);
add('cutfront', BX(36, 8.5, 0.3), concrete, [0, -4.25, 11]);

// GPU halls: 12 racks per floor
const racks = [];
['f1', 'f2', 'f3'].forEach((k, fi) => {
  const y = FY[k];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const x = -10 + i * 3.6, z = row ? 2.6 : -2.6;
    add(k, BX(1.3, 2.5, 1.5), mat('#1b2129', { metal: 0.5, rough: 0.35 }), [x, y + 1.55, z], { look: k });
    const leds = [];
    for (let s = 0; s < 5; s++) { const lm = mat('#333', { emissive: '#000', rough: 0.3 }); add(k, BX(1.0, 0.12, 0.04), lm, [x, y + 0.75 + s * 0.42, z + (row ? 0.77 : -0.77)], { shadow: false }); leds.push(lm); }
    racks.push({ fi, leds });
  }
  add(k, BX(1.6, 2.4, 1.2), mat('#cfd6dd', { metal: 0.3 }), [13.5, y + 1.5, -2.6]);
  add(k, BX(1.6, 2.4, 1.2), mat('#cfd6dd', { metal: 0.3 }), [13.5, y + 1.5, 2.6]);
});

// GF · Robotics & Materials Lab
const robots = [];
for (const x of [-2, 6]) {
  add('gf', new THREE.CylinderGeometry(0.9, 1.1, 0.5, 24), mat('#20262c'), [x, 0.55, 3], { look: 'gf' });
  const pivot = new THREE.Group(); pivot.position.set(x, 0.8, 3); grp('gf').g.add(pivot);
  const lowerM = mat('#e89b22', { metal: 0.3, rough: 0.4 }), jointM = mat('#15191d'), upperM = mat('#e89b22', { metal: 0.3, rough: 0.4 });
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.2, 16), lowerM); lower.position.y = 1.1; lower.castShadow = true;
  const elbow = new THREE.Group(); elbow.position.y = 2.2;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.7, 16), upperM); upper.position.y = 0.85;
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), jointM), upper); pivot.add(lower, elbow); grp('gf').mats.push(lowerM, jointM, upperM);
  robots.push({ pivot, elbow, phase: x });
}
const rigJacketMat = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.2, metal: 0.3 });
add('gf', BX(2.6, 1.0, 1.8), mat('#5b6670', { metal: 0.4 }), [-12, 0.8, -6], { look: 'rig' });
add('gf', BX(2.2, 0.35, 1.5), rigJacketMat, [-12, 1.48, -6], { look: 'rig' });            // water jacket
const sampleMat = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.4 });
add('gf', BX(0.9, 0.18, 0.6), sampleMat, [-12, 1.75, -6], { look: 'rig' });                // specimen
add('gf', BX(1.4, 1.6, 0.8), mat('#c9d1d8', { metal: 0.3 }), [-8.5, 1.1, -9.8], { look: 'rig' });   // room heating coil unit
add('gf', BX(3.2, 0.9, 1.4), mat('#3d5f8a'), [4, 0.75, 7]);

// B1 · Seed center: warm germination chambers + separate cold vault (own fridge)
const germMats = [];
for (let i = 0; i < 4; i++) { const m = mat('#f4e2c0', { emissive: '#ffb347', ei: 0.15, metal: 0.2 }); add('b1', BX(2.2, 2.6, 2), m, [-2 + i * 3, -2.6, -6.5], { look: 'b1' }); germMats.push(m); }
for (let i = 0; i < 4; i++) add('b1', BX(2.0, 0.08, 1.6), mat('#7ec26b', { emissive: '#3e7f2d', ei: 0.25 }), [-2 + i * 3, -1.6, 4]);
for (let i = 0; i < 4; i++) add('b1', BX(2.2, 1.2, 1.8), mat('#5b6670'), [-2 + i * 3, -3.4, 4]);
add('b1', BX(5.5, 3, 4), mat('#a8d4f5', { emissive: '#4fa3e0', ei: 0.18, metal: 0.2 }), [-12.5, -2.4, -6], { look: 'b1' });   // seed vault
add('b1', BX(1.6, 1.2, 1.2), mat('#e8eef2', { metal: 0.3 }), [-16.2, -3.3, -2.6]);     // vault fridge unit

// B2 · plant room
const hxPlates = [];
add('b2', BX(2, 2.2, 1.6), mat('#9aa6b2', { metal: 0.6, rough: 0.3 }), [-4, -7.2, -6.4], { look: 'b2' });
for (let i = 0; i < 6; i++) { const m = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.25 }); add('b2', BX(0.12, 1.8, 1.65), m, [-4.75 + i * 0.3, -7.2, -6.4], { shadow: false }); hxPlates.push(m); }
const pumps = [];
for (const z of [-6.8, -3.6]) {
  add('b2', new THREE.CylinderGeometry(0.55, 0.55, 1.0, 20), mat('#3e7cc4', { metal: 0.4 }), [-10, -7.7, z], { rot: [0, 0, Math.PI / 2], look: 'b2' });
  pumps.push(add('b2', BX(0.1, 0.9, 0.18), mat('#0e2c52'), [-9.45, -7.7, z], { shadow: false }));
}
add('b2', BX(2.8, 2.3, 1.9), mat('#6b7580', { metal: 0.4 }), [2, -7.3, -2.2], { look: 'b2' });
const hpCompMat = mat('#555', { emissive: '#000' });
const hpComp = add('b2', new THREE.SphereGeometry(0.55, 20, 14), hpCompMat, [1.4, -7.3, -1.15]);
add('b2', new THREE.CylinderGeometry(1.35, 1.35, 4.3, 28), mat('#c2c9cf', { opacity: 0.38, metal: 0.4, depthWrite: false }), [8, -6.3, -6], { look: 'b2', shadow: false });
const tankLevelMat = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.3 });
const tankLevel = add('b2', new THREE.CylinderGeometry(1.25, 1.25, 1, 28), tankLevelMat, [8, -7.6, -6], { shadow: false });
const tapTankMat = mat('#ff6a3d', { emissive: '#ff3b1f', ei: 0.15, metal: 0.3 });
add('b2', new THREE.CylinderGeometry(0.8, 0.8, 2.6, 22), tapTankMat, [4.5, -7.2, 4], { look: 'b2' });        // hot-tap cylinder
const backupMat = mat('#8a6a50', { emissive: '#000', metal: 0.3 });
add('b2', BX(1.8, 1.8, 1.4), backupMat, [-13, -7.5, 4], { look: 'b2' });                                 // backup heater
// header + four valves (one per facility)
const VALVE_Z = [-5.5, -3, -0.5, 2];
const valves = VALVE_Z.map(z => {
  const m = mat('#9aa6b2', { metal: 0.5, emissive: '#000' });
  add('b2', new THREE.CylinderGeometry(0.32, 0.32, 0.25, 18), m, [13.6, -4.7, z], { rot: [0, 0, Math.PI / 2], shadow: false });
  const handle = add('b2', BX(0.08, 0.7, 0.12), mat('#d2453a'), [13.95, -4.7, z], { shadow: false });
  return { m, handle };
});

// roof: dry cooler, chiller, air-handling unit (building heating)
add('roof', BX(6, 1.2, 3), mat('#aeb6be', { metal: 0.4 }), [8, 18.95, -6], { look: 'roof' });
const fans = [];
for (let i = 0; i < 3; i++) fans.push(add('roof', BX(1.5, 0.08, 0.22), mat('#2a3038'), [6 + i * 2, 19.6, -6], { shadow: false }));
add('roof', BX(3.2, 1.5, 2.2), mat('#c8ced4', { metal: 0.3 }), [-7, 19.1, -6], { look: 'roof' });
const chillerLampMat = mat('#2a2', { emissive: '#1f9d63', ei: 0.6 });
add('roof', new THREE.SphereGeometry(0.22, 12, 10), chillerLampMat, [-7, 20.05, -4.85], { shadow: false });
const ahuCoilMat = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.2 });
add('ahu', BX(5, 1.8, 2.6), mat('#dfe5ea', { metal: 0.3 }), [-1, 19.25, 4.6], { look: 'ahu' });
add('ahu', BX(0.15, 1.4, 2.2), ahuCoilMat, [1.6, 19.25, 4.6], { shadow: false });
add('ahu', BX(1.2, 18, 1.2), mat('#b8c0c8', { opacity: 0.5, depthWrite: false }), [-3, 9.2, 9.6], { shadow: false });   // supply-air duct
const plume = [];
const plumeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
for (let i = 0; i < 26; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), plumeMat.clone()); p.userData.seed = (i * 0.137) % 1; scene.add(p); plume.push(p); }

// greenhouse 30 × 18 × 5 m
const GHX = 41;
const hoopM = mat('#e7edf2', { metal: 0.5, rough: 0.3 });
for (let i = 0; i <= 10; i++) add('gh', new THREE.TorusGeometry(9, 0.09, 6, 36, Math.PI), hoopM, [26 + i * 3, 0, 0], { rot: [0, Math.PI / 2, 0], scale: [1, 5 / 9, 1], shadow: false });
const ghGlassMat = mat('#d6ecf2', { opacity: 0.16, rough: 0.05, depthWrite: false, side: THREE.DoubleSide });
add('gh', new THREE.CylinderGeometry(9, 9, 30, 36, 1, true, 0, Math.PI), ghGlassMat, [GHX, 0, 0], { rot: [0, 0, Math.PI / 2], scale: [5 / 9, 1, 1], shadow: false, look: 'gh' });
const bedMats = [];
for (const z of [-6, -2, 2, 6]) { const m = mat('#5a3d27', { rough: 1 }); add('gh', BX(27, 0.4, 2.4), m, [GHX, 0.2, z], { look: 'gh' }); bedMats.push(m); }
for (const x of [27, 55]) add('gh', BX(0.8, 1.6, 3), mat('#c9d1d8', { metal: 0.3 }), [x, 0.8, -8]);   // air-heating coils
const plantMat = new THREE.MeshStandardMaterial({ color: '#5fbf4a', roughness: 0.8, transparent: true }); plantMat.userData.base = 1;
const plants = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), plantMat, 104);
{ const m = new THREE.Matrix4(); let k = 0;
  for (const z of [-6, -2, 2, 6]) for (let i = 0; i < 26; i++) { const s = 0.8 + ((i * 7 + z * 3) % 5) * 0.1; m.compose(new THREE.Vector3(28 + i * 1.05, 0.7, z + (i % 2 ? 0.45 : -0.45)), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.3, s)); plants.setMatrixAt(k++, m); } }
plants.castShadow = true; grp('gh').g.add(plants); grp('gh').mats.push(plantMat);
add('corridor', BX(10, 2.4, 2.6), mat('#6f747a', { opacity: 0.5, depthWrite: false }), [22, -1.9, 2], { shadow: false });

/* ═════════════════════════ pipes + flow particles ═════════════════════════ */
const PIPE_DEFS = [
  { id: 'pri_supply_main', circuit: 'primary', kind: 'supply', key: 'pri_supply', r: 0.17, pts: [[-5, -7.2, -6.8], [-16.6, -7.2, -6.8], [-16.6, -7.2, -9.6], [-16.6, 17.1, -9.6]] },
  ...['f1', 'f2', 'f3'].map(k => ({ id: `pri_supply_${k}`, circuit: 'primary', kind: 'supply', key: 'pri_supply', r: 0.12, pts: [[-16.6, FY[k] + 3.6, -9.6], [-16.6, FY[k] + 3.6, 0], [12, FY[k] + 3.6, 0]] })),
  ...['f1', 'f2', 'f3'].map(k => ({ id: `pri_return_${k}`, circuit: 'primary', kind: 'return', key: 'pri_return', r: 0.12, pts: [[-12, FY[k] + 4.0, 0.8], [16.6, FY[k] + 4.0, 0.8], [16.6, FY[k] + 4.0, -9.6]] })),
  { id: 'pri_return_main', circuit: 'primary', kind: 'return', key: 'pri_return', r: 0.17, pts: [[16.6, 17.5, -9.6], [16.6, -7.6, -9.6], [16.6, -7.6, -6.2], [-3, -7.6, -6.2]] },
  { id: 'reject_riser', circuit: 'reject', kind: 'return', key: 'reject', r: 0.14, pts: [[16.6, 17.5, -9.6], [16.6, 19.4, -9.6], [11, 19.4, -9.6], [11, 19.4, -6]] },
  { id: 'hp_source', circuit: 'hp', kind: 'return', key: 'pri_return', r: 0.1, pts: [[0, -7.6, -6.2], [0.4, -7.6, -6.2], [0.4, -7.6, -3.2]] },
  { id: 'hp_taps', circuit: 'hp', kind: 'supply', key: 'hp_taps', r: 0.1, pts: [[3.4, -6.4, -1.6], [4.5, -6.4, -1.6], [4.5, -6.4, 2.8]] },
  { id: 'sec_hx', circuit: 'secondary', kind: 'supply', key: 'sec_hx', r: 0.14, pts: [[-4, -6.1, -6.8], [-4, -5.1, -6.8], [6.8, -5.1, -6.8]] },
  { id: 'sec_header', circuit: 'secondary', kind: 'supply', key: 'sec_hx', r: 0.16, pts: [[9.3, -5.1, -6], [13, -5.1, -6], [13, -4.7, -6], [13, -4.7, 2.4]] },
  { id: 'br_building', circuit: 'secondary', kind: 'supply', key: 'br_building', r: 0.11, pts: [[13, -4.7, -5.5], [15.6, -4.7, -5.5], [15.6, 19.3, -5.5], [1.6, 19.3, -5.5], [1.6, 19.3, 3.3]] },
  { id: 'br_lab', circuit: 'secondary', kind: 'supply', key: 'br_lab', r: 0.11, pts: [[13, -4.7, -3], [15, -4.7, -3], [15, 0.4, -3], [15, 0.4, -9.9], [-12, 0.4, -9.9], [-12, 0.4, -7]] },
  { id: 'br_seed', circuit: 'secondary', kind: 'supply', key: 'br_seed', r: 0.1, pts: [[13, -4.7, -0.5], [14.4, -4.7, -0.5], [14.4, -3.6, -0.5], [14.4, -3.6, -9.6], [-3, -3.6, -9.6], [-3, -3.6, -7.6]] },
  { id: 'br_greenhouse', circuit: 'secondary', kind: 'supply', key: 'br_greenhouse', r: 0.12, pts: [[13, -4.7, 2], [17.5, -4.7, 2], [17.5, -1.6, 2], [26.5, -1.6, 2], [26.5, 0.5, -6], [55, 0.5, -6], [55, 0.5, -2], [27, 0.5, -2], [27, 0.5, 2], [55, 0.5, 2], [55, 0.5, 6], [27, 0.5, 6]] },
  { id: 'sec_return', circuit: 'secondary', kind: 'return', key: 'sec_return', r: 0.12, pts: [[26.4, 0.3, 7.8], [19, 0.3, 7.8], [19, -7.9, 7.8], [-4, -7.9, 7.8], [-4, -7.9, -5.6]] },
];
const PHYS = { primary: { supply: '#2f7bff', return: '#ff3b3b' }, secondary: { supply: '#ff8a3d', return: '#22c3d6' }, reject: { return: '#ff3b3b' }, hp: { supply: '#ff3b3b', return: '#ff3b3b' } };
const pipes = [];
const partGeo = new THREE.SphereGeometry(0.11, 8, 6);
for (const d of PIPE_DEFS) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < d.pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...d.pts[i - 1]), new THREE.Vector3(...d.pts[i])));
  const gkey = 'pipe:' + d.id;
  const tube = add(gkey, new THREE.TubeGeometry(path, Math.max(24, d.pts.length * 40), d.r, 10, false), mat('#888', { metal: 0.5, rough: 0.35, emissive: '#000' }), [0, 0, 0], { shadow: false });
  const len = path.getLength(), count = Math.min(110, Math.max(6, Math.round(len * 0.75)));
  const pm = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.95 }); pm.userData.base = 0.95;
  const inst = new THREE.InstancedMesh(partGeo, pm, count); inst.frustumCulled = false;
  grp(gkey).g.add(inst); grp(gkey).mats.push(pm);
  pipes.push({ d, path, tube, inst, count, len, off: (pipes.length * 0.37) % 1, speed: 0 });
}
const P = (...ids) => ids.map(i => 'pipe:' + i);
const PIPES_OF = c => PIPE_DEFS.filter(d => d.circuit === c).map(d => 'pipe:' + d.id);
const PRI_SUP = P('pri_supply_main', 'pri_supply_f1', 'pri_supply_f2', 'pri_supply_f3');
const PRI_RET = P('pri_return_f1', 'pri_return_f2', 'pri_return_f3', 'pri_return_main');
const BRANCH = { zone_building: P('br_building'), zone_robot_lab: P('br_lab'), zone_seed_germination: P('br_seed'), zone_greenhouse: P('br_greenhouse') };

/* ═════════════════════════ labels ═════════════════════════ */
function css(cls, html, pos, parent = scene) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; const o = new CSS2DObject(el); o.position.set(...pos); parent.add(o); return el; }
for (const f of FLOORS) css('floor-tag', f.name, [-21.5, f.y + 2, 11]);
const zoneTags = {
  building: css('zone-tag', '', [-1, 21.6, 4.6]), lab: css('zone-tag', '', [-12, 3.2, -4]), seed: css('zone-tag', '', [4, -1.0, 9]),
  vault: css('zone-tag', '<b>Seed vault</b> · kept cold by its own fridge', [-12.5, -0.6, -3.5]), gh: css('zone-tag', '', [GHX, 6.6, 0]),
  plant: css('zone-tag', '', [10, -5.4, 9]),
};
const ANCHORS = { gpu: [0, 23, 4], roof: [8, 24.5, -6], building: [-1, 24, 4.6], greenhouse: [GHX, 9.5, 0], lab: [-12, 5.5, -4], seed: [4, 1.2, 9], tank: [8, -2.6, -6], plant: [-2, -2.6, 6] };
const alertEls = Object.fromEntries(Object.entries(ANCHORS).map(([k, p]) => [k, css('alert3d', '', p)]));

/* ═════════════════════════ cameras ═════════════════════════ */
const CAMS = {
  auto: { p: [62, 40, 74], t: [14, 2, 0] }, iso: { p: [74, 64, 62], t: [14, 0, 0] }, front: { p: [2, 7, 60], t: [2, 4.5, 0] },
  walk: { p: [-15, 1.8, 8.5], t: [4, 1.6, 2] }, gh: { p: [47, 15, 34], t: [41, 1, 0] }, b2: { p: [3, -3.4, 25], t: [2, -6.8, -4] },
  roof: { p: [16, 30, 24], t: [2, 18.5, -2] }, rack: { p: [-1, FY.f2 + 4.4, 13], t: [-5, FY.f2 + 1.6, -1] },
  hx: { p: [-0.5, -5.2, 6.5], t: [-4, -7.0, -6.2] }, valves: { p: [6.5, -3.6, 9.5], t: [12.5, -5.2, -1.8] },
  rig: { p: [-6.5, 3.4, 1.5], t: [-12, 1.2, -6] }, seed: { p: [2, -0.6, 12], t: [-4, -2.6, -5] }, ahu: { p: [10, 25, 18], t: [-1, 19, 4] },
  heat: { p: [36, 26, 58], t: [6, 1, 0] }, day: { p: [26, 24, 70], t: [20, 0, 0] },
};
for (const f of FLOORS) CAMS[f.key] = { p: [0, f.y + 8.5, 33], t: [0, f.y + 1.8, 0] };
let tween = null;
function flyTo(key) {
  const c = CAMS[key] || CAMS.auto; state.look = key;
  tween = { t: 0, fp: camera.position.clone(), ft: controls.target.clone(), tp: new THREE.Vector3(...c.p), tt: new THREE.Vector3(...c.t) };
}
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ═════════════════════════ scene ← simulation ═════════════════════════ */
function setFocus(keys) { for (const k in groups) groups[k].dim = !keys || keys.includes(k) || k === 'ground' ? 1 : 0.1; }
function applyCutaway() { groups.cutfront.g.visible = !state.cutaway; for (const f of FLOORS) groups[f.key].g.visible = !state.hidden.has(f.key); }

function updateScene() {
  const r = R.now, inp = state.inp;
  racks.forEach(rk => { const t = r.chip - (2 - rk.fi) * 1.8; const c = tcol(clamp(15 + (t - 40), 15, 65)); rk.leds.forEach(m => { m.color.copy(c); m.emissive.copy(c); }); rk.hot = t > LIMITS.chipThrottle; });
  for (const p of pipes) {
    const st = r.pipes[p.d.key] || { T: 25, flow: 0 };
    let on = st.flow > 0.02;
    if (p.d.id === 'hp_source') on = r.cond > 0.5;
    if (p.d.id === 'reject_riser') on = r.rejected > 0.5 || r.unrejected > 0.5;
    let col;
    if (state.hydro === 'physical') col = new THREE.Color(PHYS[p.d.circuit][p.d.kind]);
    else if (state.hydro === 'flow') col = new THREE.Color('#3b4a5a').lerp(new THREE.Color('#40e0ff'), clamp(st.flow / 30, 0, 1));
    else col = tcol(st.T);
    p.tube.material.color.copy(on ? col : new THREE.Color('#7a838c'));
    p.tube.material.emissive.copy(on ? col : new THREE.Color(0)).multiplyScalar(0.28);
    p.inst.material.color.copy(col).lerp(new THREE.Color('#ffffff'), 0.5);
    p.inst.visible = on;
    p.speed = on ? 1.6 + 7 * clamp(st.flow / 30, 0.08, 1.4) : 0;
  }
  hxPlates.forEach((m, i) => { const c = tcol(i % 2 ? r.T2 : r.Tr); m.color.copy(c); m.emissive.copy(c); });
  hpCompMat.color.set(r.cond > 0.5 ? '#ff5a3c' : '#555'); hpCompMat.emissive.set(r.cond > 0.5 ? '#ff3b1f' : '#000');
  tapTankMat.emissiveIntensity = r.cond > 0.5 ? 0.45 : 0.05;
  backupMat.color.set(r.backup > 2 ? '#e2762c' : '#8a6a50'); backupMat.emissive.set(r.backup > 2 ? '#ff6a1f' : '#000');
  chillerLampMat.color.set(r.chillerElec > 0 ? '#ff4433' : '#22aa66'); chillerLampMat.emissive.set(r.chillerElec > 0 ? '#ff2a1a' : '#1f9d63');
  tankTarget = r.tankFrac; tankLevelMat.color.copy(tcol(r.T2)); tankLevelMat.emissive.copy(tcol(r.T2));
  plumeLevel = clamp((r.rejected + r.unrejected) / 1100, 0, 1.2);
  // valves: open = green handle turned along the pipe
  r.zones.forEach((z, i) => { const v = valves[i]; v.handle.rotation.x = (1 - z.valve) * Math.PI / 2; v.handle.material.color.set(z.valve > 0.05 ? '#1f9d63' : '#d2453a'); });
  // facilities react
  const [bz, lz, sz, gz] = r.zones;
  ahuCoilMat.color.copy(tcol(bz.Tin)); ahuCoilMat.emissiveIntensity = 0.1 + 0.5 * bz.valve;
  rigJacketMat.color.copy(tcol(lz.Tin)); rigJacketMat.emissive.copy(tcol(lz.Tin));
  const sampleT = r.lab.pts[r.lab.pts.length - 1].T; sampleMat.color.copy(tcol(sampleT)); sampleMat.emissive.copy(tcol(sampleT));
  germMats.forEach(m => (m.emissiveIntensity = 0.05 + 0.4 * (1 - sz.unmetFrac) * (sz.demand > 0 ? 1 : 0)));
  const cold = gz.demand > 0 ? gz.unmetFrac : 0;
  plantMat.color.copy(new THREE.Color('#5fbf4a').lerp(new THREE.Color('#b9c8b4'), clamp(cold * 1.4, 0, 1)));
  ghGlassMat.color.copy(new THREE.Color('#d6ecf2').lerp(new THREE.Color('#ffffff'), clamp(cold * 1.6, 0, 1)));
  ghGlassMat.userData.base = 0.16 + clamp(cold, 0, 1) * 0.45;
  bedMats.forEach(m => m.color.copy(new THREE.Color('#4a3424').lerp(new THREE.Color('#8a4a22'), clamp(1 - cold, 0, 1))));
  nightTarget = clamp(0.5 - 0.9 * Math.cos(2 * Math.PI * (inp.hour - 13) / 24), 0, 1);
  const tag = (z, extra = '') => `<b>${z.short}</b> · water ${fmt(z.Tin)}°C${z.unmetFrac > 0.15 ? ' · <span style="color:#d2453a">backup heater on</span>' : z.demand > 0 ? ' · warm ✓' : ''}${extra}`;
  zoneTags.building.innerHTML = tag(bz);
  zoneTags.lab.innerHTML = `<b>Test rig</b> · sample ${fmt(sampleT, 1)}°C ${r.lab.valid ? '· steady ✓' : '· <span style="color:#d2453a">' + (r.lab.reason === 'too cool' ? 'water too cool' : 'wobbling') + '</span>'}`;
  zoneTags.seed.innerHTML = tag(sz);
  zoneTags.gh.innerHTML = tag(gz);
  zoneTags.plant.innerHTML = `<b>Plant room</b> · ${fmt(r.Tr)}°C in → ${fmt(r.T2)}°C out${r.cond > 0.5 ? ' · heat pump on' : ''}`;
  const by = {};
  for (const t of evaluateTriggers(r)) { if (t.sev === 'good' && state.mode === 'expert') continue; (by[t.anchor] ||= []).push(t); }
  for (const k in alertEls) alertEls[k].innerHTML = (by[k] || []).slice(0, 2).map(t => `<div class="${t.sev}">${t.sev === 'good' ? '✓ ' : '⚠ '}${t.title}</div>`).join('');
}

/* ═════════════════════════ AUDIENCE MODE ═════════════════════════ */
const PIPE_STOPS = [
  { t: 'Cool water goes up to the computers', d: 'A pump pushes <b>cool water</b> (blue) up three floors to the GPU halls. The pipes run right past every server rack.', cam: 'front', focus: ['f1', 'f2', 'f3', 'b2', 'shell', ...PRI_SUP], seg: ['sup'] },
  { t: 'Metal plates grab the heat', d: 'On each chip sits a <b>cold plate</b>, a metal block with water inside. The chip heats the metal and the metal heats the water, like a hot-water bottle filling up. The water never touches the electronics.', cam: 'rack', focus: ['f2', ...PRI_SUP, ...PRI_RET], seg: ['gpu'] },
  { t: 'Hot water comes back down', d: 'Now <b>hot</b> (red), the water flows down to the basement plant room.', cam: 'front', focus: ['f1', 'f2', 'f3', 'b2', 'shell', ...PRI_RET], seg: ['ret'] },
  { t: 'Heat jumps across, water doesn\'t', d: 'The <b>heat exchanger</b> is a stack of thin metal plates. Hot server water flows on one side, clean building water on the other. Heat passes through the metal, but the two waters <b>never mix</b>, so server coolant can\'t reach the lab or the greenhouse.', cam: 'hx', focus: ['b2', P('pri_return_main')[0], ...P('sec_hx', 'pri_supply_main')], seg: ['hx'] },
  { t: 'A tank and four taps share it out', d: 'The warm building water goes into a <b>storage tank</b> (a thermos for heat), then to a pipe with <b>four valves</b>, one per place. Each valve opens only when its place is cold, like a thermostat on a radiator.', cam: 'valves', focus: ['b2', ...P('sec_hx', 'sec_header', 'br_building', 'br_lab', 'br_seed', 'br_greenhouse')], seg: ['tank', 'valves'] },
  { t: 'Cooled water comes home; leftovers go up', d: 'After giving away its heat, the water returns <b>cooler</b> (cyan) to be warmed again. That makes a loop. Any heat nobody needs goes to the <b>roof cooler</b> and out into the air (watch for steam).', cam: 'auto', focus: null, seg: ['back', 'roof'] },
];

const USES = { // from the ThermalLoop recovered-heat research note
  zone_building: { title: 'Building heating', cam: 'ahu', focus: ['ahu', 'roof', ...BRANCH.zone_building], body: 'Keeps people comfortable and means the normal heating has less to do.',
    uses: ['<b>Air-handling coil</b>: warm water runs through a radiator in the ventilation unit, so fresh air comes in warm instead of cold.', '<b>Radiant floors / radiators</b>: warm water flows through pipes in the floor or in radiators.', '<b>Pre-heating tap water</b>: takes the chill off tap water first, so the boiler has less work to do.'],
    temp: 'Needs water at about <b>40°C</b>.' },
  zone_robot_lab: { title: 'Robotics & Materials Lab', cam: 'rig', focus: ['gf', ...BRANCH.zone_robot_lab], body: 'Experiments need a <b>steady</b> temperature. Soft robot parts and plastics bend differently when warm or cool, so a test only counts if the temperature stays put.',
    uses: ['<b>Room heating coil</b>: keeps the whole lab at a stable temperature.', '<b>Temperature-controlled test stage</b>: holds a sample at exactly the temperature an experiment needs.', '<b>Water-jacketed materials rig</b>: warm water flows around a sample like a heated blanket.'],
    temp: 'Needs about <b>35°C</b>, and must be <b>steady</b>. A heat exchanger keeps server water out of the lab.' },
  zone_seed_germination: { title: 'Seed center', cam: 'seed', focus: ['b1', ...BRANCH.zone_seed_germination], body: 'Two very different jobs in one place: warming seeds so they sprout, and keeping stored seeds cold.',
    uses: ['<b>Germination chambers</b>: warm boxes where seeds sprout. Researchers test different temperatures (e.g. 20, 25 or 30°C).', '<b>Seed-tray / root-zone warming</b>: warm water under trays heats the soil, not the room.', '<b>Seed vault (cold!)</b>: stored seeds must stay cold and dry. It has its <b>own fridge</b> and is never heated by this loop.'],
    temp: 'Germination needs only about <b>28°C</b>, the easiest job of all. The vault needs <b>cold</b>, not heat.' },
  zone_greenhouse: { title: 'Greenhouse', cam: 'gh', focus: ['gh', 'corridor', ...BRANCH.zone_greenhouse, ...P('sec_return')], body: 'Plants need warmth on cold nights. Warming the soil is often enough, so you don\'t have to heat all the air.',
    uses: ['<b>Root-zone pipes</b>: warm-water pipes under the beds heat the roots directly.', '<b>Air-heating coils</b>: top up the air temperature when glass walls lose heat.', '<b>Summer</b>: plants need no heat, so the heat is stored or dumped instead.'],
    temp: 'Needs about <b>38°C</b>, mostly at <b>night</b> and in <b>winter</b>.' },
};

const LADDER = [
  { k: 'vault', name: 'Seed vault (storage)', need: null, icon: '❄', note: 'Must stay <b>cold and dry</b>. It gets its own fridge and never uses waste heat.' },
  { k: 'zone_seed_germination', name: 'Seed germination', need: 28, note: 'Sprouting seeds like it warm, not hot.' },
  { k: 'zone_robot_lab', name: 'Robot lab test rig', need: 35, note: 'Must hold steady for experiments.' },
  { k: 'zone_greenhouse', name: 'Greenhouse roots', need: 38, note: 'Pipes under the soil.' },
  { k: 'zone_building', name: 'Building radiators / air coil', need: 40, note: 'Warm air and floors for people.' },
  { k: 'taps', name: 'Hot tap water', need: 60, note: 'Must reach 60°C to kill germs. Only the <b>heat pump</b> can lift the water that high.' },
];

const STEPS = [
  { name: 'The idea', title: 'Computers make heat. This building reuses it.', cam: 'auto', focus: null,
    lede: 'Three floors of AI computers get very hot. Instead of throwing that heat away, the building carries it in water pipes to four places that need warmth: the building itself, a robot lab, a seed center and a greenhouse.',
    controls: () => `<div class="sec">Have a look</div><div class="looks">${[['auto', 'Whole site'], ['f2', 'AI computers'], ['rig', 'Robot lab'], ['seed', 'Seed center'], ['gh', 'Greenhouse'], ['b2', 'Plant room'], ['ahu', 'Building heating'], ['roof', 'Roof cooler']].map(([k, n]) => `<button data-look="${k}" class="${state.look === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${toggle('cutaway', 'See-through cutaway', 'Slice the front off to look inside', state.cutaway)}
      <div class="note">Drag to spin around, scroll to zoom, or click a floor to fly there.</div>` },
  { name: 'Why it\'s hot', title: 'Why do AI computers get so hot?', cam: 'rack', focus: ['f1', 'f2', 'f3', 'shell'],
    lede: 'Computer chips run on electricity, and almost all of that electricity ends up as heat, just like a toaster. Drag the slider to make the computers work harder.',
    controls: () => slider('load', 'How hard the computers work', 0.2, 1, 0.01, v => `${fmt(v * 100)}%`, ['resting', 'flat out']) + `<div id="analogy" class="note"></div>` },
  { name: 'How pipes work', title: 'How the pipes work, step by step', cam: 'front', focus: null,
    lede: 'Follow the water around the loop. Click each stop, or press "Next stop".',
    controls: () => `<svg class="diagram" id="loopdia" viewBox="0 0 370 220"></svg>
      <div class="stops">${PIPE_STOPS.map((s, i) => `<div class="stop ${state.stop === i ? 'on' : ''}" data-stop="${i}"><span class="n">${i + 1}</span><div><b>${s.t}</b>${state.stop === i ? `<div style="margin-top:3px">${s.d}</div>` : ''}</div></div>`).join('')}</div>
      <button class="btn pri sm" id="nextStop" style="margin-top:8px">${state.stop < PIPE_STOPS.length - 1 ? 'Next stop →' : 'Start again ↺'}</button>
      <div class="sec">Try it: pump speed</div>${slider('pump', 'How fast the water flows', 0.3, 1, 0.01, v => `${fmt(v * 100)}%`, ['slow', 'fast'])}` },
  { name: 'Warm, hot, cold', title: 'Warm water, hot water, cold storage: who needs what?', cam: 'heat', focus: null,
    lede: 'Water from the computers comes out <i>warm</i>, about as warm as a hot bath. That is enough for some jobs but not others. Slide the temperature and see who can use it.',
    controls: () => slider('supply', 'Water sent to the computers', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, ['cooler (safer chips)', 'warmer (hotter chips)'], 'temp') +
      `<div class="temps" id="temps"></div>` + toggle('heatPump', 'Heat pump', 'Uses a bit of electricity to make water hotter', state.inp.heatPump) + `<div class="ladder" id="ladder"></div>` },
  { name: 'Robot lab', title: 'How warm water helps the robot lab', cam: 'rig', focus: ['gf', ...BRANCH.zone_robot_lab, ...P('sec_header', 'sec_hx')],
    lede: 'Robots made of soft materials behave differently when warm or cool. To test them fairly, the lab holds a sample at an exact temperature with warm water flowing around it, like a heated blanket. Try it.',
    controls: () => `<div class="facinfo" style="margin-top:4px"><ul style="margin:0;padding-left:18px">${USES.zone_robot_lab.uses.map(u => `<li>${u}</li>`).join('')}</ul></div>` +
      slider('labSet', 'Temperature you want for the test sample', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, ['20°C', '45°C'], 'temp') +
      toggle('labControl', 'Smart valve (thermostat)', 'Opens and closes the warm water automatically', state.inp.labControl) +
      `<svg class="diagram" id="rigchart" viewBox="0 0 370 150"></svg><div id="rigverdict"></div>
      <div class="note">Safety: the lab never gets raw server water. A heat exchanger sits in between, so only clean water reaches the lab.</div>` },
  { name: 'Four places', title: 'Four places, one network', cam: 'heat', focus: null,
    lede: 'Each place uses the warm water differently. Pick one to see how, then try connecting them in two different ways.',
    controls: () => `<div class="facs">${ZONES.map(z => `<button data-fac="${z.id}" class="${state.fac === z.id ? 'on' : ''}"><b>${USES[z.id].title}</b>needs ~${z.need}°C</button>`).join('')}</div><div id="facinfo"></div>
      <div class="sec">How should the pipes connect them?</div>${seg('topology', '', [['parallel', 'Own pipe each'], ['series', 'One pipe in a chain']])}
      <svg class="diagram" id="topodia" viewBox="0 0 370 150"></svg><div id="topoverdict" class="note"></div>` },
  { name: 'Your turn', title: 'Your turn: run the building', cam: 'auto', focus: null,
    lede: 'Pick a mission, press "Set the scene", then use the controls. The building will tell you what happens.',
    controls: () => `<div id="chals"></div><div class="sec">Controls</div>
      ${slider('supply', 'Water sent to the computers', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, null, 'temp')}
      ${slider('pump', 'Pump speed', 0.3, 1, 0.01, v => `${fmt(v * 100)}%`)}
      ${seg('topology', 'Pipe layout', [['parallel', 'Own pipe each'], ['series', 'One chain']])}
      ${seg('season', 'Season', Object.entries(SEASONS).map(([k, s]) => [k, s.label]))}
      <div class="ctl"><div class="row">Time of day <b id="v-hour">${hhmm(state.inp.hour)}</b></div><input type="range" data-ctl="hour" min="0" max="23.9" step="0.1" value="${state.inp.hour}"></div>
      <details style="margin-top:6px"><summary style="cursor:pointer;font-size:13px;color:#5b6976">More controls</summary>
        ${slider('load', 'How hard the computers work', 0.2, 1, 0.01, v => `${fmt(v * 100)}%`)}
        ${slider('labSet', 'Robot-lab sample target', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, null, 'temp')}
        ${toggle('labControl', 'Robot-lab smart valve', '', state.inp.labControl)}
        ${toggle('heatPump', 'Heat pump (for hot taps)', '', state.inp.heatPump)}
        ${toggle('dryCooler', 'Roof cooler', 'Throws away heat nobody needs', state.inp.dryCooler)}
      </details>
      <button class="btn ghost sm" id="resetAll" style="margin-top:10px">Reset everything</button>
      <div id="remember"></div>` },
];

function slider(k, label, min, max, step, show, ends, cls = '') {
  const v = state.inp[k];
  return `<div class="ctl"><div class="row">${label} <b data-show="${k}">${show(v)}</b></div><input type="range" class="${cls}" data-ctl="${k}" min="${min}" max="${max}" step="${step}" value="${v}">${ends ? `<div class="scale"><span>${ends[0]}</span><span>${ends[1]}</span></div>` : ''}</div>`;
}
const SHOW = { load: v => `${fmt(v * 100)}%`, pump: v => `${fmt(v * 100)}%`, supply: v => `${fmt(v, 1)}°C`, labSet: v => `${fmt(v, 1)}°C`, hour: v => hhmm(v) };
function toggle(k, label, sub, on) { return `<div class="tgl ${on ? 'on' : ''}" data-tgl="${k}"><div>${label}${sub ? `<small>${sub}</small>` : ''}</div><span class="sw"></span></div>`; }
function seg(k, label, opts) { return `<div class="ctl">${label ? `<div class="row">${label}</div>` : ''}<div class="seg">${opts.map(([v, n]) => `<button data-seg="${k}" data-v="${v}" class="${state.inp[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`; }

/* controls → model */
function setInput(k, v) {
  if (k === 'cutaway') { state.cutaway = v; applyCutaway(); return; }
  const before = R.now;
  state.inp[k] = v; recompute();
  state.lastWhy = explain(k, before, R.now);
  const trig = evaluateTriggers(R.now), was = new Set(evaluateTriggers(before).map(t => t.id));
  const fresh = trig.filter(t => !was.has(t.id) && t.sev !== 'good');
  for (const t of fresh.slice(0, 2)) state.lastWhy.push(`⚠ <b>${t.title}.</b> ${t.detail}`);
  state.whySev = fresh.some(t => t.sev === 'bad') ? 'bad' : '';
  refreshLive();
}
function bindControls(root) {
  root.querySelectorAll('input[data-ctl]').forEach(el => el.addEventListener('input', () => {
    setInput(el.dataset.ctl, +el.value);
    const s = root.querySelector(`[data-show="${el.dataset.ctl}"]`); if (s) s.textContent = SHOW[el.dataset.ctl](+el.value);
    const vh = root.querySelector('#v-hour'); if (el.dataset.ctl === 'hour' && vh) vh.textContent = hhmm(+el.value);
  }));
  root.querySelectorAll('[data-tgl]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.tgl, v = k === 'cutaway' ? !state.cutaway : !state.inp[k]; el.classList.toggle('on', v); setInput(k, v);
  }));
  root.querySelectorAll('[data-seg]').forEach(el => el.addEventListener('click', () => {
    root.querySelectorAll(`[data-seg="${el.dataset.seg}"]`).forEach(b => b.classList.toggle('on', b === el)); setInput(el.dataset.seg, el.dataset.v);
  }));
  root.querySelectorAll('[data-look]').forEach(el => el.addEventListener('click', () => lookAt(el.dataset.look)));
}
const LOOK_FOCUS = { f2: ['f1', 'f2', 'f3', 'shell'], rig: ['gf', ...BRANCH.zone_robot_lab], seed: ['b1', ...BRANCH.zone_seed_germination], gh: ['gh', 'corridor', ...BRANCH.zone_greenhouse],
  b2: ['b2', 'shell', ...PRI_RET, ...PRI_SUP, ...PIPES_OF('secondary'), ...PIPES_OF('hp')], ahu: ['ahu', 'roof', ...BRANCH.zone_building], roof: ['roof', 'ahu', 'shell', ...PIPES_OF('reject')] };
function lookAt(k) {
  flyTo(k);
  if (state.mode === 'audience' && state.step === 0) { setFocus(LOOK_FOCUS[k] || null); $$('[data-look]').forEach(b => b.classList.toggle('on', b.dataset.look === k)); }
}

/* plain-language "what happens" */
function explain(k, a, b) {
  const d = g => g(b) - g(a), n = (x, dd = 0) => fmt(Math.abs(x), dd), up = x => x > 0;
  const out = [];
  const chip = d(r => r.chip), tr = d(r => r.Tr);
  switch (k) {
    case 'load': {
      const it = d(r => r.IT);
      out.push(up(it) ? `The computers now use <b>${n(it)} kW more</b> electricity, and almost all of it turns into heat.` : `The computers use <b>${n(it)} kW less</b>, so there's less heat to deal with.`);
      if (Math.abs(chip) > 0.3) out.push(`Chips get <b>${n(chip, 1)}°C ${up(chip) ? 'hotter' : 'cooler'}</b> (now ${fmt(b.chip)}°C).`);
      break; }
    case 'pump':
      out.push(up(-tr) ? `Faster water spends less time near the chips, so it comes out <b>${n(tr, 1)}°C cooler</b> (${fmt(b.Tr)}°C). The chips stay cooler, but the pump uses more electricity.`
        : `Slower water stays near the chips longer, so it comes out <b>${n(tr, 1)}°C hotter</b> (${fmt(b.Tr)}°C). That's more useful heat, but the chips get hotter too (${fmt(b.chip)}°C).`);
      break;
    case 'supply':
      out.push(up(tr) ? `Warmer water in means warmer water out: <b>${fmt(b.T2)}°C</b> reaches the four places, so more of them can be heated.` : `Cooler water protects the chips, but only <b>${fmt(b.T2)}°C</b> reaches the four places, which may be too cool for some.`);
      out.push(`Chips: <b>${fmt(b.chip)}°C</b> (limit ${LIMITS.chipThrottle}°C).`);
      if (a.chillerElec === 0 && b.chillerElec > 0) out.push('The water is now colder than outside air can make it, so a <b>chiller</b> (a big fridge) has to switch on.');
      break;
    case 'heatPump':
      out.push(state.inp.heatPump ? `The heat pump uses <b>${fmt(b.hpElec)} kW</b> of electricity to lift water to 60°C for the hot taps. That's like a fridge working backwards.` : 'Heat pump off: recovered heat can\'t reach 60°C, so the <b>hot taps fall back to the backup heater</b>.');
      break;
    case 'labSet': case 'labControl': {
      const L = b.lab;
      out.push(L.valid ? `The sample holds steady at <b>${fmt(L.set, 1)}°C</b> (wobble ${fmt(L.swing, 1)}°C). Results can be trusted ✓.`
        : L.reason === 'too cool' ? `The lab water is only <b>${fmt(L.Tin)}°C</b>. It must be a couple of degrees warmer than the target, so the sample can't reach ${fmt(L.set, 1)}°C.`
          : `Without the smart valve the temperature <b>wobbles by ${fmt(L.swing, 1)}°C</b>. A wobbly test can't tell you anything, so the experiment is ruined.`);
      break; }
    case 'topology':
      out.push(state.inp.topology === 'series' ? `Now one pipe visits every place in turn. Each one cools the water a bit, so the greenhouse at the end only gets <b>${fmt(b.zones[3].Tin)}°C</b>.` : 'Each place gets its own pipe, so they all receive the same warm water and can be controlled separately.');
      break;
    case 'dryCooler':
      out.push(state.inp.dryCooler ? 'The roof cooler is back on, so spare heat has somewhere to go.' : `With the roof cooler off, <b>${fmt(b.unrejected)} kW</b> of spare heat has nowhere to go, so the water and chips keep heating up (${fmt(b.chip)}°C).`);
      break;
    case 'season': case 'hour':
      out.push(`It's ${fmt(b.Ta)}°C outside. The four places now want <b>${fmt(b.demandTotal)} kW</b> of heat${b.backup > 2 ? `, and the backup heater makes up ${fmt(b.backup)} kW` : ', all covered by recovered heat'}.`);
      break;
  }
  if (!a.throttle && b.throttle) out.push(`⚠ <b>The chips passed ${LIMITS.chipThrottle}°C and slowed down</b> to protect themselves. The computers lose ${fmt(b.computeLost * 100)}% of their speed.`);
  if (a.throttle && !b.throttle) out.push('✓ The chips cooled down and run at full speed again.');
  const cold = b.zones.filter(z => z.unmetFrac > 0.15 && !(a.zones.find(q => q.id === z.id).unmetFrac > 0.15));
  if (cold.length && k !== 'season' && k !== 'hour') out.push(`⚠ Not warm enough for: <b>${cold.map(z => z.short).join(', ')}</b>, so the backup heater kicks in.`);
  const warmAgain = b.zones.filter(z => z.unmetFrac <= 0.02 && a.zones.find(q => q.id === z.id).unmetFrac > 0.15);
  if (warmAgain.length) out.push(`✓ Warm again with recovered heat: <b>${warmAgain.map(z => z.short).join(', ')}</b>.`);
  return out;
}

function renderHappen() {
  const el = $('#happen'); if (!el) return;
  el.className = 'happen ' + (state.whySev || (state.lastWhy.some(s => s.startsWith('✓')) ? 'good' : ''));
  el.innerHTML = `<div class="hd">What happens</div>` + (state.lastWhy.length ? state.lastWhy.map(s => `<p>${s}</p>`).join('') : '<p>Move a slider or flip a switch to see what happens.</p>');
}

/* step widgets */
function renderAnalogy(r) {
  const el = $('#analogy'); if (!el) return;
  el.innerHTML = `Right now the computers turn <b>${fmt(r.IT)} kW</b> of electricity into heat. That's like <b>${fmt(r.heaters)} electric room heaters</b> running at once, day and night. Hottest chip: <b style="color:${r.throttle ? '#d2453a' : '#14202b'}">${fmt(r.chip)}°C</b> (they slow down above ${LIMITS.chipThrottle}°C).`;
}
function renderLoopDiagram() {
  const svg = $('#loopdia'); if (!svg) return;
  const r = R.now, hot = new Set(PIPE_STOPS[state.stop].seg);
  const S = (id, d, col, w = 4) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${hot.has(id) ? w + 3 : w}" opacity="${hot.has(id) ? 1 : 0.28}" stroke-linecap="round"/>`;
  const B = (id, x, y, w, h, t, sub, fill = '#f2f6f8') => `<g opacity="${hot.has(id) || !hot.size ? 1 : 0.55}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${hot.has(id) ? '#0f7b8a' : '#cdd8e1'}" stroke-width="${hot.has(id) ? 2.5 : 1}"/><text x="${x + w / 2}" y="${y + h / 2 - (sub ? 2 : -4)}" text-anchor="middle" font-size="11" font-weight="700" fill="#14202b">${t}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 11}" text-anchor="middle" font-size="9.5" fill="#5b6976">${sub}</text>` : ''}</g>`;
  const fac = ['Building', 'Robot lab', 'Seed center', 'Greenhouse'];
  svg.innerHTML = `
    ${S('sup', 'M70 150 L30 150 L30 40 L70 40', tcss(r.Ts))}
    ${S('ret', 'M130 40 L170 40 L170 125', tcss(r.Tr))}
    ${S('roof', 'M170 70 L215 70 L215 28', tcss(r.Tr), 3)}
    ${S('tank', 'M195 150 L232 150', tcss(r.T2))}
    ${S('valves', 'M268 150 L285 150 L285 32 L300 32 M285 74 L300 74 M285 116 L300 116 M285 158 L300 158', tcss(r.T2), 3)}
    ${S('back', 'M335 186 L335 204 L150 204 L150 175', tcss(r.Tret), 3)}
    ${B('gpu', 70, 22, 60, 40, 'AI chips', `${fmt(r.chip)}°C`, '#eef1f4')}
    ${B('hx', 125, 125, 70, 50, 'Heat', 'exchanger')}
    ${B('roof', 192, 8, 46, 22, 'Roof', '', '#eef1f4')}
    ${B('tank', 232, 132, 36, 36, 'Tank', '')}
    ${fac.map((n, i) => B('valves', 300, 18 + i * 42, 62, 28, n, '')).join('')}
    <text x="34" y="100" font-size="9.5" fill="#2f7bff" transform="rotate(-90 34 100)">cool in ${fmt(r.Ts)}°C</text>
    <text x="176" y="96" font-size="9.5" fill="#d2453a">hot ${fmt(r.Tr)}°C</text>
    <text x="203" y="164" font-size="9.5" fill="#9a6a0b">${fmt(r.T2)}°C</text>
    <text x="200" y="216" font-size="9.5" fill="#0f7b8a">cooler water back · ${fmt(r.Tret)}°C</text>
    <text x="60" y="186" font-size="9" fill="#8a97a3">server loop</text><text x="218" y="186" font-size="9" fill="#8a97a3">building loop</text>
    <line x1="160" y1="118" x2="160" y2="200" stroke="#8a97a3" stroke-dasharray="3 3"/>`;
}
function renderLadder() {
  const r = R.now, el = $('#ladder'); if (!el) return;
  const T2 = r.T2, pos = t => clamp((t - 15) / 50 * 100, 0, 100);
  $('#temps').innerHTML = `<div style="background:${tcss(r.Ts)}">Into the computers<b>${fmt(r.Ts, 1)}°C</b></div><div style="background:${tcss(r.Tr)}">Out of the computers<b>${fmt(r.Tr, 1)}°C</b></div><div style="background:${tcss(T2)}">Reaches the 4 places<b>${fmt(T2, 1)}°C</b></div>`;
  el.innerHTML = LADDER.map(L => {
    if (L.k === 'vault') return `<div class="z"><div class="zh"><b>❄ ${L.name}</b><span class="pill" style="background:#e2f0fb;color:#2f7bff">own fridge</span></div><div class="zs" style="margin-top:4px"><span>${L.note}</span></div></div>`;
    let ok, label;
    if (L.k === 'taps') { ok = r.taps.unmetFrac < 0.05; label = ok ? 'via heat pump ✓' : 'needs heat pump'; }
    else {
      const z = r.zones.find(q => q.id === L.k);
      if (z.demand < 1) { ok = true; label = 'no heat needed now'; }
      else { ok = z.unmetFrac <= 0.05; label = ok ? 'warm enough ✓' : z.reason === 'too cool' ? 'too cool' : 'not enough heat'; }
    }
    return `<div class="z"><div class="zh"><b>${L.name}</b><span class="pill ${ok ? (L.k === 'taps' ? 'warn' : 'good') : 'bad'}">${label}</span></div>
      <div class="bar"><span class="need" style="left:${pos(L.need)}%"></span><span class="have" style="left:${pos(T2)}%"></span></div>
      <div class="zs"><span>needs ${L.need}°C</span><span>${L.note}</span></div></div>`;
  }).join('') + `<div class="note">The dark marker is the water you have; the line is what each job needs. Why not just make the water hotter? Hotter water means hotter chips, and above ${LIMITS.chipThrottle}°C they slow down.</div>`;
}
function renderRig() {
  const svg = $('#rigchart'); if (!svg) return;
  const L = R.now.lab, W = 370, H = 150, X = t => 34 + t / 3 * (W - 46), lo = Math.min(L.set, ...L.pts.map(p => p.T)) - 3, hi = Math.max(L.set, ...L.pts.map(p => p.T)) + 3, Y = T => H - 22 - (T - lo) / (hi - lo) * (H - 38);
  svg.innerHTML = `<rect x="34" y="${Y(L.set + 0.5)}" width="${W - 46}" height="${Math.max(2, Y(L.set - 0.5) - Y(L.set + 0.5))}" fill="#1f9d63" opacity=".15"/>
    <line x1="34" x2="${W - 12}" y1="${Y(L.set)}" y2="${Y(L.set)}" stroke="#1f9d63" stroke-dasharray="4 3"/>
    <text x="${W - 14}" y="${Y(L.set) - 4}" text-anchor="end" font-size="9.5" fill="#1f9d63">target ${fmt(L.set, 1)}°C</text>
    <path d="${L.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.T).toFixed(1)}`).join(' ')}" fill="none" stroke="${L.valid ? '#0f7b8a' : '#d2453a'}" stroke-width="2.4"/>
    ${[0, 1, 2, 3].map(t => `<text x="${X(t)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#8a97a3">${t} h</text>`).join('')}
    <text x="6" y="14" font-size="9.5" fill="#5b6976">Sample temperature during a 3-hour test</text>`;
  $('#rigverdict').innerHTML = L.valid ? `<span class="verdict good">✓ Steady: experiment valid</span>`
    : L.reason === 'too cool' ? `<span class="verdict bad">✗ Lab water is ${fmt(L.Tin)}°C, too cool for ${fmt(L.set, 1)}°C</span>` : `<span class="verdict bad">✗ Wobbling ±${fmt(L.swing / 2, 1)}°C: experiment ruined</span>`;
}
function renderFac() {
  const el = $('#facinfo'); if (!el) return;
  const u = USES[state.fac], z = R.now.zones.find(q => q.id === state.fac);
  el.innerHTML = `<div class="facinfo"><h3>${u.title}</h3>${u.body}<ul>${u.uses.map(x => `<li>${x}</li>`).join('')}</ul>${u.temp}
    <div style="margin-top:8px">Right now: water arrives at <b>${fmt(z.Tin)}°C</b> · ${z.demand < 1 ? 'no heat needed' : z.unmetFrac <= 0.02 ? '<span style="color:#1f9d63"><b>fully warmed by recovered heat ✓</b></span>' : `<span style="color:#d2453a"><b>backup heater covers ${fmt(z.unmetFrac * 100)}%</b></span>`}</div></div>`;
}
function renderTopo() {
  const svg = $('#topodia'); if (!svg) return;
  const r = R.now, series = state.inp.topology === 'series', names = ['Building', 'Robot lab', 'Seed center', 'Greenhouse'];
  const box = (x, y, z, n, h = 34) => `<rect x="${x}" y="${y}" width="78" height="${h}" rx="7" fill="#fff" stroke="${z.unmetFrac > 0.15 ? '#d2453a' : '#1f9d63'}" stroke-width="2"/>
    <text x="${x + 39}" y="${y + 14}" text-anchor="middle" font-size="10" font-weight="700" fill="#14202b">${n}</text>
    <text x="${x + 39}" y="${y + 27}" text-anchor="middle" font-size="10" font-weight="800" fill="${tcss(z.Tin)}">${fmt(z.Tin)}°C ${z.unmetFrac > 0.15 ? '✗' : '✓'}</text>`;
  const tank = `<rect x="6" y="56" width="52" height="38" rx="7" fill="#f2f6f8" stroke="#cdd8e1"/><text x="32" y="72" text-anchor="middle" font-size="10" font-weight="700" fill="#14202b">Tank</text><text x="32" y="86" text-anchor="middle" font-size="10" font-weight="800" fill="${tcss(r.T2)}">${fmt(r.T2)}°C</text>`;
  let g = tank;
  if (series) {
    const pos = [[86, 10], [262, 10], [262, 104], [86, 104]];
    const seg = (a, b, T) => `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}" stroke="${tcss(T)}" stroke-width="4" fill="none"/>`;
    g += seg([58, 75], [72, 75], r.T2) + seg([72, 75], [72, 27], r.T2) + seg([72, 27], [86, 27], r.T2);
    g += seg([164, 27], [262, 27], r.zones[1].Tin) + seg([300, 44], [300, 104], r.zones[2].Tin) + seg([262, 121], [164, 121], r.zones[3].Tin);
    pos.forEach(([x, y], i) => (g += box(x, y, r.zones[i], names[i])));
    g += `<text x="214" y="22" text-anchor="middle" font-size="9" fill="#8a97a3">→</text><text x="310" y="78" font-size="9" fill="#8a97a3">↓</text><text x="214" y="116" text-anchor="middle" font-size="9" fill="#8a97a3">←</text>
      <text x="185" y="74" text-anchor="middle" font-size="10.5" fill="#5b6976">water cools at</text><text x="185" y="88" text-anchor="middle" font-size="10.5" fill="#5b6976">every stop</text>`;
  } else {
    g += `<path d="M58 75 L76 75 M76 19 L76 131 M76 19 L92 19 M76 57 L92 57 M76 95 L92 95 M76 131 L92 131" fill="none" stroke="${tcss(r.T2)}" stroke-width="4"/>`;
    [0, 1, 2, 3].forEach(i => (g += box(92, 3 + i * 37, r.zones[i], names[i], 32)));
    g += `<text x="270" y="60" text-anchor="middle" font-size="10.5" fill="#5b6976">Every place gets the</text><text x="270" y="74" text-anchor="middle" font-size="10.5" fill="#5b6976">same warm water</text><text x="270" y="88" text-anchor="middle" font-size="10.5" fill="#5b6976">and its own valve.</text>`;
  }
  svg.innerHTML = g;
  const cold = r.zones.filter(z => z.unmetFrac > 0.15).map(z => z.short);
  $('#topoverdict').innerHTML = series ? `<b>One chain:</b> cheaper to build, but every stop cools the water. ${cold.length ? `<b style="color:#d2453a">Too cool for: ${cold.join(', ')}.</b>` : 'Everyone is warm, for now.'} And whatever one place does affects everyone after it.`
    : '<b>Own pipe each</b> (what the research note recommends): everyone gets the same warm water and their own valve, so the greenhouse turning up its heat doesn\'t upset a lab experiment.';
}
function renderChallenges() {
  const el = $('#chals'); if (!el) return;
  const r = R.now;
  el.innerHTML = CHALLENGES.map(c => {
    const ok = c.check(r, state.inp);
    if (ok && !state.done.has(c.id)) { state.done.add(c.id); toast(`Mission complete: ${c.title} 🎉`, 'good'); }
    return `<div class="chal ${ok ? 'done' : ''}"><div class="ct">${c.title}<span class="pill ${ok ? 'good' : state.done.has(c.id) ? 'warn' : 'off'}">${ok ? 'done ✓' : state.done.has(c.id) ? 'done before' : 'to do'}</span></div>
      <p>${c.goal}</p><button class="btn ghost sm" data-setup="${c.id}">Set the scene</button><div class="hint">Hint: ${c.hint}</div></div>`;
  }).join('');
  $$('[data-setup]').forEach(b => b.onclick = () => {
    const c = CHALLENGES.find(x => x.id === b.dataset.setup);
    Object.assign(state.inp, c.setup); recompute();
    state.lastWhy = [`Scene set: ${SEASONS[state.inp.season].label.toLowerCase()}, ${hhmm(state.inp.hour)}${state.inp.topology === 'series' ? ', one chained pipe' : ''}. Now use the controls below.`]; state.whySev = '';
    renderAudience();
  });
  const rem = $('#remember');
  if (rem) rem.innerHTML = state.done.size ? `<div class="sec">Remember</div><div class="blurb"><b>1.</b> Computers turn electricity into heat.<br><b>2.</b> Water carries that heat through pipes, and a heat exchanger keeps server water separate.<br><b>3.</b> Warm water suits labs, seeds, plants and radiators. Hot taps need a heat pump. Cold storage needs its own fridge.</div>` : '';
}

function refreshLive() {
  updateScene();
  if (state.mode === 'audience') {
    renderHappen(); renderAnalogy(R.now); renderLoopDiagram(); renderLadder(); renderRig(); renderFac(); renderTopo(); renderChallenges();
  } else renderExpert();
}

function renderAudience() {
  const st = STEPS[state.step];
  $('#a-eyebrow').textContent = `Step ${state.step + 1} of ${STEPS.length} · ${st.name}`;
  $('#a-title').textContent = st.title;
  $('#a-lede').innerHTML = st.lede;
  const box = $('#a-controls');
  box.innerHTML = st.controls() + `<div id="happen" class="happen"></div>`;
  bindControls(box);
  $$('[data-stop]').forEach(el => el.onclick = () => goStop(+el.dataset.stop));
  const ns = $('#nextStop'); if (ns) ns.onclick = () => goStop((state.stop + 1) % PIPE_STOPS.length);
  $$('[data-fac]').forEach(el => el.onclick = () => { state.fac = el.dataset.fac; const u = USES[state.fac]; flyTo(u.cam); setFocus(u.focus); $$('[data-fac]').forEach(b => b.classList.toggle('on', b === el)); renderFac(); });
  const ra = $('#resetAll'); if (ra) ra.onclick = () => { state.inp = { ...DEFAULTS }; state.lastWhy = []; state.whySev = ''; recompute(); renderAudience(); };
  $('#segs').innerHTML = STEPS.map((s, i) => `<button data-i="${i}" class="${i < state.step ? 'done' : i === state.step ? 'now' : ''}"><i></i><span>${i + 1}. ${s.name}</span></button>`).join('');
  $$('#segs button').forEach(b => b.onclick = () => goStep(+b.dataset.i));
  $('#a-prev').disabled = state.step === 0;
  $('#a-next').textContent = state.step === STEPS.length - 1 ? 'Expert view →' : 'Next →';
  refreshLive();
}
function goStop(i) {
  state.stop = i; const s = PIPE_STOPS[i]; flyTo(s.cam); setFocus(s.focus);
  const box = $('#a-controls'); const keepWhy = state.lastWhy;
  renderAudience(); state.lastWhy = keepWhy; renderHappen(); void box;
}
function goStep(i) {
  state.step = clamp(i, 0, STEPS.length - 1); state.maxStep = Math.max(state.maxStep, state.step);
  const st = STEPS[state.step];
  state.lastWhy = []; state.whySev = '';
  if (state.step === 2) { state.stop = 0; flyTo(PIPE_STOPS[0].cam); setFocus(PIPE_STOPS[0].focus); }
  else if (state.step === 5) { const u = USES[state.fac]; flyTo(u.cam); setFocus(u.focus); }
  else { flyTo(st.cam); setFocus(st.focus); }
  renderAudience();
  history.replaceState(null, '', '#step' + (state.step + 1));
}
$('#a-next').onclick = () => (state.step === STEPS.length - 1 ? setMode('expert') : goStep(state.step + 1));
$('#a-prev').onclick = () => goStep(state.step - 1);

let toastQ = [];
function toast(msg, sev = 'good') {
  const el = document.createElement('div'); el.className = 'toast ' + sev; el.textContent = msg; $('#toasts').appendChild(el); toastQ.push(el);
  while (toastQ.length > 2) toastQ.shift().remove();
  setTimeout(() => { el.remove(); toastQ = toastQ.filter(x => x !== el); }, 3200);
}

/* ═════════════════════════ EXPERT MODE ═════════════════════════ */
const XCAMS = [['auto', 'Auto fit'], ['iso', 'Isometric'], ['front', 'Front cutaway'], ['walk', 'Walkthrough'], ['gh', 'Greenhouse'], ['b2', 'B2 / underground'], ['valves', 'Branch valves'], ['rig', 'Lab test rig']];
const XINPUTS = [['itDesign', 'IT design power', 'kW', 1], ['load', 'GPU load', 'frac', 0.01], ['capture', 'Liquid capture', 'frac', 0.01], ['pump', 'Primary pump speed', 'frac', 0.01], ['supply', 'Primary supply', '°C', 0.5],
  ['hxRating', 'HX rating', 'kW', 10], ['hpRating', 'Heat-pump rating', 'kW', 10], ['tankCap', 'Buffer tank', 'kWh', 50], ['labSet', 'Lab rig setpoint', '°C', 0.5]];
function buildExpertStatic() {
  $('#x-cams').innerHTML = XCAMS.map(([k, n]) => `<button class="xbtn" data-xcam="${k}">${n}</button>`).join('');
  $$('[data-xcam]').forEach(b => b.onclick = () => { state.focusFloor = null; setFocus(null); flyTo(b.dataset.xcam); markX(); });
  $('#x-cut').onclick = () => { state.cutaway = !state.cutaway; applyCutaway(); markX(); };
  $('#x-floors').innerHTML = [...FLOORS].reverse().map(f => `<div class="xfloor"><span class="dot" data-fvis="${f.key}" title="show / hide"></span><span class="nm">${f.name}</span><button class="xbtn" data-ffocus="${f.key}">Focus</button></div>`).join('');
  $$('[data-fvis]').forEach(d => d.onclick = () => { const k = d.dataset.fvis; state.hidden.has(k) ? state.hidden.delete(k) : state.hidden.add(k); applyCutaway(); markX(); });
  $$('[data-ffocus]').forEach(b => b.onclick = () => { const k = b.dataset.ffocus; if (state.focusFloor === k) { state.focusFloor = null; setFocus(null); flyTo('auto'); } else { state.focusFloor = k; setFocus([k, ...PIPE_DEFS.map(d => 'pipe:' + d.id)]); flyTo(k); } markX(); });
  $('#x-views').innerHTML = [['physical', 'Physical'], ['temperature', 'Temperature'], ['flow', 'Flow']].map(([k, n]) => `<button class="xbtn" data-hydro="${k}">${n}</button>`).join('');
  $$('[data-hydro]').forEach(b => b.onclick = () => { state.hydro = b.dataset.hydro; updateScene(); markX(); });
  $('#x-scn').innerHTML = `<option value="">Custom</option>` + Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  $('#x-scn').onchange = e => { const s = SCENARIOS[e.target.value]; if (s) { state.expertDraft = { ...state.inp, ...s.set }; buildExpertInputs(); } };
  $('#x-run').onclick = () => { if (state.expertDraft) state.inp = { ...state.expertDraft }; state.expertDraft = null; recompute(); buildExpertInputs(); refreshLive(); };
  $('#x-play').onclick = () => { state.playing = !state.playing; $('#x-play').textContent = state.playing ? 'Pause' : 'Play'; };
  $('#x-hour').oninput = e => { state.inp.hour = +e.target.value; recompute(); refreshLive(); };
  // plain-English helpers under each left-panel title
  const helps = ['Where the 3D camera looks.', 'Show, hide or zoom to a single floor.', 'Colour pipes by circuit, by water temperature, or by how much water flows.', 'Change the engineering inputs, then press Run. "frac" means a fraction: 0.8 = 80%.'];
  $$('#x-left .xbox h4').forEach((h, i) => h.insertAdjacentHTML('afterend', `<div class="xhelp">${helps[i] || ''}</div>`));
}
function buildExpertInputs() {
  const D = state.expertDraft || state.inp;
  $('#x-inputs').innerHTML = XINPUTS.map(([k, n, u, st]) => `<div class="xrow"><span>${n}</span><span><input class="xin" type="number" step="${st}" data-xin="${k}" value="${D[k]}"> <span style="color:#7f97ab">${u}</span></span></div>`).join('') +
    `<div class="xrow"><span>Season</span><select class="xin" style="width:120px;margin:0" id="x-season">${Object.entries(SEASONS).map(([k, s]) => `<option value="${k}" ${D.season === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>` +
    `<div class="xrow"><span>Network topology</span><select class="xin" style="width:120px;margin:0" id="x-topo"><option value="parallel" ${D.topology === 'parallel' ? 'selected' : ''}>Parallel branches</option><option value="series" ${D.topology === 'series' ? 'selected' : ''}>Series cascade</option></select></div>` +
    [['heatPump', 'Heat pump (DHW 60°C)'], ['dryCooler', 'Aux rejection (dry cooler)'], ['labControl', 'Lab rig thermostatic valve']].map(([k, n]) => `<label class="xchk"><span>${n}</span><input type="checkbox" data-xchk="${k}" ${D[k] ? 'checked' : ''}></label>`).join('') +
    (state.expertDraft ? '<div style="color:#e0a63a;margin-top:6px">Inputs modified. Run to apply.</div>' : '');
  const draft = () => (state.expertDraft ||= { ...state.inp });
  $$('[data-xin]').forEach(i => i.onchange = () => { const v = parseFloat(i.value); if (isFinite(v)) { draft()[i.dataset.xin] = v; $('#x-scn').value = ''; buildExpertInputs(); } });
  $$('[data-xchk]').forEach(i => i.onchange = () => { draft()[i.dataset.xchk] = i.checked; buildExpertInputs(); });
  $('#x-season').onchange = e => { draft().season = e.target.value; buildExpertInputs(); };
  $('#x-topo').onchange = e => { draft().topology = e.target.value; buildExpertInputs(); };
}
function markX() {
  $$('[data-xcam]').forEach(b => b.classList.toggle('on', b.dataset.xcam === state.look));
  $('#x-cut').textContent = state.cutaway ? 'Enabled' : 'Disabled'; $('#x-cut').classList.toggle('on', state.cutaway);
  $$('[data-fvis]').forEach(d => (d.style.background = state.hidden.has(d.dataset.fvis) ? '#44515e' : '#2fd18b'));
  $$('[data-ffocus]').forEach(b => b.classList.toggle('on', b.dataset.ffocus === state.focusFloor));
  $$('[data-hydro]').forEach(b => b.classList.toggle('on', b.dataset.hydro === state.hydro));
}
function xsvg(series, lines, maxV, unit) {
  const W = 290, H = 110, X = h => 4 + h / 23 * (W - 8), Y = v => H - 12 - clamp(v / maxV, 0, 1.05) * (H - 22);
  return `<svg class="xsvg" viewBox="0 0 ${W} ${H}">${lines.map(([g, c]) => `<path d="${series.map((q, h) => `${h ? 'L' : 'M'}${X(h).toFixed(1)} ${Y(g(q)).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.8"/>`).join('')}
    <line x1="${X(state.inp.hour)}" x2="${X(state.inp.hour)}" y1="4" y2="${H - 12}" stroke="#fff" opacity=".35"/><text x="${W - 4}" y="${H - 2}" text-anchor="end">${fmt(maxV)} ${unit} max</text></svg>`;
}
const xh = t => `<div class="xhelp">${t}</div>`;
function renderExpert() {
  const r = R.now, s = R.series, day = R.day;
  const pass = x => (x < 1e-6 ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>');
  $('#x-right').innerHTML = `
  <div class="xbox"><h4>Heat recovery now · ${hhmm(state.inp.hour)}</h4>${xh('How much heat the computers make, how much the water catches, and how much reaches the four facilities.')}<div class="xtiles">
    <div class="xtile"><span>IT heat</span><b>${fmt(r.IT, 1)} kW</b></div><div class="xtile"><span>Liquid captured</span><b>${fmt(r.captured, 1)} kW</b></div>
    <div class="xtile"><span>HX transfer</span><b>${fmt(r.hx, 1)} kW</b></div><div class="xtile green"><span>Delivered (4 zones + taps)</span><b>${fmt(r.usefulHeat, 1)} kW</b></div></div>
    <div style="font-weight:600;margin:4px 0 2px">Where undelivered thermal energy goes</div>${xh('Heat that does not reach a facility. Ideally small, except heat nobody needs.')}
    ${[['Air-side IT heat (room air)', r.air], ['Primary pipe loss', r.pipeLoss], ['Rejected by roof dry cooler', r.rejected], ['Distribution loss', r.distLoss], ['Unrejected / cooling shortfall', r.unrejected], ['Stored in buffer tank', r.charge], ['Backup heater (unmet demand)', r.backup]].map(([n, v]) => `<div class="xrow"><span>${n}</span><b>${fmt(v, 1)} kW</b></div>`).join('')}</div>
  <div class="xbox"><h4>Hydronic operating point</h4>${xh('How fast water moves (kg/s ≈ litres per second) and how much electricity the pumps, heat pump and chiller use.')}
    ${[['Primary flow', `${fmt(r.m, 2)} kg/s`], ['Primary supply / return', `${fmt(r.Ts, 1)} / ${fmt(r.Tr, 1)} °C`], ['Secondary supply (after HX)', `${fmt(r.T2, 1)} °C`], ['Secondary flow', `${fmt(r.secFlow, 2)} kg/s`], ['Topology', r.zones && state.inp.topology === 'series' ? 'Series cascade' : 'Parallel branches'],
      ['Pump electricity', `${fmt(r.pumpElec, 1)} kW`], ['Heat-pump electricity (COP)', `${fmt(r.hpElec, 1)} kW${r.cond > 0 ? ` (${fmt(r.COP, 2)})` : ''}`], ['Chiller electricity', `${fmt(r.chillerElec, 1)} kW`], ['Seed-vault refrigeration', `${fmt(VAULT_FRIDGE_KW, 1)} kW`], ['Hottest chip', `${fmt(r.chip, 1)} °C`]]
      .map(([n, v]) => `<div class="xrow"><span>${n}</span><b>${v}</b></div>`).join('')}</div>
  <div class="xbox"><h4>Zone thermal delivery</h4>${xh('Per facility: water temperature arriving, how open its valve is, heat wanted vs delivered (kW). Red = backup heater needed.')}
    <table class="xtable"><tr><th>Zone</th><th>T in</th><th>Valve</th><th>Demand</th><th>Deliv.</th></tr>
    ${r.zones.map(z => `<tr><td>${z.short}</td><td>${fmt(z.Tin, 1)}°</td><td>${fmt(z.valve * 100)}%</td><td>${fmt(z.demand, 1)}</td><td style="color:${z.unmetFrac > 0.02 ? '#ff6b5e' : '#3ddc97'}">${fmt(z.delivered, 1)}</td></tr>`).join('')}
    <tr><td>Hot taps (HP)</td><td>${r.taps.Tin ? fmt(r.taps.Tin, 1) + '°' : '—'}</td><td>—</td><td>${fmt(r.taps.demand, 1)}</td><td style="color:${r.taps.unmetFrac > 0.02 ? '#ff6b5e' : '#3ddc97'}">${fmt(r.taps.delivered, 1)}</td></tr>
    <tr><td>Seed vault</td><td colspan="4" style="text-align:left;color:#7f97ab">independent refrigeration, not heated</td></tr></table>
    <div class="xrow" style="margin-top:6px"><span>Lab rig: setpoint / swing</span><b>${fmt(r.lab.set, 1)}°C / ±${fmt(r.lab.swing / 2, 2)}°C ${r.lab.valid ? '<span class="pass">VALID</span>' : `<span class="fail">${r.lab.reason.toUpperCase()}</span>`}</b></div></div>
  <div class="xbox"><h4>Energy balance · power over time</h4>${xh('A whole day, hour by hour. The white line is the current time.')}${xsvg(s, [[q => q.IT, '#9aa9b8'], [q => q.captured, '#ff8a3d'], [q => q.usefulHeat, '#3ddc97'], [q => q.rejected, '#ff3b3b']], Math.max(...s.map(q => q.IT)) * 1.05, 'kW')}
    <div class="xleg"><span><i style="background:#9aa9b8"></i>IT</span><span><i style="background:#ff8a3d"></i>Captured</span><span><i style="background:#3ddc97"></i>Delivered</span><span><i style="background:#ff3b3b"></i>Rejected</span></div></div>
  <div class="xbox"><h4>Calculated water temperatures</h4>${xsvg(s, [[q => q.Ts, '#2f7bff'], [q => q.Tr, '#ff3b3b'], [q => q.T2, '#ff8a3d'], [q => q.Tret, '#22c3d6']], 70, '°C')}
    <div class="xleg"><span><i style="background:#2f7bff"></i>Primary supply</span><span><i style="background:#ff3b3b"></i>Primary return</span><span><i style="background:#ff8a3d"></i>Heating supply</span><span><i style="background:#22c3d6"></i>Heating return</span></div></div>
  <div class="xbox"><h4>Conservation checks (24 h)</h4>${xh('Checks that no energy appears or disappears in the model. PASS = the books balance.')}
    <div class="xrow"><span>Primary balance · max residual</span><b>${day.maxPrimaryResidual.toExponential(1)} kW ${pass(day.maxPrimaryResidual)}</b></div>
    <div class="xrow"><span>Secondary + storage · max residual</span><b>${day.maxSecondaryResidual.toExponential(1)} kW ${pass(day.maxSecondaryResidual)}</b></div>
    <div class="xrow"><span>Day: IT / delivered / rejected</span><b>${fmt(day.IT / 1000, 1)} / ${fmt(day.delivered / 1000, 1)} / ${fmt(day.rejected / 1000, 1)} MWh</b></div>
    <div style="display:flex;gap:6px;margin-top:8px"><button class="xbtn" id="x-json">Export JSON</button><button class="xbtn" id="x-csv">Export CSV</button></div></div>`;
  $('#x-json').onclick = () => download('thermalloop_run.json', JSON.stringify({ inputs: state.inp, is_measured_data: false, series: s.map(q => ({ h: q.h, IT_kW: q.IT, captured_kW: q.captured, delivered_kW: q.usefulHeat, backup_kW: q.backup, Ts: q.Ts, Tr: q.Tr, T2: q.T2, chip: q.chip, tank_frac: q.tankFrac, zones: q.zones.map(z => ({ id: z.id, T_in: z.Tin, valve: z.valve, demand_kW: z.demand, delivered_kW: z.delivered })) })), day }, null, 1), 'application/json');
  $('#x-csv').onclick = () => download('thermalloop_run.csv', ['hour,IT_kW,captured_kW,hx_kW,delivered_kW,rejected_kW,backup_kW,Ts_C,Tr_C,T2_C,chip_C,tank_frac', ...s.map(q => [q.h, q.IT, q.captured, q.hx, q.usefulHeat, q.rejected, q.backup, q.Ts, q.Tr, q.T2, q.chip, q.tankFrac].map(v => (+v).toFixed(3)).join(','))].join('\n'), 'text/csv');
  $('#x-hour').value = state.inp.hour; $('#x-t').textContent = `t = ${state.inp.hour.toFixed(1)} h`;
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

/* ═════════════════════════ mode switching ═════════════════════════ */
function setMode(m) {
  state.mode = m; state.playing = false;
  document.body.className = 'mode-' + m;
  $$('.modesw button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#brand-sub').textContent = m === 'audience' ? 'Audience Mode · guided tour' : 'Expert Mode · engineering view';
  if (m === 'expert') { setFocus(null); state.expertDraft = null; buildExpertInputs(); markX(); flyTo('auto'); refreshLive(); }
  else { state.hidden.clear(); applyCutaway(); goStep(state.step); }
}
$$('.modesw button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
function recompute() { R = simulate(state.inp); }

/* click a floor / part to fly there */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const b = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(clickables.filter(m => m.visible && m.parent && m.parent.visible), false)[0];
  if (hit && hit.object.userData.look) { lookAt(hit.object.userData.look); if (state.mode === 'expert') markX(); }
});
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); labelRenderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
addEventListener('keydown', e => { if (state.mode !== 'audience' || /INPUT|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowRight' && state.step < STEPS.length - 1) goStep(state.step + 1); if (e.key === 'ArrowLeft' && state.step > 0) goStep(state.step - 1); });

/* ═════════════════════════ render loop ═════════════════════════ */
const clock = new THREE.Clock(); const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
let tankTarget = 0.5, tankNow = 0.5, plumeLevel = 0, night = 0, nightTarget = 0, playAcc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (tween) { tween.t = Math.min(1, tween.t + dt / 1.4); const k = ease(tween.t); camera.position.lerpVectors(tween.fp, tween.tp, k); controls.target.lerpVectors(tween.ft, tween.tt, k); if (tween.t >= 1) tween = null; }
  controls.update();
  if (state.playing) { playAcc += dt; if (playAcc > 0.12) { playAcc = 0; state.inp.hour = (state.inp.hour + 0.25) % 24; recompute(); refreshLive(); } }
  for (const k in groups) { const G = groups[k]; for (const m of G.mats) { const target = (m.userData.base ?? 1) * G.dim; m.opacity += (target - m.opacity) * Math.min(1, dt * 6); } }
  for (const p of pipes) {
    if (!p.inst.visible) continue;
    p.off = (p.off + dt * p.speed / p.len) % 1;
    for (let i = 0; i < p.count; i++) { p.path.getPointAt((i / p.count + p.off) % 1, tmpV); tmpM.makeTranslation(tmpV.x, tmpV.y, tmpV.z); p.inst.setMatrixAt(i, tmpM); }
    p.inst.instanceMatrix.needsUpdate = true;
  }
  racks.forEach((rk, i) => { const f = 0.55 + 0.45 * Math.abs(Math.sin(t * (2 + (i % 5)) + i)); const blink = rk.hot ? (Math.sin(t * 10) > 0 ? 1.6 : 0.15) : 1; rk.leds.forEach(m => (m.emissiveIntensity = f * blink * (0.4 + state.inp.load))); });
  pumps.forEach(p => (p.rotation.x += dt * 14 * state.inp.pump));
  const rej = R.now.rejected > 0.5; fans.forEach((f, i) => (f.rotation.y += dt * (rej ? 6 + 10 * plumeLevel : 0.3) * (i % 2 ? -1 : 1)));
  hpComp.scale.setScalar(R.now.cond > 0.5 ? 1 + 0.05 * Math.sin(t * 16) : 1);
  robots.forEach(rb => { rb.pivot.rotation.y = Math.sin(t * 0.6 + rb.phase) * 1.1; rb.elbow.rotation.z = -0.6 + Math.sin(t * 0.9 + rb.phase) * 0.45; });
  tankNow += (tankTarget - tankNow) * Math.min(1, dt * 2.5);
  const lh = Math.max(0.05, tankNow * 4.1); tankLevel.scale.y = lh; tankLevel.position.y = -8.4 + lh / 2;
  plume.forEach((p, i) => {
    const life = (t * 0.25 + p.userData.seed) % 1;
    p.position.set(6 + (i % 3) * 2 + Math.sin(life * 6 + i) * 0.6, 20 + life * 9 * (0.5 + plumeLevel), -6 + Math.cos(life * 5 + i) * 0.8);
    p.scale.setScalar(0.6 + life * 2.4 * (0.4 + plumeLevel)); p.material.opacity = plumeLevel * 0.35 * (1 - life);
  });
  night += (nightTarget - night) * Math.min(1, dt * 2);
  const base = new THREE.Color(state.mode === 'audience' ? '#c7d6e4' : '#b9c6d3');
  scene.background.copy(base).lerp(SKY_NIGHT, night * 0.8); scene.fog.color.copy(scene.background);
  sun.intensity = 2.2 * (1 - night * 0.8); hemi.intensity = 1.0 * (1 - night * 0.55);
  renderer.render(scene, camera); labelRenderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ═════════════════════════ boot ═════════════════════════ */
buildExpertStatic();
applyCutaway();
resize();
const m = location.hash.match(/step(\d)/);
goStep(m ? +m[1] - 1 : 0);
frame();
