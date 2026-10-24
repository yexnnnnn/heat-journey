// ThermalLoop AI Center: Audience Mode + Expert Mode prototype.
// Both modes drive the same simulate() model and the same 3D facility.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { DEFAULTS, SEASONS, ZONES, LIMITS, CHALLENGES, SCENARIOS, simulate, evaluateTriggers, ambient, clamp } from './sim.js';
window.__READY = true;

/* ═════════════════════════ state ═════════════════════════ */
const state = {
  mode: 'audience', step: 0, maxStep: 0,
  inp: { ...DEFAULTS },
  expertDraft: null,              // expert inputs are applied on "Run"
  look: 'auto', cutaway: true, hydro: 'temperature', hidden: new Set(), focusFloor: null,
  baseline: null, lastCtl: null, lastCtlAt: 0, lastWhy: [],
  activeTrig: new Set(), done: new Set(), planA: null, playing: false,
};
let R = simulate(state.inp);       // { now, series, day }
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
const SKY_DAY = new THREE.Color('#c7d6e4'), SKY_NIGHT = new THREE.Color('#1a2638');
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(scene.background.clone(), 120, 260);
const camera = new THREE.PerspectiveCamera(42, 1, 0.3, 600);
camera.position.set(62, 40, 74);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(14, 2, 0);
controls.maxDistance = 220; controls.minDistance = 4;

const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x3a4030, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2); sun.position.set(-40, 70, 45); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 60, bottom: -40, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004; scene.add(sun);
const plantLamp = new THREE.PointLight(0xfff0d8, 60, 40, 1.6); plantLamp.position.set(0, -4.8, 4); scene.add(plantLamp);
const labLamp = new THREE.PointLight(0xffffff, 30, 30, 1.6); labLamp.position.set(0, 3.8, 3); scene.add(labLamp);

/* temperature ramp 15°C → 65°C */
const RAMP = [[15, '#2f7bff'], [28, '#22c3d6'], [40, '#f2c14e'], [52, '#ff8a3d'], [65, '#ff3b3b']].map(([t, c]) => [t, new THREE.Color(c)]);
function tcol(t) {
  if (t <= RAMP[0][0]) return RAMP[0][1].clone();
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i]; return ca.clone().lerp(cb, (t - a) / (b - a)); }
  return RAMP[RAMP.length - 1][1].clone();
}

/* registry: group key → meshes (for focus/dim and visibility) */
const groups = {};
function grp(key) { if (!groups[key]) { const g = new THREE.Group(); g.name = key; scene.add(g); groups[key] = { g, mats: [], dim: 1 }; } return groups[key]; }
function mat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.05, transparent: true, opacity: o.opacity ?? 1,
    emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 1, depthWrite: o.depthWrite ?? true, side: o.side ?? THREE.FrontSide });
  m.userData.base = m.opacity; return m;
}
function add(key, geo, m, pos, o = {}) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); if (o.rot) mesh.rotation.set(...o.rot); if (o.scale) mesh.scale.set(...o.scale);
  mesh.castShadow = o.shadow ?? true; mesh.receiveShadow = true;
  if (o.look) { mesh.userData.look = o.look; clickables.push(mesh); }
  const G = grp(key); G.g.add(mesh); G.mats.push(m); return mesh;
}
const clickables = [];
const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/* ═════════════════════════ facility geometry (ThermalLoop dimensions, metres) ═════════════════════════ */
const FLOORS = [
  { key: 'b2', name: 'B2 · Mechanical Plant', y: -8.5, h: 4.5 },
  { key: 'b1', name: 'B1 · Seed Research', y: -4, h: 4 },
  { key: 'gf', name: 'GF · Robot Lab', y: 0, h: 4.5 },
  { key: 'f1', name: '1F · GPU Hall', y: 4.5, h: 4.5 },
  { key: 'f2', name: '2F · GPU Hall', y: 9, h: 4.5 },
  { key: 'f3', name: '3F · GPU Hall', y: 13.5, h: 4.5 },
];
const FY = Object.fromEntries(FLOORS.map(f => [f.key, f.y]));

// ground, cut into pieces around the footprint so the basement can be seen in section
const grass = mat('#5f6b45', { rough: 1 }), soil = mat('#4a3c2c', { rough: 1 }), soilDeep = mat('#3a2f23', { rough: 1 });
add('ground', BX(160, 0.6, 50), grass, [5, -0.3, -36]);            // north
add('ground', BX(62, 0.6, 22), grass, [-49, -0.3, 0]);             // west
add('ground', BX(80, 0.6, 22), grass, [58, -0.3, 0]);              // east
const southGround = add('cutfront', BX(160, 0.6, 50), grass, [5, -0.3, 36]);
add('ground', BX(62, 9.4, 0.4), soil, [-49, -5.3, 10.8], { shadow: false });   // section faces
add('ground', BX(80, 9.4, 0.4), soil, [58, -5.3, 10.8], { shadow: false });
add('ground', BX(36, 1.2, 22), soilDeep, [0, -9.1, 0]);
add('ground', BX(160, 9.4, 0.4), soil, [5, -5.3, -11.2], { shadow: false });
// site paths
add('ground', BX(8, 0.62, 30), mat('#7d7a6f', { rough: 1 }), [22, -0.29, 26], { shadow: false });
add('ground', BX(40, 0.62, 3), mat('#7d7a6f', { rough: 1 }), [10, -0.29, 13], { shadow: false });

// structure: slabs, columns, facades
const slabM = () => mat('#8c96a1', { rough: 0.8 });
for (const f of FLOORS) add(f.key, BX(36, 0.3, 22), slabM(), [0, f.y + 0.15, 0], { look: f.key });
add('roof', BX(36, 0.35, 22), mat('#7e8892'), [0, 18.15, 0], { look: 'roof' });
const steel = mat('#2c3540', { metal: 0.6, rough: 0.4 });
for (const x of [-18, -6, 6, 18]) for (const z of [-11, 11]) add('shell', BX(0.4, 26.5, 0.4), steel, [x, 4.75, z]);
const glassM = mat('#9fc3d8', { opacity: 0.16, rough: 0.05, metal: 0.2, depthWrite: false, side: THREE.DoubleSide });
add('shell', BX(36, 18, 0.06), glassM, [0, 9, -11], { shadow: false });
add('shell', BX(0.06, 18, 22), glassM, [-18, 9, 0], { shadow: false });
add('shell', BX(0.06, 18, 22), glassM, [18, 9, 0], { shadow: false });
const frontGlass = add('cutfront', BX(36, 18, 0.06), mat('#9fc3d8', { opacity: 0.22, rough: 0.05, metal: 0.2, depthWrite: false, side: THREE.DoubleSide }), [0, 9, 11], { shadow: false });
const concrete = mat('#6f747a', { rough: 0.95 });
add('shell', BX(36, 8.5, 0.3), concrete, [0, -4.25, -11]);
add('shell', BX(0.3, 8.5, 22), concrete, [-18, -4.25, 0]);
add('shell', BX(0.3, 8.5, 22), concrete, [18, -4.25, 0]);
add('cutfront', BX(36, 8.5, 0.3), concrete, [0, -4.25, 11]);
for (const f of FLOORS.slice(2)) add('shell', BX(36, 0.08, 0.08), steel, [0, f.y + f.h, 11]);   // mullions

// GPU halls: 12 racks per floor, 2 rows × 6
const racks = [];  // { floorIndex, leds:[mat], body }
['f1', 'f2', 'f3'].forEach((k, fi) => {
  const y = FY[k];
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const x = -10 + i * 3.6, z = row ? 2.6 : -2.6;
    const body = add(k, BX(1.3, 2.5, 1.5), mat('#1b2129', { metal: 0.5, rough: 0.35 }), [x, y + 1.55, z], { look: k });
    const leds = [];
    for (let s = 0; s < 5; s++) {
      const lm = mat('#333', { emissive: '#000', rough: 0.3 });
      add(k, BX(1.0, 0.12, 0.04), lm, [x, y + 0.75 + s * 0.42, z + (row ? 0.77 : -0.77)], { shadow: false });
      leds.push(lm);
    }
    racks.push({ fi, leds, body });
  }
  // CDU / row cooling units at each end
  add(k, BX(1.6, 2.4, 1.2), mat('#cfd6dd', { metal: 0.3 }), [13.5, y + 1.5, -2.6]);
  add(k, BX(1.6, 2.4, 1.2), mat('#cfd6dd', { metal: 0.3 }), [13.5, y + 1.5, 2.6]);
});

// GF robot lab
const robots = [];
for (const x of [-9, 0, 9]) {
  const base = add('gf', new THREE.CylinderGeometry(0.9, 1.1, 0.5, 24), mat('#20262c'), [x, 0.55, 3], { look: 'gf' });
  const pivot = new THREE.Group(); pivot.position.set(x, 0.8, 3); grp('gf').g.add(pivot);
  const lowerM = mat('#e89b22', { metal: 0.3, rough: 0.4 });
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.2, 16), lowerM); lower.position.y = 1.1; lower.castShadow = true;
  const elbow = new THREE.Group(); elbow.position.y = 2.2;
  const jointM = mat('#15191d');
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), jointM);
  const upperM = mat('#e89b22', { metal: 0.3, rough: 0.4 });
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.7, 16), upperM); upper.position.y = 0.85;
  elbow.add(joint, upper); pivot.add(lower, elbow); grp('gf').mats.push(lowerM, jointM, upperM);
  robots.push({ pivot, lower, elbow, phase: x });
  add('gf', BX(3.2, 0.9, 1.4), mat('#3d5f8a'), [x + 3, 0.75, 6.5]);
}
add('gf', BX(12, 1, 1.4), mat('#5b6670'), [-6, 0.8, -8.5]);

// B1 seed research
add('b1', BX(6, 3, 4), mat('#bcd7ee', { metal: 0.2 }), [-11, -2.4, -6], { look: 'b1' });           // cold storage
for (let i = 0; i < 4; i++) add('b1', BX(2.2, 2.6, 2), mat('#e8eef2', { metal: 0.2 }), [-2 + i * 3, -2.6, -6.5], { look: 'b1' });   // test chambers
for (let i = 0; i < 4; i++) add('b1', BX(2.0, 0.08, 1.6), mat('#7ec26b', { emissive: '#3e7f2d', ei: 0.25 }), [-2 + i * 3, -1.6, 4]);
for (let i = 0; i < 4; i++) add('b1', BX(2.2, 1.2, 1.8), mat('#5b6670'), [-2 + i * 3, -3.4, 4]);

