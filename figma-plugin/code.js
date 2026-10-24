// Heat Journey — Figma flow builder
// Run in Figma Desktop: Plugins → Development → Import plugin from manifest… → pick manifest.json → run.
// Creates a new page with 25 prototype frames (S0.1 … S7.1) + a Flow Map, all wired with Smart Animate.

// ───────────────────────────── constants ─────────────────────────────
const W = 1440, H = 900;
const VIEW = { x: 24, y: 80, w: 960, h: 700 };      // scene viewport
const PANEL = { x: 1008, y: 80, w: 408, h: 700 };   // info panel
const SCENE_W = 1280, SCENE_H = 760;
const GAP_X = 200, GAP_Y = 320;

const C = {
  bg: '#0E1116', panel: '#161B22', line: '#2A313C', text: '#E6EDF3', sub: '#8B949E',
  accent: '#F78166', ok: '#3FB950', warn: '#D29922', bad: '#F85149',
  skyDay: '#BFD9EE', skyNight: '#0B1730', ground: '#3B3328', soil: '#2A241D',
  concrete: '#4A505A', building: '#D6DCE4', rack: '#1F2630', glass: '#A8E0C8', pipeGray: '#6E7681',
};

const STEPS = [
  { n: '00', en: 'HOOK', zh: '开场' },
  { n: '01', en: 'DISCOVER', zh: '认识建筑' },
  { n: '02', en: 'UNDERSTAND', zh: '为什么发热' },
  { n: '03', en: 'TRACE', zh: '追踪热量' },
  { n: '04', en: 'RECOVER', zh: '回收热量' },
  { n: '05', en: 'REUSE', zh: '再利用' },
  { n: '06', en: 'OPTIMIZE', zh: '做决策' },
  { n: '07', en: 'RECAP', zh: '总结' },
];

const METRICS = [
  { k: 'power', zh: '功耗', en: 'Power', v: '1,000 kW' },
  { k: 'chip', zh: '芯片温度', en: 'Chip', v: '68°C' },
  { k: 'ret', zh: '回水温度', en: 'Return', v: '45°C' },
  { k: 'usable', zh: '可利用热', en: 'Usable heat', v: '780 kW' },
  { k: 'cost', zh: '运行成本', en: 'Cost', v: '£190/h' },
];

// camera presets: scale + scene point to center
const CAM = {
  full: { s: 0.74, cx: 640, cy: 400 },
  hero: { s: 0.9, cx: 640, cy: 330 },
  rack: { s: 2.1, cx: 330, cy: 320 },
  trace: { s: 1.15, cx: 340, cy: 470 },
  plant: { s: 1.3, cx: 560, cy: 600 },
  hx: { s: 2.3, cx: 430, cy: 610 },
  users: { s: 1.1, cx: 960, cy: 430 },
};

// focus groups (scene units that stay bright)
const G = {
  DC: ['DataCenter', 'Rack1', 'Rack2', 'Rack3', 'Rack4', 'Rack5'],
  RACK: ['Rack3'],
  PLANT: ['PlantRoom', 'Pump', 'HeatExchanger', 'HeatPump', 'Tank'],
  USERS: ['Greenhouse', 'RobotLab', 'District'],
  ROOF: ['DryCooler', 'Pipe/Reject'],
  PRIMARY: ['Pipe/Manifold', 'Pipe/PrimaryHot', 'Pipe/PrimaryCold', 'Pump', 'HeatExchanger', 'Rack3'],
  SECONDARY: ['HeatExchanger', 'Pipe/SecondaryHot', 'Pipe/SecondaryMain', 'Pipe/ToGreenhouse', 'Pipe/ToTank', 'Pipe/Return'],
  HP: ['HeatPump', 'Pipe/SecondaryHot', 'Pipe/HeatPumpOut', 'District'],
  STORE: ['Tank', 'Pipe/ToTank', 'DryCooler', 'Pipe/Reject', 'Greenhouse', 'Pipe/ToGreenhouse'],
};

// pipes: points + temperature
const PIPES = [
  { name: 'Pipe/Manifold', t: 45, pts: [[140, 405], [540, 405]], set: 'primary' },
  { name: 'Pipe/PrimaryHot', t: 45, pts: [[200, 405], [200, 620], [360, 620]], set: 'primary' },
  { name: 'Pipe/PrimaryCold', t: 35, pts: [[440, 560], [440, 470], [120, 470], [120, 400]], set: 'primary' },
  { name: 'Pipe/SecondaryHot', t: 42, pts: [[480, 590], [640, 590]], set: 'secondary' },
  { name: 'Pipe/SecondaryMain', t: 42, pts: [[600, 590], [600, 505], [1040, 505], [1040, 420]], set: 'secondary' },
  { name: 'Pipe/ToGreenhouse', t: 42, pts: [[830, 505], [830, 420]], set: 'secondary' },
  { name: 'Pipe/ToTank', t: 42, pts: [[915, 505], [915, 520]], set: 'secondary' },
  { name: 'Pipe/Return', t: 30, pts: [[1000, 420], [1000, 690], [420, 690], [420, 670]], set: 'secondary' },
  { name: 'Pipe/HeatPumpOut', t: 65, pts: [[760, 565], [760, 450], [1195, 450], [1195, 420]], set: 'hp' },
  { name: 'Pipe/Reject', t: 40, pts: [[570, 505], [570, 200]], set: 'reject' },
];

// ───────────────────────────── screens ─────────────────────────────
// pipes: 'off' | 'gray' | 'primary' | 'all'   pulse: [x,y] in scene coords
const SCREENS = [
  { id: 'S0.1', step: 0, title: '这栋楼每小时用掉 1,000 度电', en: 'This building uses 1,000 kWh every hour.',
    body: '这些电最后都去哪了？', cam: 'hero', night: true, pipes: 'off', focus: ['DataCenter', 'DryCooler'], widget: { type: 'cta', label: '开始 Start' }, metrics: 0 },
  { id: 'S0.2', step: 0, title: '猜一猜', en: 'Make a guess',
    body: '你觉得这些电最后变成了什么？（先选一个，答案在 S2.3 揭晓）', cam: 'hero', night: true, pipes: 'off', focus: ['DataCenter'],
    widget: { type: 'choices', items: ['A · 变成了"计算"  Computation', 'B · 大部分变成了热  Mostly heat', 'C · 存进了电池  Stored in batteries'] }, metrics: 0 },

  { id: 'S1.1', step: 1, title: '先认识这座建筑', en: 'Meet the building',
    body: '这座建筑由四部分组成，它们靠**水管**连在一起：计算区、地下设备区、热用户、屋顶排热。', cam: 'full', pipes: 'off', focus: null, metrics: 0 },
  { id: 'S1.2', step: 1, title: '点开每个区域', en: 'Open each zone',
    body: '依次点开 4 个标记，看看每个区域是做什么的。4 个都点完，"下一步"才会亮起来。', cam: 'full', pipes: 'off', focus: null, pins: true,
    widget: { type: 'list', items: ['① 计算区 Compute — GPU 服务器', '② 设备区 Plant — 泵、热交换器、热泵、蓄热罐', '③ 热用户 Users — 温室、机器人实验室、区域供热', '④ 排热 Rejection — 屋顶干冷器'] }, metrics: 0 },
  { id: 'S1.3', step: 1, title: '把它们连起来', en: 'Everything is connected',
    body: '这些管道是今天的主角。接下来我们看看它们里面流的是什么。', cam: 'full', pipes: 'gray', focus: null,
    learn: '计算、冷却和用热是连在一起的。', check: '哪个区域负责把多余的热排到空气里？→ 屋顶干冷器', metrics: 0 },

  { id: 'S2.1', step: 2, title: '走近一个机架', en: 'Approach a rack',
    body: '一个机架 **40 kW**，差不多是 20 台电热水壶同时烧水。点击机架。', cam: 'rack', pipes: 'gray', focus: G.RACK, gpu: 0.6, hotspot: 'Rack3', metrics: 1 },
  { id: 'S2.2', step: 2, title: '让它算起来', en: 'Put it to work',
    body: '算得越多 → 用电越多 → 热也越多。', cam: 'rack', pipes: 'gray', focus: G.RACK, gpu: 1,
    widget: { type: 'slider', label: 'GPU 负载 Load', value: 0.9, text: '90% · 芯片 76°C' }, metrics: 2 },
  { id: 'S2.3', step: 2, title: '几乎所有的电都变成了热', en: 'Almost all electricity becomes heat',
    body: '计算并不会把能量"存"起来。**40 kW 电进 → 约 40 kW 热出。** 你在 S0.2 选对了吗？', cam: 'rack', pipes: 'gray', focus: G.RACK, gpu: 1,
    widget: { type: 'energy' }, metrics: 2 },
  { id: 'S2.4', step: 2, title: '如果不散热会怎样？', en: 'What if cooling stops?',
    body: '不到一分钟，芯片就会降频保护自己。所以散热是 **7×24 小时**都不能停的事。', cam: 'rack', pipes: 'off', focus: G.RACK, gpu: 1.4,
    widget: { type: 'alarm', text: '95°C ↑  降频 THROTTLING' }, learn: 'AI 计算不仅需要算力，还需要持续管理热量。', check: '40 kW 的电进去，大约多少热出来？→ 约 40 kW', metrics: 2 },

  { id: 'S3.1', step: 3, title: '追踪热量', en: 'Trace the heat',
    body: '跟着这团热走一遍。', cam: 'trace', pipes: 'gray', focus: G.PRIMARY, gpu: 1, pulse: [330, 300], widget: { type: 'cta', label: '追踪热量 Trace' }, metrics: 2 },
  { id: 'S3.2', step: 3, title: '① 冷板', en: 'Cold plate',
    body: '贴在芯片上的冷板把热交给水：**35°C → 45°C**。', cam: 'trace', pipes: 'primary', focus: G.PRIMARY, gpu: 1, pulse: [200, 405], auto: 1.6, metrics: 2 },
  { id: 'S3.3', step: 3, title: '② 泵', en: 'Pump',
    body: '泵推着热水流到地下设备区。', cam: 'trace', pipes: 'primary', focus: G.PRIMARY, gpu: 1, pulse: [250, 620], auto: 1.6, metrics: 2 },
  { id: 'S3.4', step: 3, title: '③ 热交换器', en: 'Heat exchanger',
    body: '到了热交换器。热在这里换到另一套水里。', cam: 'trace', pipes: 'primary', focus: G.PRIMARY, gpu: 1, pulse: [420, 615], metrics: 2 },
  { id: 'S3.5', step: 3, title: '这是一个闭环', en: "It's a closed loop",
    body: '降温后的水（35°C）回到服务器，循环重新开始。流量越小，回水越热。', cam: 'trace', pipes: 'primary', focus: G.PRIMARY, gpu: 1,
    widget: { type: 'slider', label: '流量 Flow', value: 0.6, text: '60% · 回水 45°C' }, learn: '热量不是凭空消失，而是通过冷却系统被转移。', check: '热水离开服务器时大约多少度？→ 45°C', metrics: 3 },

  { id: 'S4.1', step: 4, title: '进入地下设备区', en: 'Go underground',
    body: '两套水在这里"见面"，但不会混在一起。', cam: 'plant', pipes: 'all', focus: G.PLANT.concat(G.SECONDARY), gpu: 1, metrics: 3 },
  { id: 'S4.2', step: 4, title: '热交换器只能传热', en: 'An exchanger only passes heat on',
    body: '它能把热**传过去**，但不能让它**更热**。所以二次侧最多 **42°C**。', cam: 'hx', pipes: 'all', focus: ['HeatExchanger', 'Pipe/PrimaryHot', 'Pipe/SecondaryHot', 'Pipe/PrimaryCold', 'Pipe/Return'], gpu: 1,
    widget: { type: 'hx' }, metrics: 3 },
  { id: 'S4.3', step: 4, title: '★ 42°C 够不够用？', en: 'Is 42°C hot enough?',
    body: '同样是热，**42°C 能给地暖用，却不够洗热水澡。**把 42°C 的水分别"拖"给三个用户看看。', cam: 'plant', pipes: 'all', focus: G.PLANT.concat(G.SECONDARY), gpu: 1,
    widget: { type: 'thermo' }, metrics: 3 },
  { id: 'S4.4', step: 4, title: '热泵：热量的电梯', en: 'Heat pump: an elevator for heat',
    body: '花 1 份电，加上 3 份 42°C 的热，得到 4 份 65°C 的热（COP ≈ 4）。', cam: 'plant', pipes: 'all', focus: G.HP, gpu: 1, hp: true,
    widget: { type: 'equation' }, learn: '回收热量不代表它可以直接用于所有场景，温度和设备条件很重要。', check: '哪个用户必须用热泵？→ 区域供热 / 生活热水', metrics: 4 },

  { id: 'S5.1', step: 5, title: '谁需要这些热？', en: 'Who needs the heat?',
    body: '三个用户需要的温度、热量和时间都不一样。', cam: 'users', pipes: 'all', focus: G.USERS.concat(['Pipe/SecondaryMain', 'Pipe/ToGreenhouse', 'Pipe/HeatPumpOut']), gpu: 1, hp: true,
    widget: { type: 'users' }, metrics: 4 },
  { id: 'S5.2', step: 5, title: '★ 24 小时', en: '24 hours',
    body: '数据中心**整天**都在产热，温室却主要在**晚上**要热。拖动时间轴看看。', cam: 'users', night: true, pipes: 'all', focus: G.USERS.concat(['Pipe/ToGreenhouse']), gpu: 1, hp: true,
    widget: { type: 'timeline' }, metrics: 4 },
  { id: 'S5.3', step: 5, title: '蓄热罐 & 排热', en: 'Storage & rejection',
    body: '蓄热罐把白天的热存到晚上用。实在用不掉的热，才从屋顶排到空气里。', cam: 'full', pipes: 'all', focus: G.STORE, gpu: 1,
    learn: '目标不只是排热，还要让回收的热找到合适的用途。', check: '为什么需要蓄热罐？→ 产热和用热的时间对不上', metrics: 5 },

  { id: 'S6.1', step: 6, title: '现在你来运营', en: 'Now you run the building',
    body: '先选一个目标。', cam: 'full', pipes: 'all', focus: null, gpu: 1, hp: true,
    widget: { type: 'choices', items: ['回收最多热量  Max heat reuse', '成本最低  Lowest cost', 'GPU 最安全  Safest GPUs'] }, metrics: 5 },
  { id: 'S6.2', step: 6, title: '控制台', en: 'Console',
    body: '看看每个滑块会影响哪些数字。', cam: 'full', pipes: 'all', focus: null, gpu: 1, hp: true,
    widget: { type: 'sliders' }, metrics: 5 },
  { id: 'S6.3', step: 6, title: '对比方案', en: 'Compare plans',
    body: '供水温度调高 → 回收的热更多、热泵更省电，**但 GPU 更接近降频温度。**', cam: 'full', pipes: 'all', focus: null, gpu: 1.2, hp: true,
    widget: { type: 'compare' }, learn: '系统各部分相互影响，优化一项指标可能会影响其他指标。', metrics: 5 },

  { id: 'S7.1', step: 7, title: '你的热量之旅', en: 'Your heat journey',
    body: '', cam: 'full', pipes: 'all', focus: null, gpu: 1, hp: true,
    widget: { type: 'recap' }, metrics: 5 },
];