// B2 mechanical plant
const hxBody = add('b2', BX(2, 2.2, 1.6), mat('#9aa6b2', { metal: 0.6, rough: 0.3 }), [-4, -7.2, -6.4], { look: 'b2' });
const hxPlates = [];
for (let i = 0; i < 6; i++) { const m = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.25 }); add('b2', BX(0.12, 1.8, 1.65), m, [-4.75 + i * 0.3, -7.2, -6.4], { shadow: false }); hxPlates.push(m); }
const pumps = [];
for (const z of [-6.8, -3.6]) {
  add('b2', new THREE.CylinderGeometry(0.55, 0.55, 1.0, 20), mat('#3e7cc4', { metal: 0.4 }), [-10, -7.7, z], { rot: [0, 0, Math.PI / 2], look: 'b2' });
  const imp = add('b2', BX(0.1, 0.9, 0.18), mat('#0e2c52'), [-9.45, -7.7, z], { shadow: false }); pumps.push(imp);
}
const hpBody = add('b2', BX(2.8, 2.3, 1.9), mat('#6b7580', { metal: 0.4 }), [2, -7.3, -2.2], { look: 'b2' });
const hpCompMat = mat('#555', { emissive: '#000' });
const hpComp = add('b2', new THREE.SphereGeometry(0.55, 20, 14), hpCompMat, [1.4, -7.3, -1.15]);
const tankShell = add('b2', new THREE.CylinderGeometry(1.35, 1.35, 4.3, 28), mat('#c2c9cf', { opacity: 0.38, metal: 0.4, depthWrite: false }), [8, -6.3, -6], { look: 'b2', shadow: false });
const tankLevelMat = mat('#f2c14e', { emissive: '#f2c14e', ei: 0.3 });
const tankLevel = add('b2', new THREE.CylinderGeometry(1.25, 1.25, 1, 28), tankLevelMat, [8, -7.6, -6], { shadow: false });
add('b2', new THREE.CylinderGeometry(0.6, 0.6, 1.8, 20), mat('#88a0b0', { metal: 0.4 }), [12.5, -7.5, -6]);       // tank_verify_001
add('b2', BX(3, 1.4, 1.2), mat('#5a6168'), [-13, -7.6, 4]);

// roof: dry cooler + chiller
add('roof', BX(6, 1.2, 3), mat('#aeb6be', { metal: 0.4 }), [8, 18.95, -6], { look: 'roof' });
const fans = [];
for (let i = 0; i < 3; i++) fans.push(add('roof', BX(1.5, 0.08, 0.22), mat('#2a3038'), [6 + i * 2, 19.6, -6], { shadow: false }));
add('roof', BX(3.2, 1.5, 2.2), mat('#c8ced4', { metal: 0.3 }), [-7, 19.1, -6], { look: 'roof' });
const chillerLampMat = mat('#2a2', { emissive: '#1f9d63', ei: 0.6 });
add('roof', new THREE.SphereGeometry(0.22, 12, 10), chillerLampMat, [-7, 20.05, -4.85], { shadow: false });
// steam plume from the dry cooler (shows heat thrown away)
const plume = [];
const plumeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.0, depthWrite: false });
for (let i = 0; i < 26; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), plumeMat.clone()); p.userData.seed = Math.random(); scene.add(p); plume.push(p); }

// greenhouse: 30 × 18 × 5 m at (41, 0, 0)
const GHX = 41;
const hoopM = mat('#e7edf2', { metal: 0.5, rough: 0.3 });
for (let i = 0; i <= 10; i++) add('gh', new THREE.TorusGeometry(9, 0.09, 6, 36, Math.PI), hoopM, [26 + i * 3, 0, 0], { rot: [0, Math.PI / 2, 0], scale: [1, 5 / 9, 1], shadow: false });
const ghGlassMat = mat('#d6ecf2', { opacity: 0.16, rough: 0.05, depthWrite: false, side: THREE.DoubleSide });
add('gh', new THREE.CylinderGeometry(9, 9, 30, 36, 1, true, 0, Math.PI), ghGlassMat, [GHX, 0, 0], { rot: [0, 0, Math.PI / 2], scale: [5 / 9, 1, 1], shadow: false, look: 'gh' });
const bedMats = [];
for (const z of [-6, -2, 2, 6]) { const m = mat('#5a3d27', { rough: 1 }); add('gh', BX(27, 0.4, 2.4), m, [GHX, 0.2, z], { look: 'gh' }); bedMats.push(m); }
const plantGeo = new THREE.SphereGeometry(0.32, 10, 8);
const plantMat = new THREE.MeshStandardMaterial({ color: '#5fbf4a', roughness: 0.8, transparent: true });
plantMat.userData.base = 1;
const plantCount = 4 * 26;
const plants = new THREE.InstancedMesh(plantGeo, plantMat, plantCount);
{ const m = new THREE.Matrix4(); let k = 0;
  for (const z of [-6, -2, 2, 6]) for (let i = 0; i < 26; i++) { const s = 0.8 + ((i * 7 + z * 3) % 5) * 0.1; m.compose(new THREE.Vector3(28 + i * 1.05, 0.7, z + ((i % 2) ? 0.45 : -0.45)), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.3, s)); plants.setMatrixAt(k++, m); } }
plants.castShadow = true; grp('gh').g.add(plants); grp('gh').mats.push(plantMat);

// underground corridor to the greenhouse
add('corridor', BX(10, 2.4, 2.6), mat('#6f747a', { opacity: 0.5, depthWrite: false }), [22.5, -1.9, -5], { shadow: false });

// town (hot-water export, optional)
const townLights = [];
for (let i = 0; i < 8; i++) {
  const x = -44 + (i % 4) * 4.6, z = 3 + Math.floor(i / 4) * 7;
  add('town', BX(3, 2.6, 3.4), mat('#d9c7a6'), [x, 1.3, z], { look: 'town' });
  const roof = add('town', new THREE.ConeGeometry(2.6, 1.6, 4), mat('#9a4e2b'), [x, 3.4, z], { rot: [0, Math.PI / 4, 0] });
  const wm = mat('#333', { emissive: '#000' }); add('town', BX(0.9, 0.8, 0.05), wm, [x, 1.4, z + 1.73], { shadow: false }); townLights.push(wm);
}

/* ═════════════════════════ pipes + flow particles ═════════════════════════ */
const PIPE_DEFS = [
  { id: 'pri_supply_main', circuit: 'primary', kind: 'supply', key: 'pri_supply', r: 0.17, pts: [[-5, -7.2, -6.8], [-16.6, -7.2, -6.8], [-16.6, -7.2, -9.6], [-16.6, 17.1, -9.6]] },
  ...['f1', 'f2', 'f3'].map(k => ({ id: `pri_supply_${k}`, circuit: 'primary', kind: 'supply', key: 'pri_supply', r: 0.12, floor: k, pts: [[-16.6, FY[k] + 3.6, -9.6], [-16.6, FY[k] + 3.6, 0], [12, FY[k] + 3.6, 0]] })),
  ...['f1', 'f2', 'f3'].map(k => ({ id: `pri_return_${k}`, circuit: 'primary', kind: 'return', key: 'pri_return', r: 0.12, floor: k, pts: [[-12, FY[k] + 4.0, 0.8], [16.6, FY[k] + 4.0, 0.8], [16.6, FY[k] + 4.0, -9.6]] })),
  { id: 'pri_return_main', circuit: 'primary', kind: 'return', key: 'pri_return', r: 0.17, pts: [[16.6, 17.5, -9.6], [16.6, -7.6, -9.6], [16.6, -7.6, -6.2], [-3, -7.6, -6.2]] },
  { id: 'reject_riser', circuit: 'reject', kind: 'return', key: 'reject', r: 0.14, pts: [[16.6, 17.5, -9.6], [16.6, 19.4, -9.6], [11, 19.4, -9.6], [11, 19.4, -6]] },
  { id: 'hp_source', circuit: 'hp', kind: 'return', key: 'pri_return', r: 0.1, pts: [[0, -7.6, -6.2], [0.4, -7.6, -6.2], [0.4, -7.6, -3.2]] },
  { id: 'sec_hx_tank', circuit: 'secondary', kind: 'supply', key: 'sec_hx', r: 0.14, pts: [[-4, -6.1, -6.8], [-4, -5.1, -6.8], [7.2, -5.1, -6.8]] },
  { id: 'sec_lab', circuit: 'secondary', kind: 'supply', key: 'sec_lab', r: 0.11, pts: [[9.3, -5.0, -6], [14, -5, -6], [14, -5, -10.2], [14, 0.45, -10.2], [-14, 0.45, -10.2]] },
  { id: 'sec_seed', circuit: 'secondary', kind: 'supply', key: 'sec_seed', r: 0.1, pts: [[14, -3.55, -10.2], [-14, -3.55, -10.2]] },
  { id: 'sec_greenhouse', circuit: 'secondary', kind: 'supply', key: 'sec_gh', r: 0.12, pts: [[9.3, -6.7, -5], [17.5, -6.7, -5], [17.5, -1.6, -5], [27, -1.6, -5], [27, 0.5, -6], [55, 0.5, -6], [55, 0.5, -2], [27, 0.5, -2], [27, 0.5, 2], [55, 0.5, 2], [55, 0.5, 6], [27, 0.5, 6]] },
  { id: 'sec_return', circuit: 'secondary', kind: 'return', key: 'sec_return', r: 0.12, pts: [[26.4, 0.3, 7.8], [19, 0.3, 7.8], [19, -7.9, 7.8], [-4, -7.9, 7.8], [-4, -7.9, -5.6]] },
  { id: 'hp_town', circuit: 'hp', kind: 'supply', key: 'hp_town', r: 0.13, pts: [[3.3, -6.1, -2], [3.3, -6.1, 9.4], [-24, -6.1, 9.4], [-24, 0.3, 9.4], [-31, 0.3, 9.4]] },
];
const PHYS = { primary: { supply: '#2f7bff', return: '#ff3b3b' }, secondary: { supply: '#ff8a3d', return: '#22c3d6' }, reject: { supply: '#ff3b3b', return: '#ff3b3b' }, hp: { supply: '#ff3b3b', return: '#ff3b3b' } };
const pipes = [];
const partGeo = new THREE.SphereGeometry(0.11, 8, 6);
for (const d of PIPE_DEFS) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < d.pts.length; i++) path.add(new THREE.LineCurve3(new THREE.Vector3(...d.pts[i - 1]), new THREE.Vector3(...d.pts[i])));
  const gkey = 'pipe:' + d.circuit;
  const tm = mat('#888', { metal: 0.5, rough: 0.35, emissive: '#000' });
  const tube = add(gkey, new THREE.TubeGeometry(path, Math.max(24, d.pts.length * 40), d.r, 10, false), tm, [0, 0, 0], { shadow: false });
  const len = path.getLength(), count = Math.min(110, Math.max(6, Math.round(len * 0.75)));
  const pm = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.95 }); pm.userData.base = 0.95;
  const inst = new THREE.InstancedMesh(partGeo, pm, count); inst.frustumCulled = false;
  grp(gkey).g.add(inst); grp(gkey).mats.push(pm);
  pipes.push({ d, path, tube, inst, count, len, off: Math.random(), speed: 0, visible: true });
}