// ───────────────────────────── helpers ─────────────────────────────
let FONT_R, FONT_B;

async function loadFonts() {
  const families = [['Noto Sans SC', 'Regular', 'Bold'], ['PingFang SC', 'Regular', 'Semibold'], ['Microsoft YaHei', 'Regular', 'Bold'], ['Inter', 'Regular', 'Bold']];
  for (const [fam, r, b] of families) {
    try {
      await figma.loadFontAsync({ family: fam, style: r });
      await figma.loadFontAsync({ family: fam, style: b });
      FONT_R = { family: fam, style: r }; FONT_B = { family: fam, style: b };
      return fam;
    } catch (e) { /* try next */ }
  }
  throw new Error('No usable font found');
}

function rgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
function solid(hex, opacity) { return [{ type: 'SOLID', color: rgb(hex), opacity: opacity === undefined ? 1 : opacity }]; }

// 20°C blue → 70°C red
const TEMP_STOPS = [[20, '#2F81F7'], [32, '#39C5CF'], [42, '#E3B341'], [55, '#F0883E'], [70, '#F85149']];
function tempHex(t) {
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    const [t0, c0] = TEMP_STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const a = rgb(c0), b = rgb(c1);
      const mix = (x, y) => Math.round((x + (y - x) * k) * 255).toString(16).padStart(2, '0');
      return '#' + mix(a.r, b.r) + mix(a.g, b.g) + mix(a.b, b.b);
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

function box(parent, name, x, y, w, h, fill, radius, opacity) {
  const r = figma.createRectangle();
  r.name = name; r.x = x; r.y = y; r.resize(Math.max(w, 0.01), Math.max(h, 0.01));
  r.fills = fill ? solid(fill, opacity) : [];
  if (radius) r.cornerRadius = radius;
  parent.appendChild(r);
  return r;
}
function dot(parent, name, cx, cy, d, fill) {
  const e = figma.createEllipse();
  e.name = name; e.resize(d, d); e.x = cx - d / 2; e.y = cy - d / 2; e.fills = solid(fill);
  parent.appendChild(e);
  return e;
}
function group(parent, name, x, y, w, h) {
  const f = figma.createFrame();
  f.name = name; f.x = x || 0; f.y = y || 0; f.resize(w || 1, h || 1);
  f.fills = []; f.clipsContent = false;
  parent.appendChild(f);
  return f;
}
// supports **bold** segments
function txt(parent, str, x, y, opts) {
  const o = Object.assign({ size: 16, color: C.text, w: null, bold: false, name: null, align: 'LEFT' }, opts || {});
  const t = figma.createText();
  t.fontName = o.bold ? FONT_B : FONT_R;
  const plain = str.replace(/\*\*/g, '');
  t.characters = plain;
  t.fontSize = o.size;
  t.fills = solid(o.color);
  t.textAlignHorizontal = o.align;
  t.lineHeight = { value: 150, unit: 'PERCENT' };
  // bold ranges
  const re = /\*\*(.+?)\*\*/g; let m, offset = 0;
  while ((m = re.exec(str)) !== null) {
    const start = m.index - offset;
    t.setRangeFontName(start, start + m[1].length, FONT_B);
    t.setRangeFills(start, start + m[1].length, solid('#FFFFFF'));
    offset += 4;
  }
  t.name = o.name || plain.slice(0, 24);
  t.x = x; t.y = y;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; }
  parent.appendChild(t);
  return t;
}
function vector(parent, name, pts, color, weight, closed, fill) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const mx = Math.min.apply(null, xs), my = Math.min.apply(null, ys);
  const data = pts.map((p, i) => (i ? 'L ' : 'M ') + (p[0] - mx) + ' ' + (p[1] - my)).join(' ') + (closed ? ' Z' : '');
  const v = figma.createVector();
  v.vectorPaths = [{ windingRule: closed ? 'NONZERO' : 'NONE', data }];
  v.strokes = color ? solid(color) : [];
  v.strokeWeight = weight || 0;
  v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND';
  v.fills = fill ? solid(fill) : [];
  v.name = name;
  parent.appendChild(v);
  v.x = mx; v.y = my;
  return v;
}
function glow(node, hex, radius) {
  node.effects = [{ type: 'DROP_SHADOW', color: Object.assign(rgb(hex), { a: 0.9 }), offset: { x: 0, y: 0 }, radius: radius || 16, spread: 0, visible: true, blendMode: 'NORMAL' }];
}