/* ═════════════════════════ labels ═════════════════════════ */
function css(cls, html, pos, parent = scene) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; const o = new CSS2DObject(el); o.position.set(...pos); parent.add(o); return el; }
const floorTags = Object.fromEntries(FLOORS.map(f => [f.key, css('floor-tag', f.name, [-21.5, f.y + 2, 11])]));
const zoneTags = {
  gh: css('zone-tag', '', [GHX, 6.6, 0]), lab: css('zone-tag', '', [10, 3.6, 9]), seed: css('zone-tag', '', [10, -1, 9]),
  plant: css('zone-tag', '', [10, -5.4, 9]), town: css('zone-tag', '', [-37, 5.8, 8]),
};
const ANCHORS = { gpu: [0, 21.5, 4], roof: [8, 23.5, -6], greenhouse: [GHX, 9.5, 0], lab: [-4, 4, 9], seed: [-4, -0.6, 9], town: [-37, 8.5, 8], tank: [8, -2.6, -6], plant: [-2, -2.6, 6] };
const alertEls = Object.fromEntries(Object.entries(ANCHORS).map(([k, p]) => [k, css('alert3d', '', p)]));

/* ═════════════════════════ cameras ═════════════════════════ */
const CAMS = {
  auto: { p: [62, 40, 74], t: [14, 2, 0] },
  iso: { p: [74, 64, 62], t: [14, 0, 0] },
  front: { p: [2, 7, 60], t: [2, 4.5, 0] },
  walk: { p: [-15, 1.8, 8.5], t: [4, 1.6, 2] },
  gh: { p: [47, 15, 34], t: [41, 1, 0] },
  b2: { p: [3, -3.4, 25], t: [2, -6.8, -4] },
  roof: { p: [16, 30, 24], t: [5, 18.5, -6] },
  town: { p: [-20, 17, 44], t: [-35, 1, 7] },
  rack: { p: [-1, FY.f2 + 4.4, 13], t: [-5, FY.f2 + 1.6, -1] },
  day: { p: [26, 24, 70], t: [20, 0, 0] },
  heat: { p: [36, 26, 58], t: [6, 1, 0] },
};
for (const f of FLOORS) CAMS[f.key] = { p: [0, f.y + 8.5, 33], t: [0, f.y + 1.8, 0] };
let tween = null;
function flyTo(key) {
  const c = CAMS[key] || CAMS.auto; state.look = key;
  tween = { t: 0, fp: camera.position.clone(), ft: controls.target.clone(), tp: new THREE.Vector3(...c.p), tt: new THREE.Vector3(...c.t) };
}
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/* ═════════════════════════ scene ← simulation ═════════════════════════ */
let focus = null; // array of group keys or null
function setFocus(keys) { focus = keys; for (const k in groups) groups[k].dim = !keys || keys.includes(k) || k === 'ground' ? 1 : 0.12; }
function applyCutaway() {
  const g = groups.cutfront; g.g.visible = !state.cutaway;
  for (const f of FLOORS) groups[f.key].g.visible = !state.hidden.has(f.key);
}

function updateScene() {
  const r = R.now, inp = state.inp;
  // racks: 3F runs hottest
  racks.forEach(rk => {
    const t = r.chip - (2 - rk.fi) * 1.8;
    const c = tcol(clamp(15 + (t - 40) * (50 / 50), 15, 65));
    rk.leds.forEach(m => { m.color.copy(c); m.emissive.copy(c); });
    rk.hot = t > LIMITS.chipThrottle;
  });
  // pipes
  const flowMax = 30;
  for (const p of pipes) {
    const st = r.pipes[p.d.key] || { T: 25, flow: 0 };
    let on = st.flow > 0.05;
    if (p.d.id === 'hp_town') on = inp.townExport && r.zones[4].supplied > 0.5;
    if (p.d.id === 'hp_source') on = r.cond > 0.5;
    if (p.d.id === 'reject_riser') on = r.rejected > 0.5 || r.unrejected > 0.5;
    p.tube.visible = p.d.id === 'hp_town' ? inp.townExport : true;
    let col;
    if (state.hydro === 'physical') col = new THREE.Color(PHYS[p.d.circuit][p.d.kind]);
    else if (state.hydro === 'flow') col = new THREE.Color('#3b4a5a').lerp(new THREE.Color('#40e0ff'), clamp(st.flow / flowMax, 0, 1));
    else col = tcol(st.T);
    p.tube.material.color.copy(on ? col : new THREE.Color('#7a838c'));
    p.tube.material.emissive.copy(on ? col : new THREE.Color(0)).multiplyScalar(0.28);
    p.inst.material.color.copy(col).lerp(new THREE.Color('#ffffff'), 0.5);
    p.inst.visible = on && p.tube.visible;
    p.speed = on ? 1.6 + 7 * clamp(st.flow / flowMax, 0, 1.4) : 0;
  }
  // HX plates / heat pump / chiller / tank
  hxPlates.forEach((m, i) => { const c = tcol(i % 2 ? r.T2 : r.Tr); m.color.copy(c); m.emissive.copy(c); });
  hpCompMat.color.set(r.cond > 0.5 ? '#ff5a3c' : '#555'); hpCompMat.emissive.set(r.cond > 0.5 ? '#ff3b1f' : '#000');
  chillerLampMat.color.set(r.chillerElec > 0 ? '#ff4433' : '#22aa66'); chillerLampMat.emissive.set(r.chillerElec > 0 ? '#ff2a1a' : '#1f9d63');
  tankTarget = r.tankFrac;
  tankLevelMat.color.copy(tcol(r.T2)); tankLevelMat.emissive.copy(tcol(r.T2));
  plumeLevel = clamp((r.rejected + r.unrejected) / 1100, 0, 1.2);
  // greenhouse frost & plant health
  const gh = r.zones[0];
  const cold = gh.demand > 0 ? gh.unmetFrac : 0;
  plantMat.color.copy(new THREE.Color('#5fbf4a').lerp(new THREE.Color('#b9c8b4'), clamp(cold * 1.4, 0, 1)));
  ghGlassMat.color.copy(new THREE.Color('#d6ecf2').lerp(new THREE.Color('#ffffff'), clamp(cold * 1.6, 0, 1)));
  ghGlassMat.userData.base = 0.16 + clamp(cold, 0, 1) * 0.45;
  bedMats.forEach(m => m.color.copy(new THREE.Color('#4a3424').lerp(new THREE.Color('#8a4a22'), clamp((r.zoneTemp.zone_greenhouse_soil - 12) / 12, 0, 1))));
  // town
  groups.town.g.visible = inp.townExport;
  const tz = r.zones[4];
  townLights.forEach(m => { const lit = tz.demand > 0 && tz.unmetFrac < 0.5; m.color.set(lit ? '#ffd27a' : '#333'); m.emissive.set(lit ? '#ffb347' : '#000'); });
  // sky by hour & season
  const Ta = ambient(inp.season, inp.hour);
  nightTarget = clamp(0.5 - 0.9 * Math.cos(2 * Math.PI * (inp.hour - 13) / 24), 0, 1);
  hazeTarget = inp.season === 'summer' ? 0.06 : inp.season === 'winter' ? -0.06 : 0;
  // zone tags
  const zt = (z, t) => `<b>${z.short}</b> · ${t}`;
  zoneTags.gh.innerHTML = `<b>Research Greenhouse</b> · soil ${fmt(r.zoneTemp.zone_greenhouse_soil, 1)}°C${cold > 0.15 ? ' · <span style="color:#d2453a">frost risk</span>' : ''}`;
  zoneTags.lab.innerHTML = zt(r.zones[1], `${fmt(r.zoneTemp.zone_robot_lab, 1)}°C`);
  zoneTags.seed.innerHTML = zt(r.zones[2], `${fmt(r.zoneTemp.zone_seed_testing, 1)}°C · storage 15.7°C`);
  zoneTags.plant.innerHTML = `<b>Plant room</b> · HX ${fmt(r.Tr)}→${fmt(r.T2)}°C${r.cond > 0.5 ? ` · heat pump ${fmt(r.Tcond)}°C` : ''}`;
  zoneTags.town.innerHTML = `<b>Town hot water</b> · ${tz.demand > 0 ? fmt((1 - tz.unmetFrac) * 100) + '% served' : 'off'}`;
  zoneTags.town.style.display = inp.townExport ? '' : 'none';
  // 3D consequence pills
  const trig = evaluateTriggers(r, inp);
  const by = {};
  for (const t of trig) { if (t.sev === 'good' && state.mode === 'expert') continue; (by[t.anchor] ||= []).push(t); }
  for (const k in alertEls) alertEls[k].innerHTML = (by[k] || []).slice(0, 2).map(t => `<div class="${t.sev}">${t.sev === 'bad' ? '⚠ ' : t.sev === 'warn' ? '! ' : '✓ '}${short(t.title)}</div>`).join('');
  return trig;
}
const short = s => s.replace(/\s*\(.+?\)/, '').replace(/:.*$/, m => m.length > 26 ? '' : m);

/* ═════════════════════════ AUDIENCE MODE ═════════════════════════ */
const TILES = [
  { k: 'it', step: 0, label: 'IT power', v: r => `${fmt(r.IT)} kW`, s: r => `GPUs at ${fmt(state.inp.load * 100)}% load` },
  { k: 'chip', step: 1, label: 'Hottest chip', v: r => `${fmt(r.chip)}°C`, s: () => `limit ${LIMITS.chipThrottle}°C`, st: r => (r.throttle ? 'bad' : r.chip > LIMITS.chipWarn ? 'warn' : 'good') },
  { k: 'cap', step: 2, label: 'Caught by water', v: r => `${fmt(r.captured)} kW`, s: r => `${fmt(r.air)} kW still goes to air` },
  { k: 'ret', step: 2, label: 'Water leaving GPUs', v: r => `${fmt(r.Tr, 1)}°C`, s: r => `sent in at ${fmt(r.Ts)}°C` },
  { k: 'reuse', step: 3, label: 'Heat reused', v: r => `${fmt(r.reuseFrac * 100)}%`, s: r => `${fmt(r.delivered)} kW ≈ ${fmt(r.homes)} homes`, st: r => (r.reuseFrac >= 0.4 ? 'good' : '') },
  { k: 'unmet', step: 3, label: 'Heat demand not met', v: r => `${fmt(r.unmet)} kW`, s: r => `of ${fmt(r.demandTotal)} kW wanted`, st: r => (r.unmet > 20 ? 'bad' : 'good') },
  { k: 'tank', step: 4, label: 'Thermal store', v: r => `${fmt(r.tankFrac * 100)}%`, s: r => (r.discharge > 1 ? `discharging ${fmt(r.discharge)} kW` : r.charge > 1 ? `charging ${fmt(r.charge)} kW` : 'holding'), st: r => (r.tankFrac < 0.05 ? 'warn' : '') },
  { k: 'cost', step: 4, label: 'Net running cost', v: r => `£${fmt(r.cost)}/h`, s: r => `PUE ${fmt(r.pue, 2)}${r.chillerElec > 0 ? ' · chiller on' : ''}`, st: r => (r.chillerElec > 0 ? 'warn' : '') },
];

const METRICS = [ // for "what just changed": [label, get, unit, decimals, goodDirection(+1 higher good, -1 lower good, 0 neutral), threshold]
  ['IT power', r => r.IT, ' kW', 0, 0, 5], ['Hottest chip', r => r.chip, '°C', 1, -1, 0.3], ['Water leaving GPUs', r => r.Tr, '°C', 1, 0, 0.3],
  ['Caught by water', r => r.captured, ' kW', 0, +1, 5], ['Heat lost to air', r => r.air, ' kW', 0, -1, 5], ['Cooling overhead', r => r.overhead, ' kW', 0, -1, 1],
  ['Chiller power', r => r.chillerElec, ' kW', 0, -1, 1], ['Pump power', r => r.pumpElec, ' kW', 1, -1, 0.5], ['Heat-pump power', r => r.hpElec, ' kW', 0, -1, 1],
  ['Heat reused', r => r.reuseFrac * 100, '%', 0, +1, 0.5], ['Heat delivered', r => r.delivered, ' kW', 0, +1, 3], ['Demand not met', r => r.unmet, ' kW', 0, -1, 3],
  ['Compute lost', r => r.computeLost * 100, '%', 0, -1, 0.5], ['Thermal store', r => r.tankFrac * 100, '%', 0, +1, 1], ['Net running cost', r => r.cost, ' £/h', 0, -1, 0.5],
  ['CO₂ emitted', r => r.co2, ' kg/h', 0, -1, 1],
];