// ───────────────────────────── scene ─────────────────────────────
function buildScene(parent, sc) {
  const scene = group(parent, 'Scene', 0, 0, SCENE_W, SCENE_H);
  scene.clipsContent = true;
  const units = {}; // focusable nodes by name
  const unit = (name, x, y, w, h) => { const g = group(scene, name, x, y, w, h); units[name] = g; return g; };

  // backdrop
  box(scene, 'Sky', 0, 0, SCENE_W, 420, sc.night ? C.skyNight : C.skyDay);
  if (sc.night) for (let i = 0; i < 24; i++) dot(scene, 'Star', (i * 137) % SCENE_W, 20 + (i * 53) % 180, 3, '#FFFFFF');
  box(scene, 'Ground', 0, 420, SCENE_W, SCENE_H - 420, C.soil);
  box(scene, 'GroundLine', 0, 418, SCENE_W, 4, '#5B5040');

  // data center
  const dc = unit('DataCenter', 80, 200, 520, 220);
  box(dc, 'Shell', 0, 0, 520, 220, C.building, 6);
  box(dc, 'Floor', 0, 200, 520, 20, '#9AA4B0');
  txt(dc, '数据中心 Data center', 14, 8, { size: 13, color: '#30363D', bold: true, name: 'Label' });

  const gpuT = 30 + Math.min(sc.gpu || 0, 1.5) * 40;
  for (let i = 0; i < 5; i++) {
    const r = unit('Rack' + (i + 1), 110 + i * 95, 240, 60, 160);
    box(r, 'Body', 0, 0, 60, 160, C.rack, 4);
    for (let k = 0; k < 6; k++) {
      const led = box(r, 'GPU' + (k + 1), 8, 12 + k * 24, 44, 12, sc.gpu ? tempHex(gpuT) : '#30363D', 2);
      if (sc.gpu && i === 2) glow(led, tempHex(gpuT), 10);
    }
  }

  // roof dry cooler
  const roof = unit('DryCooler', 420, 160, 150, 40);
  box(roof, 'Body', 0, 0, 150, 40, '#8B949E', 4);
  for (let k = 0; k < 3; k++) dot(roof, 'Fan' + (k + 1), 25 + k * 50, 20, 26, '#30363D');
  if (sc.night) for (let k = 0; k < 3; k++) box(roof, 'Steam' + (k + 1), 20 + k * 50, -36 - k * 6, 10, 26, '#FFFFFF', 5, 0.25);

  // users
  const gh = unit('Greenhouse', 720, 230, 220, 190);
  box(gh, 'Glass', 0, 60, 220, 130, C.glass, 2, 0.75);
  vector(gh, 'Roof', [[0, 60], [110, 0], [220, 60]], '#7FBFA6', 2, true, '#CDEFE0');
  for (let k = 0; k < 6; k++) dot(gh, 'Plant' + (k + 1), 25 + k * 34, 165, 22, '#3FB950');
  txt(gh, '温室 Greenhouse', 10, 70, { size: 12, color: '#0E3B2A', bold: true, name: 'Label' });

  const lab = unit('RobotLab', 965, 300, 150, 120);
  box(lab, 'Shell', 0, 0, 150, 120, '#C9B8E8', 6);
  dot(lab, 'Robot', 75, 75, 36, '#6E40C9');
  txt(lab, '机器人实验室 Robot lab', 8, 6, { size: 11, color: '#2D1B55', bold: true, name: 'Label' });

  const dist = unit('District', 1140, 330, 120, 90);
  for (let k = 0; k < 2; k++) {
    box(dist, 'House' + (k + 1), k * 60, 30, 50, 60, '#E6C9A8', 2);
    vector(dist, 'HouseRoof' + (k + 1), [[k * 60 - 4, 32], [k * 60 + 25, 6], [k * 60 + 54, 32]], null, 0, true, '#B5651D');
  }
  txt(dist, '区域供热 District', 0, -18, { size: 11, color: '#FFFFFF', bold: true, name: 'Label' });

  // plant room shell
  const pr = unit('PlantRoom', 120, 480, 1040, 230);
  box(pr, 'Shell', 0, 0, 1040, 230, C.concrete, 8);
  txt(pr, '地下设备区 Plant room', 16, 10, { size: 13, color: '#C9D1D9', bold: true, name: 'Label' });

  // pipes (above plant shell, below equipment)
  const pipes = group(scene, 'Pipes', 0, 0, SCENE_W, SCENE_H);
  for (const p of PIPES) {
    let show = sc.pipes !== 'off';
    let col = C.pipeGray;
    if (sc.pipes === 'primary') col = p.set === 'primary' ? tempHex(p.t) : C.pipeGray;
    if (sc.pipes === 'all') col = (p.set === 'hp' && !sc.hp) ? C.pipeGray : tempHex(p.t);
    const v = vector(pipes, p.name, p.pts, col, p.set === 'primary' ? 10 : 8, false);
    v.opacity = show ? 1 : 0;
    units[p.name] = v;
  }

  // equipment
  const pump = unit('Pump', 222, 592, 56, 56);
  dot(pump, 'Body', 28, 28, 56, '#58A6FF'); dot(pump, 'Hub', 28, 28, 18, '#0D419D');
  txt(pump, '泵 Pump', -2, 60, { size: 11, color: '#C9D1D9', name: 'Label' });

  const hx = unit('HeatExchanger', 360, 560, 120, 110);
  box(hx, 'Body', 0, 0, 120, 110, '#8B949E', 6);
  for (let k = 0; k < 7; k++) box(hx, 'Plate' + (k + 1), 12 + k * 15, 12, 6, 86, k % 2 ? tempHex(42) : tempHex(45), 2);
  txt(hx, '热交换器 HX', 0, 114, { size: 11, color: '#C9D1D9', name: 'Label' });

  const hp = unit('HeatPump', 640, 565, 140, 100);
  box(hp, 'Body', 0, 0, 140, 100, sc.hp ? '#6E2E2E' : '#484F58', 8);
  dot(hp, 'Compressor', 45, 50, 46, sc.hp ? '#F85149' : '#6E7681');
  if (sc.hp) glow(hp.children[1], '#F85149', 18);
  txt(hp, '热泵 Heat pump', 76, 8, { size: 11, color: '#E6EDF3', name: 'Label', w: 60 });

  const tank = unit('Tank', 880, 520, 70, 160);
  box(tank, 'Body', 0, 0, 70, 160, '#30363D', 30);
  box(tank, 'Level', 6, 60, 58, 94, tempHex(42), 26);
  txt(tank, '蓄热罐 Tank', -6, 164, { size: 11, color: '#C9D1D9', name: 'Label' });

  // pins (S1.2)
  const pins = group(scene, 'Pins', 0, 0, SCENE_W, SCENE_H);
  const PIN = [['Pin/Compute', 330, 170, '①'], ['Pin/Plant', 700, 735, '②'], ['Pin/Users', 960, 250, '③'], ['Pin/Reject', 600, 130, '④']];
  for (const [n, x, y, l] of PIN) {
    const p = group(pins, n, x - 18, y - 18, 36, 36);
    const d = dot(p, 'Dot', 18, 18, 36, C.accent); glow(d, C.accent, 14);
    txt(p, l, 10, 6, { size: 15, bold: true, color: '#FFFFFF', name: 'Num' });
  }
  pins.opacity = sc.pins ? 1 : 0;

  // heat pulse (Smart Animate moves it between trace screens)
  const pulse = dot(scene, 'HeatPulse', sc.pulse ? sc.pulse[0] : 330, sc.pulse ? sc.pulse[1] : 300, 30, '#FFB86B');
  glow(pulse, '#F85149', 28);
  pulse.opacity = sc.pulse ? 1 : 0;

  // focus / dim
  if (sc.focus) {
    for (const name in units) units[name].opacity = sc.focus.indexOf(name) >= 0 ? units[name].opacity : Math.min(units[name].opacity, 0.15);
  }
  return { scene, units };
}

// ───────────────────────────── chrome ─────────────────────────────
function header(frame, sc) {
  box(frame, 'Header', 0, 0, W, 64, '#0A0D12');
  txt(frame, 'HEAT JOURNEY · 热量之旅', 24, 20, { size: 15, bold: true, name: 'Brand' });
  const prog = group(frame, 'Progress', 360, 14, 1060, 36);
  STEPS.forEach((s, i) => {
    const x = i * 132;
    const state = i < sc.step ? 'done' : i === sc.step ? 'now' : 'todo';
    const chip = group(prog, 'Step ' + s.n, x, 0, 124, 36);
    box(chip, 'Bg', 0, 0, 124, 36, state === 'now' ? C.accent : state === 'done' ? '#23303F' : '#161B22', 18);
    txt(chip, s.n + ' ' + s.zh, 14, 8, { size: 13, bold: state === 'now', color: state === 'todo' ? C.sub : '#FFFFFF', name: 'Label' });
  });
  return prog;
}

function footer(frame, sc) {
  box(frame, 'Footer', 0, 796, W, 104, '#0A0D12');
  txt(frame, '温度 Temperature', 24, 812, { size: 12, color: C.sub, name: 'LegendLabel' });
  const bar = box(frame, 'Legend', 24, 836, 300, 14, null, 7);
  bar.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: TEMP_STOPS.map(([t, h]) => ({ position: (t - 20) / 50, color: Object.assign(rgb(h), { a: 1 }) })) }];
  txt(frame, '20°C', 24, 856, { size: 11, color: C.sub, name: 'Min' });
  txt(frame, '70°C', 292, 856, { size: 11, color: C.sub, name: 'Max' });

  METRICS.forEach((m, i) => {
    const on = i < sc.metrics;
    const g = group(frame, 'Metric/' + m.k, 400 + i * 205, 812, 190, 68);
    box(g, 'Bg', 0, 0, 190, 68, on ? '#161B22' : '#0E1116', 10).strokes = solid(on ? C.line : '#1C2128');
    txt(g, m.zh + ' ' + m.en, 14, 10, { size: 11, color: C.sub, name: 'Label' });
    txt(g, on ? m.v : '— 未解锁', 14, 30, { size: 20, bold: true, color: on ? '#FFFFFF' : '#30363D', name: 'Value' });
  });
}