const STEPS = [
  { name: 'The building', title: 'One building, one water loop', cam: 'auto', focus: null,
    lede: 'Three floors of GPU servers sit above a robot lab, a seed-research floor and an underground plant room, with a research greenhouse next door. One water network connects them all. Click any floor, or pick a view below.',
    controls: () => `<div class="sec">Look at</div><div class="looks">${[['auto', 'Whole site'], ['f2', 'GPU halls'], ['gf', 'Robot lab'], ['b1', 'Seed research'], ['b2', 'Plant room'], ['gh', 'Greenhouse'], ['roof', 'Roof coolers'], ['front', 'Front section']].map(([k, n]) => `<button data-look="${k}" class="${state.look === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${toggle('cutaway', 'Architectural cutaway', 'Slice the front off to see inside', state.cutaway)}
      <div class="blurb">Pipe colour shows water temperature: <b style="color:#2f7bff">cool blue</b> going in, <b style="color:#ff3b3b">hot red</b> coming out. Moving dots show the flow.</div>` },
  { name: 'Heat is born', title: 'Every watt of AI becomes heat', cam: 'rack', focus: ['f1', 'f2', 'f3', 'shell'],
    lede: 'Push the GPUs harder and watch the racks glow. Nearly every kilowatt the chips use comes back out as heat, and it has to be carried away all the time.',
    controls: () => slider('load', 'GPU workload', 0.2, 1, 0.01, v => `${fmt(v * 100)}%`, ['idle', 'flat out']) +
      `<div class="blurb">Try 100%. One rack then draws about <b>${fmt(state.inp.itDesign * state.inp.load / 36, 1)} kW</b>, about as much as ${fmt(state.inp.itDesign * state.inp.load / 36 / 2)} kettles boiling non-stop.</div>` },
  { name: 'Catch the heat', title: 'Water grabs the heat before the air does', cam: 'front', focus: ['f1', 'f2', 'f3', 'b2', 'shell', 'pipe:primary'],
    lede: 'Cold plates on the chips pass heat into water. Catch more of it in liquid and less leaks into the room air, which is expensive to cool. The pump speed decides how hot that water gets.',
    controls: () => slider('capture', 'Heat caught by liquid cooling', 0.5, 0.95, 0.01, v => `${fmt(v * 100)}%`, ['50% (more air)', '95%']) +
      slider('pump', 'Pump speed', 0.3, 1, 0.01, v => `${fmt(v * 100)}% · ${fmt(30 * v, 1)} kg/s`, ['slow, hot water', 'fast, cool water']) +
      `<div class="blurb">Slow the pump right down and see what the chips do.</div>` },
  { name: 'Hot enough?', title: 'Heat has a temperature, and that decides who can use it', cam: 'heat', focus: null,
    lede: 'Each user needs water above a certain temperature. If the loop is warm enough, heat flows straight in. If not, a heat pump can lift it, at the cost of some electricity.',
    controls: () => slider('supply', 'Cooling water sent to the GPUs', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, ['20°C (safe chips)', '45°C (hot water)'], 'temp') +
      toggle('heatPump', 'Heat pump', 'Lifts water to a higher temperature', state.inp.heatPump) +
      toggle('townExport', 'Sell hot water to the town', 'Needs 65°C, so it can only go via the heat pump', state.inp.townExport) +
      `<div class="sec">Who gets heat? (water available: <span id="ladder-have"></span>)</div><div class="ladder" id="ladder"></div>` },
  { name: 'A day', title: 'Supply is steady; demand isn\'t', cam: 'day', focus: null,
    lede: 'The servers make heat around the clock, but the greenhouse wants most of it at night. The thermal store soaks up spare heat by day and gives it back after dark.',
    controls: () => seg('season', 'Season', Object.entries(SEASONS).map(([k, s]) => [k, s.label.split(' ')[0]])) +
      `<div class="ctl"><div class="row">Time of day <b id="v-hour">${hhmm(state.inp.hour)}</b></div><input type="range" data-ctl="hour" min="0" max="23.9" step="0.1" value="${state.inp.hour}"></div>
      <button class="btn ghost sm" id="play">${state.playing ? '❚❚ Pause day' : '▶ Play the day'}</button>
      <div class="sec">24 hours</div><svg class="chart" id="daychart" viewBox="0 0 320 150"></svg>
      <div class="blurb" style="font-size:12px"><b style="color:#d2453a">Red</b>: heat wanted · <b style="color:#0f7b8a">teal</b>: heat delivered · dashed: heat-exchanger limit · shaded: thermal store. Click the chart to jump to a time.</div>` },
  { name: 'You run it', title: 'Your turn at the controls', cam: 'auto', focus: null,
    lede: 'Every knob changes several things at once. Take on a challenge, or save a plan and see what a different setup gains and costs.',
    controls: () => `<div class="sec">Challenges</div><div id="chals"></div>
      <div class="sec">Controls</div>
      ${slider('load', 'GPU workload', 0.2, 1, 0.01, v => `${fmt(v * 100)}%`)}
      ${slider('capture', 'Liquid capture', 0.5, 0.95, 0.01, v => `${fmt(v * 100)}%`)}
      ${slider('pump', 'Pump speed', 0.3, 1, 0.01, v => `${fmt(v * 100)}%`)}
      ${slider('supply', 'Cooling water to GPUs', 20, 45, 0.5, v => `${fmt(v, 1)}°C`, null, 'temp')}
      ${seg('season', 'Season', Object.entries(SEASONS).map(([k, s]) => [k, s.label.split(' ')[0]]))}
      <div class="ctl"><div class="row">Time of day <b id="v-hour">${hhmm(state.inp.hour)}</b></div><input type="range" data-ctl="hour" min="0" max="23.9" step="0.1" value="${state.inp.hour}"></div>
      ${toggle('heatPump', 'Heat pump', '', state.inp.heatPump)}
      ${toggle('townExport', 'Town hot-water export', '', state.inp.townExport)}
      ${toggle('dryCooler', 'Roof dry cooler', 'Dumps heat nobody uses', state.inp.dryCooler)}
      <div class="sec">Compare plans</div><button class="btn ghost sm" id="saveA">Save current as Plan A</button> <button class="btn ghost sm" id="resetAll">Reset</button><div id="cmp"></div>` },
  { name: 'Recap', title: 'What you found out', cam: 'auto', focus: null, lede: '', controls: () => `<div id="recap"></div>` },
];

function slider(k, label, min, max, step, show, ends, cls = '') {
  const v = state.inp[k];
  return `<div class="ctl"><div class="row">${label} <b data-show="${k}">${show(v)}</b></div><input type="range" class="${cls}" data-ctl="${k}" min="${min}" max="${max}" step="${step}" value="${v}">${ends ? `<div class="scale"><span>${ends[0]}</span><span>${ends[1]}</span></div>` : ''}</div>`;
}
const SHOW = { load: v => `${fmt(v * 100)}%`, capture: v => `${fmt(v * 100)}%`, pump: v => `${fmt(v * 100)}% · ${fmt(30 * v, 1)} kg/s`, supply: v => `${fmt(v, 1)}°C`, hour: v => hhmm(v) };
function toggle(k, label, sub, on) { return `<div class="tgl ${on ? 'on' : ''}" data-tgl="${k}"><div>${label}${sub ? `<small>${sub}</small>` : ''}</div><span class="sw"></span></div>`; }
function seg(k, label, opts) { return `<div class="ctl"><div class="row">${label}</div><div class="seg">${opts.map(([v, n]) => `<button data-seg="${k}" data-v="${v}" class="${state.inp[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`; }

/* controls → state */
function touch(ctl) {
  const now = performance.now();
  if (ctl !== state.lastCtl || now - state.lastCtlAt > 2500 || !state.baseline) state.baseline = R.now;
  state.lastCtl = ctl; state.lastCtlAt = now;
}
function setInput(k, v, { silent } = {}) {
  if (k === 'cutaway') { state.cutaway = v; applyCutaway(); return renderAudience(); }
  if (!silent) touch(k);
  const before = R.now;
  state.inp[k] = v;
  recompute();
  if (!silent) state.lastWhy = explain(k, before, R.now);
  refreshLive();
}
function bindControls(root) {
  root.querySelectorAll('input[data-ctl]').forEach(el => {
    el.addEventListener('pointerdown', () => touch(el.dataset.ctl));
    el.addEventListener('input', () => { setInput(el.dataset.ctl, +el.value); const s = root.querySelector(`[data-show="${el.dataset.ctl}"]`); if (s) s.textContent = SHOW[el.dataset.ctl](+el.value); const vh = root.querySelector('#v-hour'); if (el.dataset.ctl === 'hour' && vh) vh.textContent = hhmm(+el.value); });
  });
  root.querySelectorAll('[data-tgl]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.tgl, v = k === 'cutaway' ? !state.cutaway : !state.inp[k];
    el.classList.toggle('on', v); setInput(k, v);
  }));
  root.querySelectorAll('[data-seg]').forEach(el => el.addEventListener('click', () => {
    root.querySelectorAll(`[data-seg="${el.dataset.seg}"]`).forEach(b => b.classList.toggle('on', b === el)); setInput(el.dataset.seg, el.dataset.v);
  }));
  root.querySelectorAll('[data-look]').forEach(el => el.addEventListener('click', () => lookAt(el.dataset.look)));
}
function lookAt(k) {
  flyTo(k);
  const map = { f2: ['f1', 'f2', 'f3', 'shell'], gf: ['gf', 'shell'], b1: ['b1', 'shell'], b2: ['b2', 'shell', 'pipe:primary', 'pipe:secondary', 'pipe:hp'], gh: ['gh', 'pipe:secondary', 'corridor'], roof: ['roof', 'shell', 'pipe:reject'] };
  if (state.mode === 'audience' && state.step === 0) { setFocus(map[k] || null); $$('[data-look]').forEach(b => b.classList.toggle('on', b.dataset.look === k)); }
}

/* plain-language "because" explanations */
function explain(k, a, b) {
  const d = (g) => g(b) - g(a), up = x => x > 0;
  const n = (x, dd = 0) => fmt(Math.abs(x), dd);
  const out = [];
  const chip = d(r => r.chip), tr = d(r => r.Tr), reuse = d(r => r.reuseFrac * 100), cost = d(r => r.cost);
  const newly = (flag) => !a[flag] && b[flag];
  switch (k) {
    case 'load': {
      const it = d(r => r.IT);
      out.push(up(it) ? `More GPU work uses <b>${n(it)} kW</b> more electricity, and nearly all of it turns into heat.` : `Less GPU work saves <b>${n(it)} kW</b> of electricity, so there's less heat to deal with.`);
      if (Math.abs(chip) > 0.3) out.push(`The chips run ${up(chip) ? 'hotter' : 'cooler'} by <b>${n(chip, 1)}°C</b>.`);
      if (Math.abs(reuse) > 0.5) out.push(up(reuse) ? 'The heat users\' demand barely changes, so a <b>bigger share</b> of a smaller heat stream gets reused.' : 'The heat users only need so much, so a <b>smaller share</b> of the extra heat finds a use. The rest is dumped.');
      break; }
    case 'capture': {
      const air = d(r => r.air), oh = d(r => r.overhead);
      out.push(up(-air) ? `More cold plates catch heat in water, so <b>${n(air)} kW less</b> leaks into the room air.` : `Less liquid cooling means <b>${n(air)} kW more</b> heat escapes into the air, which is harder to reuse.`);
      if (Math.abs(oh) > 1) out.push(`Air cooling overhead ${up(oh) ? 'rises' : 'falls'} by <b>${n(oh)} kW</b>.`);
      if (Math.abs(tr) > 0.3) out.push(`The water leaves ${up(tr) ? 'hotter' : 'cooler'} (${up(tr) ? '+' : '−'}${n(tr, 1)}°C)${up(tr) ? ', which makes it more useful' : ''}.`);
      break; }
    case 'pump': {
      const pe = d(r => r.pumpElec);
      out.push(up(-tr) ? `Faster water spends less time on each chip, so it leaves <b>${n(tr, 1)}°C cooler</b>.` : `Slower water picks up more heat per litre, so it leaves <b>${n(tr, 1)}°C hotter</b>.`);
      out.push(`The chips run ${up(chip) ? 'hotter' : 'cooler'} by <b>${n(chip, 1)}°C</b>. Pump power ${up(pe) ? 'rises' : 'falls'} by ${n(pe, 1)} kW (it grows with the cube of speed).`);
      break; }
    case 'supply': {
      out.push(up(tr) ? `Warmer water going in means warmer water coming out (<b>${fmt(b.T2)}°C</b> after the heat exchanger), so more users can take it directly.` : `Colder water going in protects the chips, but the outflow drops to <b>${fmt(b.T2)}°C</b>, which may be too cool for some users.`);
      out.push(`Chips: ${up(chip) ? '+' : '−'}${n(chip, 1)}°C.`);
      if (newly('chillerElec') || (a.chillerElec === 0 && b.chillerElec > 0)) out.push(`It's now colder than outside air can manage, so a <b>chiller switches on</b> (+${fmt(b.chillerElec)} kW).`);
      if (a.chillerElec > 0 && b.chillerElec === 0) out.push('Warm enough for <b>free cooling</b>: the chiller switches off.');
      const hp = d(r => r.hpElec); if (Math.abs(hp) > 1) out.push(`Heat-pump power ${up(hp) ? 'rises' : 'falls'} by ${n(hp)} kW.`);
      break; }
    case 'heatPump':
      out.push(b.cond > 0.5 ? `The heat pump lifts water to <b>${fmt(b.Tcond)}°C</b> for users the loop can't reach. It uses <b>${fmt(b.hpElec)} kW</b> of electricity to deliver ${fmt(b.cond)} kW of heat (COP ${fmt(b.COP, 1)}).`
        : !state.inp.heatPump ? `Without the heat pump, any user that needs hotter water than the loop provides goes without. Unmet demand: <b>${fmt(b.unmet)} kW</b>.` : 'Nobody needs a lift right now: the loop is warm enough for every active user.');
      break;
    case 'townExport':
      out.push(state.inp.townExport ? `The town wants up to <b>${fmt(b.zones[4].demand)} kW</b> of hot water at 65°C. ${state.inp.heatPump ? `The heat pump covers ${fmt((1 - b.zones[4].unmetFrac) * 100)}% of it.` : '<b>Without the heat pump none of it can be delivered.</b>'}` : 'Export off: the town no longer takes any heat.');
      break;
    case 'dryCooler':
      out.push(state.inp.dryCooler ? 'The dry cooler dumps spare heat into the air again, and the loop calms down.' : `Nothing is dumping the spare <b>${fmt(b.unrejected)} kW</b>, so the loop heats up and the chips go to <b>${fmt(b.chip)}°C</b>.`);
      break;
    case 'season': case 'hour': {
      const dem = d(r => r.demandTotal);
      out.push(`Outside it's now <b>${fmt(b.Ta, 1)}°C</b>. Heat demand ${up(dem) ? 'rises' : 'falls'} to <b>${fmt(b.demandTotal)} kW</b>${Math.abs(reuse) > 0.5 ? `, so ${fmt(b.reuseFrac * 100)}% of the server heat gets reused` : ''}.`);
      if (b.chillerElec > 0 && a.chillerElec === 0) out.push('Hot outside air means the dry cooler can\'t keep up, so <b>the chiller kicks in</b>.');
      if (b.chillerElec === 0 && a.chillerElec > 0) out.push('Cooler air makes <b>free cooling</b> possible again.');
      break; }
  }
  if (!a.throttle && b.throttle) out.push(`⚠ Past ${LIMITS.chipThrottle}°C the GPUs <b>throttle</b>: ${fmt(b.computeLost * 100)}% of the computing is lost.`);
  if (a.throttle && !b.throttle) out.push('✓ The chips are below the limit again, so throttling stops.');
  if (Math.abs(cost) > 1) out.push(`Running cost ${up(cost) ? 'up' : 'down'} <b>£${n(cost)}/h</b>.`);
  return out;
}

/* panels */
let prevTrig = new Set();
function refreshLive() {
  const r = R.now;
  const trig = updateScene();
  if (state.mode === 'audience') {
    // tiles (progressively unlocked)
    $('#a-tiles').innerHTML = TILES.map(t => {
      const on = state.step >= t.step;
      return `<div class="tile ${on ? (t.st ? t.st(r) : '') : 'locked'}"><div class="k">${t.label}</div><div class="v">${on ? t.v(r) : 'Unlocks later'}</div><div class="s">${on ? t.s(r) : '&nbsp;'}</div></div>`;
    }).join('');
    // what changed
    const base = state.baseline;
    let rows = [];
    if (base) rows = METRICS.map(([lbl, g, u, dp, dir, th]) => ({ lbl, a: g(base), b: g(r), u, dp, dir, th })).filter(m => Math.abs(m.b - m.a) >= m.th)
      .sort((x, y) => Math.abs((y.b - y.a) / (y.th * 4)) - Math.abs((x.b - x.a) / (x.th * 4))).slice(0, 6);
    $('#a-changes').innerHTML = rows.length ? rows.map(m => {
      const up = m.b > m.a, cls = m.dir === 0 ? 'neu' : (up === (m.dir > 0) ? 'good' : 'bad');
      return `<div class="row"><span>${m.lbl}</span><span class="v">${fmt(m.a, m.dp)} → <b>${fmt(m.b, m.dp)}${m.u}</b></span><span class="arr ${cls}">${up ? '▲' : '▼'}</span></div>`;
    }).join('') + (state.lastWhy.length ? `<div class="why">${state.lastWhy.map(s => `<p>${s}</p>`).join('')}</div>` : '')
      : `<div class="empty">Move a slider or flip a switch. You'll see exactly what it changes, and why.</div>`;
    // triggers
    const order = { bad: 0, warn: 1, good: 2 };
    const sorted = [...trig].sort((x, y) => order[x.sev] - order[y.sev]);
    const nowIds = new Set(sorted.map(t => t.id));
    $('#a-trigs').innerHTML = sorted.length ? sorted.map(t => `<div class="trig ${t.sev} ${prevTrig.has(t.id) ? '' : 'new'}"><span class="ic">${t.sev === 'bad' ? '!' : t.sev === 'warn' ? '!' : '✓'}</span><div><b>${t.title}</b>${t.detail}</div></div>`).join('')
      : `<div class="empty">Nothing notable right now.</div>`;
    for (const t of sorted) if (!prevTrig.has(t.id) && state.baseline && t.sev !== 'good') toast(t.title, t.sev);
    prevTrig = nowIds;
    // step-specific live bits
    if ($('#ladder')) renderLadder(r);
    if ($('#daychart')) renderDayChart();
    if ($('#chals')) renderChallenges(r);
    if ($('#cmp')) renderCompare(r);
    if ($('#recap')) renderRecap(r);
  } else {
    renderExpert();
  }
}

function renderLadder(r) {
  $('#ladder-have').innerHTML = `<b>${fmt(r.T2, 1)}°C</b>`;
  const pos = t => clamp((t - 15) / 50 * 100, 0, 100);
  $('#ladder').innerHTML = r.zones.filter(z => z.need != null && (!z.optional || state.inp.townExport)).map(z => {
    let pill;
    if (z.demand <= 0) pill = '<span class="pill off">no demand now</span>';
    else if (z.via === 'direct' && z.unmetFrac < 0.02) pill = '<span class="pill good">direct</span>';
    else if (z.via === 'heat pump' && z.unmetFrac < 0.02) pill = '<span class="pill warn">via heat pump</span>';
    else if (z.delivered > 0) pill = `<span class="pill warn">${fmt((1 - z.unmetFrac) * 100)}% met</span>`;
    else pill = '<span class="pill bad">not met</span>';
    return `<div class="z"><div class="zh"><b>${z.short}</b>${pill}</div><div class="bar"><span class="need" style="left:${pos(z.need)}%"></span><span class="have" style="left:${pos(r.T2)}%"></span></div>
      <div class="zs"><span>needs ${z.need}°C · ${fmt(z.demand)} kW</span><span>${z.delivered > 0 ? fmt(z.delivered) + ' kW in' : ''}</span></div></div>`;
  }).join('');
}

function renderDayChart() {
  const s = R.series, W = 320, H = 150, P = 26, Y = v => H - 18 - v / 900 * (H - 32), X = h => P + h / 23 * (W - P - 6);
  const line = g => s.map((q, h) => `${h ? 'L' : 'M'}${X(h).toFixed(1)} ${Y(g(q)).toFixed(1)}`).join(' ');
  const tank = s.map((q, h) => `${h ? 'L' : 'M'}${X(h).toFixed(1)} ${(H - 18 - q.tankFrac * 40).toFixed(1)}`).join(' ') + ` L${X(23)} ${H - 18} L${X(0)} ${H - 18} Z`;
  const hx = state.inp.hxRating;
  const hr = state.inp.hour;
  $('#daychart').innerHTML = `
    <path d="${tank}" fill="#f2c14e" opacity=".25"/>
    <line x1="${P}" x2="${W - 6}" y1="${Y(hx)}" y2="${Y(hx)}" stroke="#8a97a3" stroke-dasharray="4 3"/>
    <text x="${W - 8}" y="${Y(hx) - 3}" text-anchor="end" fill="#8a97a3" font-size="9">HX limit ${hx} kW</text>
    <path d="${line(q => q.demandTotal)}" fill="none" stroke="#d2453a" stroke-width="2"/>
    <path d="${line(q => q.delivered)}" fill="none" stroke="#0f7b8a" stroke-width="2.4"/>
    <line x1="${X(hr)}" x2="${X(hr)}" y1="6" y2="${H - 18}" stroke="#14202b" stroke-width="1.2" opacity=".6"/>
    ${[0, 6, 12, 18, 23].map(h => `<text x="${X(h)}" y="${H - 5}" text-anchor="middle" fill="#8a97a3" font-size="9">${String(h).padStart(2, '0')}h</text>`).join('')}
    ${[0, 300, 600, 900].map(v => `<text x="${P - 4}" y="${Y(v) + 3}" text-anchor="end" fill="#8a97a3" font-size="8">${v}</text>`).join('')}`;
}

function renderChallenges(r) {
  $('#chals').innerHTML = CHALLENGES.map(c => {
    const ok = c.check(r, state.inp);
    if (ok && !state.done.has(c.id)) { state.done.add(c.id); toast(`Challenge complete: ${c.title}`, 'good'); }
    const done = state.done.has(c.id);
    return `<div class="chal ${ok ? 'done' : ''}"><div class="ct">${c.title}<span class="pill ${ok ? 'good' : done ? 'warn' : 'off'}">${ok ? 'solved now' : done ? 'solved before' : 'open'}</span></div>
      <p>${c.goal}</p><button class="btn ghost sm" data-setup="${c.id}">Set the scene</button><div class="hint">Hint: ${c.hint}</div></div>`;
  }).join('');
  $$('[data-setup]').forEach(b => b.onclick = () => {
    const c = CHALLENGES.find(x => x.id === b.dataset.setup);
    touch('setup'); const before = R.now;
    Object.assign(state.inp, c.setup); recompute(); state.lastWhy = [`Scene set: ${SEASONS[state.inp.season].label.toLowerCase()}, ${hhmm(state.inp.hour)}. Now adjust the controls below to meet the goal.`];
    renderAudience(); void before;
  });
}

function renderCompare(r) {
  const A = state.planA;
  if (!A) { $('#cmp').innerHTML = '<div class="empty" style="margin-top:6px">Save a plan, change something, and compare the two side by side.</div>'; return; }
  const rows = [['Heat reused', x => x.reuseFrac * 100, '%', +1], ['Hottest chip', x => x.chip, '°C', -1], ['Demand not met', x => x.unmet, ' kW', -1], ['Cooling overhead', x => x.overhead, ' kW', -1],
    ['Heat-pump power', x => x.hpElec, ' kW', -1], ['Compute lost', x => x.computeLost * 100, '%', -1], ['Net cost', x => x.cost, ' £/h', -1], ['CO₂', x => x.co2, ' kg/h', -1]];
  $('#cmp').innerHTML = `<table class="cmp"><tr><th></th><th>Plan A</th><th>Now</th><th></th></tr>${rows.map(([n, g, u, dir]) => {
    const a = g(A), b = g(r), d = b - a, cls = Math.abs(d) < 0.5 ? 'neu' : ((d > 0) === (dir > 0) ? 'good' : 'bad');
    return `<tr><td>${n}</td><td>${fmt(a)}${u}</td><td><b>${fmt(b)}${u}</b></td><td class="arr ${cls}">${Math.abs(d) < 0.5 ? '·' : d > 0 ? '▲' : '▼'}</td></tr>`; }).join('')}</table>`;
}

function renderRecap(r) {
  $('#recap').innerHTML = `
    <div class="tiles" style="margin-top:6px">
      <div class="tile good"><div class="k">Heat reused</div><div class="v">${fmt(r.reuseFrac * 100)}%</div><div class="s">≈ ${fmt(r.homes)} homes' worth</div></div>
      <div class="tile ${r.throttle ? 'bad' : 'good'}"><div class="k">Hottest chip</div><div class="v">${fmt(r.chip)}°C</div><div class="s">${r.throttle ? 'throttling' : 'within limits'}</div></div>
      <div class="tile"><div class="k">Net running cost</div><div class="v">£${fmt(r.cost)}/h</div><div class="s">£${fmt(R.day.cost)} per day</div></div>
      <div class="tile"><div class="k">Challenges</div><div class="v">${state.done.size} / ${CHALLENGES.length}</div><div class="s">solved</div></div>
    </div>
    <div class="sec">Three things to remember</div>
    <div class="blurb"><b>1 · Almost all electricity becomes heat.</b> 1,500 kW of AI means about 1,500 kW of heat, around the clock.</div>
    <div class="blurb"><b>2 · Water is the delivery truck.</b> Catch heat in liquid and you can move it, store it, and sell it.</div>
    <div class="blurb"><b>3 · Temperature decides who can use it.</b> Warmer water helps reuse but stresses the chips. Every setting is a trade-off.</div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn pri" id="toConsole">Back to the controls</button><button class="btn ghost" id="toExpert">Open Expert Mode</button><button class="btn ghost" id="restart">Restart tour</button></div>`;
  $('#toConsole').onclick = () => goStep(5);
  $('#toExpert').onclick = () => setMode('expert');
  $('#restart').onclick = () => { state.inp = { ...DEFAULTS }; state.done.clear(); state.planA = null; state.baseline = null; state.lastWhy = []; recompute(); goStep(0); };
}

function renderAudience() {
  const st = STEPS[state.step];
  $('#a-eyebrow').textContent = `Step ${state.step + 1} of ${STEPS.length} · ${st.name}`;
  $('#a-title').textContent = st.title;
  $('#a-lede').textContent = st.lede;
  $('#a-lede').style.display = st.lede ? '' : 'none';
  const box = $('#a-controls'); box.innerHTML = st.controls(); bindControls(box);
  const pb = $('#play'); if (pb) pb.onclick = () => { state.playing = !state.playing; pb.textContent = state.playing ? '❚❚ Pause day' : '▶ Play the day'; if (state.playing) touch('hour'); };
  const dc = $('#daychart'); if (dc) dc.onclick = e => { const b = dc.getBoundingClientRect(); const h = clamp(((e.clientX - b.left) / b.width * 320 - 26) / (320 - 32) * 23, 0, 23.9); setInput('hour', h); const s = box.querySelector('input[data-ctl="hour"]'); if (s) s.value = h; const vh = $('#v-hour'); if (vh) vh.textContent = hhmm(h); };
  const sa = $('#saveA'); if (sa) sa.onclick = () => { state.planA = R.now; toast('Plan A saved. Now change something.', 'good'); refreshLive(); };
  const ra = $('#resetAll'); if (ra) ra.onclick = () => { state.inp = { ...DEFAULTS }; state.baseline = null; state.lastWhy = []; recompute(); renderAudience(); };
  $('#segs').innerHTML = STEPS.map((s, i) => `<button data-i="${i}" class="${i < state.step ? 'done' : i === state.step ? 'now' : ''}"><i></i><span>${i + 1}. ${s.name}</span></button>`).join('');
  $$('#segs button').forEach(b => b.onclick = () => { const i = +b.dataset.i; if (i <= state.maxStep + 1) goStep(i); });
  $('#a-prev').disabled = state.step === 0;
  $('#a-next').textContent = state.step === STEPS.length - 1 ? 'Expert Mode →' : 'Next →';
  refreshLive();
}

function goStep(i) {
  state.step = clamp(i, 0, STEPS.length - 1); state.maxStep = Math.max(state.maxStep, state.step);
  const st = STEPS[state.step];
  state.playing = false;
  if (state.step === 4 && state.inp.hour > 20) state.inp.hour = 12, recompute();
  flyTo(st.cam); setFocus(st.focus);
  state.baseline = null; state.lastWhy = []; prevTrig = new Set(evaluateTriggers(R.now, state.inp).map(t => t.id));
  renderAudience();
  history.replaceState(null, '', '#step' + (state.step + 1));
}
$('#a-next').onclick = () => (state.step === STEPS.length - 1 ? setMode('expert') : goStep(state.step + 1));
$('#a-prev').onclick = () => goStep(state.step - 1);

let toastQ = [];
function toast(msg, sev = 'good') {
  const el = document.createElement('div'); el.className = 'toast ' + sev; el.textContent = msg; $('#toasts').appendChild(el); toastQ.push(el);
  while (toastQ.length > 3) toastQ.shift().remove();
  setTimeout(() => { el.remove(); toastQ = toastQ.filter(x => x !== el); }, 3200);
}

/* ═════════════════════════ EXPERT MODE (ThermalLoop dashboard stand-in) ═════════════════════════ */
const XCAMS = [['auto', 'Auto fit'], ['iso', 'Isometric'], ['front', 'Front cutaway'], ['walk', 'Walkthrough'], ['gh', 'Greenhouse'], ['b2', 'B2 / underground'], ['roof', 'Roof plant'], ['town', 'Town export']];
const XINPUTS = [['itDesign', 'IT design power', 'kW', 1], ['capture', 'Liquid capture', 'frac', 0.01], ['pump', 'Pump speed', 'frac', 0.01], ['supply', 'Primary supply', '°C', 0.5], ['load', 'GPU load', 'frac', 0.01],
  ['hxRating', 'HX rating', 'kW', 10], ['hpRating', 'Heat-pump rating', 'kW', 10], ['tankCap', 'Buffer tank', 'kWh', 50]];
function buildExpertStatic() {
  $('#x-cams').innerHTML = XCAMS.map(([k, n]) => `<button class="xbtn" data-xcam="${k}">${n}</button>`).join('');
  $$('[data-xcam]').forEach(b => b.onclick = () => { state.focusFloor = null; setFocus(null); flyTo(b.dataset.xcam); markX(); });
  $('#x-cut').onclick = () => { state.cutaway = !state.cutaway; applyCutaway(); markX(); };
  $('#x-floors').innerHTML = [...FLOORS].reverse().map(f => `<div class="xfloor"><span class="dot" data-fvis="${f.key}"></span><span class="nm">${f.name}</span><button class="xbtn" data-ffocus="${f.key}">Focus</button></div>`).join('');
  $$('[data-fvis]').forEach(d => d.onclick = () => { const k = d.dataset.fvis; state.hidden.has(k) ? state.hidden.delete(k) : state.hidden.add(k); applyCutaway(); markX(); });
  $$('[data-ffocus]').forEach(b => b.onclick = () => { const k = b.dataset.ffocus; if (state.focusFloor === k) { state.focusFloor = null; setFocus(null); flyTo('auto'); } else { state.focusFloor = k; setFocus([k, 'pipe:primary', 'pipe:secondary', 'pipe:hp', 'pipe:reject']); flyTo(k); } markX(); });
  $('#x-views').innerHTML = [['physical', 'Physical'], ['temperature', 'Temperature'], ['flow', 'Flow']].map(([k, n]) => `<button class="xbtn" data-hydro="${k}">${n}</button>`).join('');
  $$('[data-hydro]').forEach(b => b.onclick = () => { state.hydro = b.dataset.hydro; updateScene(); markX(); });
  $('#x-scn').innerHTML = `<option value="">Custom</option>` + Object.entries(SCENARIOS).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  $('#x-scn').onchange = e => { const s = SCENARIOS[e.target.value]; if (s) { state.expertDraft = { ...state.inp, ...s.set }; buildExpertInputs(); } };
  $('#x-run').onclick = () => { if (state.expertDraft) { state.inp = { ...state.expertDraft }; } state.expertDraft = null; recompute(); buildExpertInputs(); refreshLive(); };
  $('#x-play').onclick = () => { state.playing = !state.playing; $('#x-play').textContent = state.playing ? 'Pause' : 'Play'; };
  $('#x-hour').oninput = e => { state.inp.hour = +e.target.value; recompute(); refreshLive(); };
}
function buildExpertInputs() {
  const D = state.expertDraft || state.inp;
  $('#x-inputs').innerHTML = XINPUTS.map(([k, n, u, st]) => `<div class="xrow"><span>${n}</span><span><input class="xin" type="number" step="${st}" data-xin="${k}" value="${D[k]}"> <span style="color:#7f97ab">${u}</span></span></div>`).join('') +
    `<div class="xrow"><span>Season</span><select class="xin" style="width:120px;margin:0" id="x-season">${Object.entries(SEASONS).map(([k, s]) => `<option value="${k}" ${D.season === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>` +
    [['heatPump', 'Heat pump enabled'], ['townExport', 'Town hot-water export'], ['dryCooler', 'Aux rejection (dry cooler)']].map(([k, n]) => `<label class="xchk"><span>${n}</span><input type="checkbox" data-xchk="${k}" ${D[k] ? 'checked' : ''}></label>`).join('') +
    (state.expertDraft ? '<div style="color:#e0a63a;margin-top:6px">Inputs modified. Run to apply.</div>' : '');
  const draft = () => (state.expertDraft ||= { ...state.inp });
  $$('[data-xin]').forEach(i => i.onchange = () => { const v = parseFloat(i.value); if (isFinite(v)) { draft()[i.dataset.xin] = v; $('#x-scn').value = ''; buildExpertInputs(); } });
  $$('[data-xchk]').forEach(i => i.onchange = () => { draft()[i.dataset.xchk] = i.checked; buildExpertInputs(); });
  $('#x-season').onchange = e => { draft().season = e.target.value; buildExpertInputs(); };
}
function markX() {
  $$('[data-xcam]').forEach(b => b.classList.toggle('on', b.dataset.xcam === state.look));
  $('#x-cut').textContent = state.cutaway ? 'Enabled' : 'Disabled'; $('#x-cut').classList.toggle('on', state.cutaway);
  $$('[data-fvis]').forEach(d => d.style.background = state.hidden.has(d.dataset.fvis) ? '#44515e' : '#2fd18b');
  $$('[data-ffocus]').forEach(b => b.classList.toggle('on', b.dataset.ffocus === state.focusFloor));
  $$('[data-hydro]').forEach(b => b.classList.toggle('on', b.dataset.hydro === state.hydro));
}
function xsvg(series, lines, maxV, unit) {
  const W = 290, H = 110, X = h => 4 + h / 23 * (W - 8), Y = v => H - 12 - clamp(v / maxV, 0, 1.05) * (H - 22);
  return `<svg class="xsvg" viewBox="0 0 ${W} ${H}">${lines.map(([g, c]) => `<path d="${series.map((q, h) => `${h ? 'L' : 'M'}${X(h).toFixed(1)} ${Y(g(q)).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="1.8"/>`).join('')}
    <line x1="${X(state.inp.hour)}" x2="${X(state.inp.hour)}" y1="4" y2="${H - 12}" stroke="#fff" opacity=".35"/><text x="${W - 4}" y="${H - 2}" text-anchor="end">${fmt(maxV)} ${unit} max</text></svg>`;
}
function renderExpert() {
  const r = R.now, s = R.series, day = R.day;
  const pass = x => (x < 1e-6 ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>');
  $('#x-right').innerHTML = `
  <div class="xbox"><h4>Heat recovery now · ${hhmm(state.inp.hour)}</h4><div class="xtiles">
    <div class="xtile"><span>IT heat</span><b>${fmt(r.IT, 1)} kW</b></div><div class="xtile"><span>Liquid captured</span><b>${fmt(r.captured, 1)} kW</b></div>
    <div class="xtile"><span>HX transfer</span><b>${fmt(r.hx, 1)} kW</b></div><div class="xtile green"><span>Delivered</span><b>${fmt(r.delivered, 1)} kW</b></div></div>
    <div style="font-weight:600;margin:4px 0 4px">Where undelivered thermal energy goes</div>
    ${[['Air-side IT heat', r.air], ['Primary pipe loss', r.pipeLoss], ['Auxiliary rejection (dry cooler)', r.rejected], ['Distribution loss', r.distLoss], ['Unrejected / cooling shortfall', r.unrejected], ['Unmet zone demand', r.unmet], ['Buffer charge (stored)', r.charge]].map(([n, v]) => `<div class="xrow"><span>${n}</span><b>${fmt(v, 1)} kW</b></div>`).join('')}</div>
  <div class="xbox"><h4>Hydronic operating point</h4>
    ${[['Primary flow', `${fmt(r.m, 2)} kg/s`], ['Primary supply / return', `${fmt(r.Ts, 1)} / ${fmt(r.Tr, 1)} °C`], ['Secondary flow', `${fmt(r.secFlow, 2)} kg/s`], ['Greenhouse branch', `${fmt(r.pipes.sec_gh.flow, 2)} kg/s`],
      ['Pump electricity', `${fmt(r.pumpElec, 1)} kW`], ['Heat-pump electricity', `${fmt(r.hpElec, 1)} kW`], ['Heat-pump COP', r.cond > 0 ? fmt(r.COP, 2) : '—'], ['Chiller electricity', `${fmt(r.chillerElec, 1)} kW`], ['PUE (excl. heat pump)', fmt(r.pue, 3)], ['Hottest chip', `${fmt(r.chip, 1)} °C`]]
      .map(([n, v]) => `<div class="xrow"><span>${n}</span><b>${v}</b></div>`).join('')}</div>
  <div class="xbox"><h4>Zone thermal delivery</h4><table class="xtable"><tr><th>Zone</th><th>Temp</th><th>Demand</th><th>Delivered</th></tr>
    ${r.zones.filter(z => !z.optional || state.inp.townExport).map(z => `<tr><td>${z.name.replace(' (export)', '')}</td><td>${r.zoneTemp[z.id] == null ? '—' : fmt(r.zoneTemp[z.id], 1) + '°'}</td><td>${fmt(z.demand, 1)}</td><td style="color:${z.unmetFrac > 0.02 ? '#ff6b5e' : '#3ddc97'}">${fmt(z.delivered, 1)}</td></tr>`).join('')}</table></div>
  <div class="xbox"><h4>Energy balance · power over time</h4>${xsvg(s, [[q => q.IT, '#9aa9b8'], [q => q.captured, '#ff8a3d'], [q => q.delivered, '#3ddc97'], [q => q.rejected, '#ff3b3b']], Math.max(...s.map(q => q.IT)) * 1.05, 'kW')}
    <div class="xleg"><span><i style="background:#9aa9b8"></i>IT</span><span><i style="background:#ff8a3d"></i>Captured</span><span><i style="background:#3ddc97"></i>Delivered</span><span><i style="background:#ff3b3b"></i>Rejected</span></div></div>
  <div class="xbox"><h4>Calculated water temperatures</h4>${xsvg(s, [[q => q.Ts, '#2f7bff'], [q => q.Tr, '#ff3b3b'], [q => q.T2, '#ff8a3d'], [q => q.Tret, '#22c3d6']], 70, '°C')}
    <div class="xleg"><span><i style="background:#2f7bff"></i>Primary supply</span><span><i style="background:#ff3b3b"></i>Primary return</span><span><i style="background:#ff8a3d"></i>Heating supply</span><span><i style="background:#22c3d6"></i>Heating return</span></div></div>
  <div class="xbox"><h4>Conservation checks (24 h)</h4>
    <div class="xrow"><span>Primary balance · max residual</span><b>${day.maxPrimaryResidual.toExponential(1)} kW ${pass(day.maxPrimaryResidual)}</b></div>
    <div class="xrow"><span>Secondary + storage · max residual</span><b>${day.maxSecondaryResidual.toExponential(1)} kW ${pass(day.maxSecondaryResidual)}</b></div>
    <div class="xrow"><span>Day: IT / delivered / rejected</span><b>${fmt(day.IT / 1000, 1)} / ${fmt(day.delivered / 1000, 1)} / ${fmt(day.rejected / 1000, 1)} MWh</b></div>
    <div style="display:flex;gap:6px;margin-top:8px"><button class="xbtn" id="x-json">Export JSON</button><button class="xbtn" id="x-csv">Export CSV</button></div></div>`;
  $('#x-json').onclick = () => download('thermalloop_run.json', JSON.stringify({ inputs: state.inp, is_measured_data: false, series: s.map(q => ({ ...q, zones: q.zones.map(z => ({ id: z.id, demand_kW: z.demand, delivered_kW: z.delivered })) })), day }, null, 1), 'application/json');
  $('#x-csv').onclick = () => download('thermalloop_run.csv', ['hour,IT_kW,captured_kW,hx_kW,delivered_kW,rejected_kW,unmet_kW,Ts_C,Tr_C,T2_C,chip_C,tank_frac,cost_gbp_h', ...s.map(q => [q.h, q.IT, q.captured, q.hx, q.delivered, q.rejected, q.unmet, q.Ts, q.Tr, q.T2, q.chip, q.tankFrac, q.cost].map(v => (+v).toFixed(3)).join(','))].join('\n'), 'text/csv');
  $('#x-hour').value = state.inp.hour; $('#x-t').textContent = `t = ${state.inp.hour.toFixed(1)} h`;
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

/* ═════════════════════════ mode switching ═════════════════════════ */
function setMode(m) {
  state.mode = m; state.playing = false;
  document.body.className = 'mode-' + m;
  $$('.modesw button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#brand-sub').textContent = m === 'audience' ? 'Audience Mode · guided tour' : 'Physics-based facility digital twin';
  scene.background.set(m === 'audience' ? '#c7d6e4' : '#b9c6d3');
  if (m === 'expert') { setFocus(null); state.expertDraft = null; buildExpertInputs(); markX(); flyTo('auto'); refreshLive(); }
  else { state.hidden.clear(); applyCutaway(); goStep(state.step); }
}
$$('.modesw button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

function recompute() { R = simulate(state.inp); }

/* click a floor / building part to fly there */
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
let tankTarget = 0.5, tankNow = 0.5, plumeLevel = 0, night = 0, nightTarget = 0, hazeTarget = 0, playAcc = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (tween) { tween.t = Math.min(1, tween.t + dt / 1.4); const k = ease(tween.t); camera.position.lerpVectors(tween.fp, tween.tp, k); controls.target.lerpVectors(tween.ft, tween.tt, k); if (tween.t >= 1) tween = null; }
  controls.update();
  // day playback
  if (state.playing) {
    playAcc += dt;
    if (playAcc > 0.12) {
      playAcc = 0; state.inp.hour = (state.inp.hour + 0.25) % 24; recompute(); refreshLive();
      const s = document.querySelector('#a-controls input[data-ctl="hour"]'); if (s) s.value = state.inp.hour; const vh = $('#v-hour'); if (vh) vh.textContent = hhmm(state.inp.hour);
    }
  }
  // focus fades
  for (const k in groups) { const G = groups[k]; for (const m of G.mats) { const target = (m.userData.base ?? 1) * G.dim; m.opacity += (target - m.opacity) * Math.min(1, dt * 6); } }
  // particles
  for (const p of pipes) {
    if (!p.inst.visible) continue;
    p.off = (p.off + dt * p.speed / p.len) % 1;
    for (let i = 0; i < p.count; i++) { p.path.getPointAt((i / p.count + p.off) % 1, tmpV); tmpM.makeTranslation(tmpV.x, tmpV.y, tmpV.z); p.inst.setMatrixAt(i, tmpM); }
    p.inst.instanceMatrix.needsUpdate = true;
  }
  // racks flicker / throttle blink
  racks.forEach((rk, i) => { const f = 0.55 + 0.45 * Math.abs(Math.sin(t * (2 + (i % 5)) + i)); const blink = rk.hot ? (Math.sin(t * 10) > 0 ? 1.6 : 0.15) : 1; rk.leds.forEach(m => (m.emissiveIntensity = f * blink * (0.4 + state.inp.load))); });
  // machinery
  pumps.forEach(p => (p.rotation.x += dt * 14 * state.inp.pump));
  const rej = R.now.rejected > 0.5; fans.forEach((f, i) => (f.rotation.y += dt * (rej ? 6 + 10 * plumeLevel : 0.3) * (i % 2 ? -1 : 1)));
  hpComp.scale.setScalar(R.now.cond > 0.5 ? 1 + 0.05 * Math.sin(t * 16) : 1);
  robots.forEach(rb => { rb.pivot.rotation.y = Math.sin(t * 0.6 + rb.phase) * 1.1; rb.lower.rotation.z = 0; rb.elbow.rotation.z = -0.6 + Math.sin(t * 0.9 + rb.phase) * 0.45; });
  tankNow += (tankTarget - tankNow) * Math.min(1, dt * 2.5);
  const lh = Math.max(0.05, tankNow * 4.1); tankLevel.scale.y = lh; tankLevel.position.y = -8.4 + lh / 2;
  // steam plume = wasted heat
  plume.forEach((p, i) => {
    const life = (t * 0.25 + p.userData.seed) % 1;
    p.position.set(6 + (i % 3) * 2 + Math.sin(life * 6 + i) * 0.6, 20 + life * 9 * (0.5 + plumeLevel), -6 + Math.cos(life * 5 + i) * 0.8);
    p.scale.setScalar(0.6 + life * 2.4 * (0.4 + plumeLevel));
    p.material.opacity = plumeLevel * 0.35 * (1 - life);
  });
  // sky
  night += (nightTarget - night) * Math.min(1, dt * 2);
  const base = state.mode === 'audience' ? new THREE.Color('#c7d6e4') : new THREE.Color('#b9c6d3');
  scene.background.copy(base).lerp(SKY_NIGHT, night * 0.85).offsetHSL(0, 0, hazeTarget * (1 - night));
  scene.fog.color.copy(scene.background);
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