function widget(panel, sc, y, ctx) {
  const w = sc.widget; if (!w) return y;
  const PW = PANEL.w - 48;
  const card = (name, yy, h, fill) => box(panel, name, 24, yy, PW, h, fill || '#0E1116', 10);

  if (w.type === 'cta') {
    const b = card('CTA', y, 52, C.accent); ctx.hot.push(b);
    txt(panel, w.label + '  →', 44, y + 14, { size: 16, bold: true, name: 'CTALabel' });
    return y + 70;
  }
  if (w.type === 'choices' || w.type === 'list') {
    w.items.forEach((it, i) => {
      const b = card('Option ' + (i + 1), y, 50, '#0E1116'); b.strokes = solid(C.line);
      if (w.type === 'choices') ctx.hot.push(b);
      txt(panel, it, 40, y + 14, { size: 13, w: PW - 32, name: 'OptionLabel ' + (i + 1) });
      y += 60;
    });
    return y + 6;
  }
  if (w.type === 'slider') {
    txt(panel, w.label, 24, y, { size: 13, color: C.sub, name: 'SliderLabel' });
    txt(panel, w.text, 24, y + 22, { size: 18, bold: true, name: 'SliderValue' });
    box(panel, 'Track', 24, y + 60, PW, 6, C.line, 3);
    box(panel, 'Fill', 24, y + 60, PW * w.value, 6, C.accent, 3);
    dot(panel, 'Knob', 24 + PW * w.value, y + 63, 20, '#FFFFFF');
    return y + 90;
  }
  if (w.type === 'energy') {
    card('EnergyCard', y, 120);
    txt(panel, '电 Electricity in', 40, y + 14, { size: 12, color: C.sub });
    box(panel, 'In', 40, y + 36, PW - 32, 18, '#E3B341', 4);
    txt(panel, '40 kW', 40, y + 36, { size: 12, bold: true, color: '#0E1116' });
    txt(panel, '热 Heat out', 40, y + 64, { size: 12, color: C.sub });
    box(panel, 'Out', 40, y + 86, (PW - 32) * 0.99, 18, '#F85149', 4);
    txt(panel, '≈ 40 kW (≈100%)', 40, y + 86, { size: 12, bold: true, color: '#0E1116' });
    return y + 136;
  }
  if (w.type === 'alarm') {
    const a = card('Alarm', y, 64, '#3D1214'); a.strokes = solid(C.bad);
    txt(panel, w.text, 40, y + 18, { size: 20, bold: true, color: C.bad });
    return y + 80;
  }
  if (w.type === 'hx') {
    card('HXCard', y, 110);
    [['一次侧 Primary', '45°C → 35°C', 45], ['二次侧 Secondary', '32°C → 42°C', 42]].forEach(([a, b, t], i) => {
      dot(panel, 'Swatch' + i, 48, y + 30 + i * 46, 18, tempHex(t));
      txt(panel, a, 66, y + 20 + i * 46, { size: 13 });
      txt(panel, b, 220, y + 20 + i * 46, { size: 13, bold: true });
    });
    return y + 126;
  }
  if (w.type === 'thermo') {
    [['机器人实验室 Robot lab', 35, '√ 直接用', C.ok], ['温室 Greenhouse', 45, '≈ 刚好', C.warn], ['区域供热 District', 65, '× 需要热泵', C.bad]].forEach(([n, need, verdict, col], i) => {
      const yy = y + i * 64;
      card('Need ' + (i + 1), yy, 56);
      txt(panel, n, 40, yy + 8, { size: 13 });
      txt(panel, '需要 ' + need + '°C · 有 42°C', 40, yy + 30, { size: 11, color: C.sub });
      txt(panel, verdict, 262, yy + 18, { size: 13, bold: true, color: col });
    });
    return y + 200;
  }
  if (w.type === 'equation') {
    const parts = [['1 电', '#E3B341'], ['+', null], ['3 热 42°C', tempHex(42)], ['=', null], ['4 热 65°C', tempHex(65)]];
    let x = 24;
    parts.forEach(([l, col], i) => {
      if (col) { box(panel, 'Eq' + i, x, y, 96, 52, col, 8); txt(panel, l, x + 10, y + 15, { size: 13, bold: true, color: '#0E1116' }); x += 102; }
      else { txt(panel, l, x, y + 12, { size: 20, bold: true }); x += 18; }
    });
    const b = box(panel, 'StartHP', 24, y + 66, PW, 44, '#3D1214', 10); b.strokes = solid(C.bad);
    txt(panel, '启动热泵 Start heat pump', 44, y + 77, { size: 14, bold: true, color: C.bad });
    return y + 126;
  }
  if (w.type === 'users') {
    [['机器人实验室', '35°C · 40 kW · 白天'], ['温室', '45°C · 300 kW · 夜间/冬季'], ['区域供热', '65°C · 500 kW · 全天']].forEach(([n, d], i) => {
      const yy = y + i * 62; card('User ' + (i + 1), yy, 54);
      txt(panel, n, 40, yy + 6, { size: 14, bold: true }); txt(panel, d, 40, yy + 28, { size: 12, color: C.sub });
    });
    return y + 196;
  }
  if (w.type === 'timeline') {
    card('Chart', y, 160);
    const cx = 40, cy = y + 20, cw = PW - 32, ch = 110;
    vector(panel, 'Supply', [[cx, cy + 40], [cx + cw, cy + 40]], tempHex(55), 3);
    const dem = [0.9, 0.95, 0.9, 0.7, 0.4, 0.2, 0.15, 0.2, 0.45, 0.8, 0.95, 0.9];
    vector(panel, 'Demand', dem.map((d, i) => [cx + (cw * i) / (dem.length - 1), cy + ch - d * ch]), C.ok, 3);
    txt(panel, '— 数据中心产热 supply   — 温室需求 demand', 40, y + 136, { size: 11, color: C.sub });
    box(panel, 'Scrub', cx + cw * 0.85, cy - 6, 3, ch + 12, '#FFFFFF');
    txt(panel, '22:00', cx + cw * 0.85 - 16, cy + ch + 2, { size: 10, color: '#FFFFFF' });
    return y + 176;
  }
  if (w.type === 'sliders') {
    [['GPU 负载 Load', 0.8, '80%'], ['冷却供水温度 Supply temp', 0.6, '34°C'], ['季节 Season', 1, '冬 Winter']].forEach(([l, v, t], i) => {
      const yy = y + i * 70;
      txt(panel, l, 24, yy, { size: 13, color: C.sub }); txt(panel, t, PANEL.w - 110, yy, { size: 13, bold: true });
      box(panel, 'Track' + i, 24, yy + 32, PW, 6, C.line, 3); box(panel, 'Fill' + i, 24, yy + 32, PW * v, 6, C.accent, 3);
      dot(panel, 'Knob' + i, 24 + PW * v, yy + 35, 20, '#FFFFFF');
    });
    return y + 216;
  }
  if (w.type === 'compare') {
    card('Table', y, 196);
    const rows = [['', 'A 保存', 'B 当前'], ['供水温度', '30°C', '38°C'], ['可利用热', '620 kW', '840 kW'], ['热泵耗电', '140 kW', '95 kW'], ['芯片温度', '71°C', '83°C !']];
    rows.forEach((r, i) => r.forEach((c, j) => txt(panel, c, 40 + j * 112, y + 14 + i * 34, { size: 13, bold: i === 0 || j === 0, color: i === 4 && j === 2 ? C.warn : C.text })));
    return y + 212;
  }
  if (w.type === 'recap') {
    ['① 电几乎全部变成热  Electricity → heat', '② 热靠水来搬  Water moves heat', '③ 温度决定热能用在哪  Temperature decides use'].forEach((l, i) => {
      card('Takeaway ' + (i + 1), y + i * 64, 54); txt(panel, l, 40, y + i * 64 + 16, { size: 14, bold: true });
    });
    const b = card('Restart', y + 206, 48, C.accent); ctx.hot.push(b);
    txt(panel, '重新开始 Restart', 44, y + 218, { size: 15, bold: true });
    return y + 270;
  }
  return y;
}

function panelUI(frame, sc) {
  const panel = group(frame, 'Panel', PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  panel.clipsContent = true;
  box(panel, 'Bg', 0, 0, PANEL.w, PANEL.h, C.panel, 16);
  const s = STEPS[sc.step];
  txt(panel, 'STEP ' + s.n + ' · ' + s.en + '   ' + sc.id, 24, 24, { size: 12, bold: true, color: C.accent, name: 'Tag' });
  const t = txt(panel, sc.title, 24, 48, { size: 26, bold: true, w: PANEL.w - 48, name: 'Title' });
  let y = 48 + t.height + 2;
  const e = txt(panel, sc.en, 24, y, { size: 13, color: C.sub, w: PANEL.w - 48, name: 'TitleEN' });
  y += e.height + 16;
  if (sc.body) { const b = txt(panel, sc.body, 24, y, { size: 15, w: PANEL.w - 48, name: 'Body' }); y += b.height + 20; }
  const ctx = { hot: [] };
  y = widget(panel, sc, y, ctx);
  if (sc.learn) {
    const l = box(panel, 'LearnBg', 24, y, PANEL.w - 48, 10, '#12261B', 10);
    const lt = txt(panel, '用户学到 · ' + sc.learn, 40, y + 12, { size: 13, color: '#7EE787', w: PANEL.w - 80, name: 'Learn' });
    l.resize(PANEL.w - 48, lt.height + 24); y += lt.height + 36;
  }
  if (sc.check) { txt(panel, '检查点 Checkpoint · ' + sc.check, 24, y, { size: 12, color: C.sub, w: PANEL.w - 48, name: 'Check' }); }

  const back = group(panel, 'Back', 24, PANEL.h - 72, 170, 48);
  box(back, 'Bg', 0, 0, 170, 48, '#21262D', 10);
  txt(back, '← 上一步', 46, 13, { size: 14, name: 'Label' });
  const next = group(panel, 'Next', PANEL.w - 194, PANEL.h - 72, 170, 48);
  box(next, 'Bg', 0, 0, 170, 48, C.accent, 10);
  txt(next, sc.auto ? '自动播放 ▶' : '下一步 →', 46, 13, { size: 14, bold: true, name: 'Label' });
  return { back, next, hot: ctx.hot };
}

// ───────────────────────────── prototype links ─────────────────────────────
let LINK_OK = 0, LINK_FAIL = 0;
async function link(node, dest, trigger, duration) {
  if (!node || !dest) return;
  const reaction = {
    trigger: trigger || { type: 'ON_CLICK' },
    actions: [{ type: 'NODE', destinationId: dest.id, navigation: 'NAVIGATE',
      transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_IN_AND_OUT' }, duration: duration || 0.6 } }],
  };
  try {
    const existing = node.reactions ? node.reactions.slice() : [];
    const all = existing.concat([reaction]);
    if (node.setReactionsAsync) await node.setReactionsAsync(all); else node.reactions = all;
    LINK_OK++;
  } catch (e) { LINK_FAIL++; console.error('link failed', node.name, e); }
}

// ───────────────────────────── main ─────────────────────────────
async function main() {
  const fam = await loadFonts();
  const page = figma.createPage();
  page.name = 'Heat Journey · Flow';
  await figma.setCurrentPageAsync(page);

  const frames = [], refs = [];
  const colByStep = {};

  for (const sc of SCREENS) {
    const col = colByStep[sc.step] = (colByStep[sc.step] || 0) + 1;
    const f = figma.createFrame();
    f.name = sc.id + ' · ' + sc.title;
    f.resize(W, H);
    f.x = (col - 1) * (W + GAP_X);
    f.y = sc.step * (H + GAP_Y);
    f.fills = solid(C.bg);
    page.appendChild(f);

    const prog = header(f, sc);
    const cam = group(f, 'Camera', VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    cam.clipsContent = true; cam.cornerRadius = 16; cam.fills = solid('#000000');
    const { scene, units } = buildScene(cam, sc);
    const c = CAM[sc.cam];
    scene.rescale(c.s);
    scene.x = VIEW.w / 2 - c.cx * c.s;
    scene.y = VIEW.h / 2 - c.cy * c.s;

    const ui = panelUI(f, sc);
    footer(f, sc);
    frames.push(f); refs.push({ sc, prog, units, ui });
  }

  // step row labels on canvas
  STEPS.forEach((s, i) => {
    txt(page, 'STEP ' + s.n + ' · ' + s.en + ' · ' + s.zh, 0, i * (H + GAP_Y) - 90, { size: 48, bold: true, color: '#FFFFFF', name: 'Row label ' + s.n });
  });

  // links
  const firstOfStep = {};
  SCREENS.forEach((sc, i) => { if (firstOfStep[sc.step] === undefined) firstOfStep[sc.step] = i; });
  for (let i = 0; i < frames.length; i++) {
    const { sc, prog, units, ui } = refs[i];
    const next = frames[i + 1], prev = frames[i - 1];
    if (next) await link(ui.next, next);
    if (prev) await link(ui.back, prev);
    for (const h of ui.hot) await link(h, next || frames[0]);
    if (sc.hotspot && units[sc.hotspot] && next) await link(units[sc.hotspot], next);
    if (sc.auto && next) await link(frames[i], next, { type: 'AFTER_TIMEOUT', timeout: Math.round(sc.auto * 1000) }, 0.9);
    // progress chips jump to the first screen of already-reached steps
    for (let s = 0; s < prog.children.length; s++) if (s <= sc.step && firstOfStep[s] !== undefined) await link(prog.children[s], frames[firstOfStep[s]]);
  }

  // flow map
  const map = figma.createFrame();
  map.name = 'Flow Map · 总览';
  map.resize(W, 980); map.x = 0; map.y = -(980 + 400); map.fills = solid(C.bg);
  page.appendChild(map);
  txt(map, 'Heat Journey · Flow Map 总览（点击跳转）', 40, 32, { size: 28, bold: true });
  for (let r = 0; r < STEPS.length; r++) {
    const s = STEPS[r];
    const y = 110 + r * 108;
    txt(map, s.n + ' ' + s.en, 40, y + 18, { size: 16, bold: true, color: C.accent });
    txt(map, s.zh, 40, y + 44, { size: 13, color: C.sub });
    let k = 0;
    for (let i = 0; i < SCREENS.length; i++) {
      const sc = SCREENS[i];
      if (sc.step !== r) continue;
      const g = group(map, 'Go ' + sc.id, 220 + k * 236, y, 220, 84);
      box(g, 'Bg', 0, 0, 220, 84, C.panel, 10).strokes = solid(C.line);
      txt(g, sc.id, 14, 10, { size: 13, bold: true, color: C.accent });
      txt(g, sc.title, 14, 34, { size: 13, w: 192 });
      if (k > 0) txt(map, '→', 220 + k * 236 - 14, y + 30, { size: 14, color: C.sub });
      await link(g, frames[i]);
      k++;
    }
  }

  page.flowStartingPoints = [{ nodeId: frames[0].id, name: 'Heat Journey' }, { nodeId: map.id, name: 'Flow Map' }];
  figma.viewport.scrollAndZoomIntoView([map].concat(frames));
  figma.closePlugin('✅ Heat Journey: ' + frames.length + ' frames, ' + LINK_OK + ' links' + (LINK_FAIL ? ' (' + LINK_FAIL + ' failed – see console)' : '') + ' · font: ' + fam);
}

main().catch(e => { console.error(e); figma.closePlugin('❌ ' + e.message); });
