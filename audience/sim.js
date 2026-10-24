// ThermalLoop — Audience/Expert prototype · simplified, deterministic teaching model.
// Follows the ThermalLoop recovered-heat research note: GPU heat → liquid loop → heat exchanger →
// separate secondary loop → independently valved branches to four facilities (building heating,
// robotics & materials lab, seed germination, greenhouse). Seed storage is kept cold by its own
// refrigeration. A heat pump can lift water for hot taps; any unmet demand is covered by a backup heater.
// Energy balances close by construction. Illustrative only: not calibrated, not measured data.

export const CP = 4.186; // kJ/(kg·K)

export const DEFAULTS = Object.freeze({
  itDesign: 1500,      // kW total IT (3 GPU floors × 12 racks)
  load: 0.9,           // GPU workload fraction
  capture: 0.8,        // liquid capture fraction
  pump: 0.8,           // primary pump speed (30 kg/s at 100%)
  supply: 34,          // primary supply temperature to racks, °C
  season: 'winter',
  hour: 21,
  heatPump: true,      // lifts water for hot taps (needs 60°C)
  dryCooler: true,     // roof heat rejection (+ backup chiller)
  topology: 'parallel',// 'parallel' = own branch per facility · 'series' = one pipe visits all in turn
  hxRating: 340,       // kW heat-exchanger limit
  hpRating: 120,       // kW heat-pump condenser limit
  tankCap: 2000,       // kWh buffer tank
  tankStart: 0.5,
  labSet: 30,          // °C robot-lab test-rig target
  labControl: true,    // thermostat-controlled valve on the lab rig
});

export const SEASONS = {
  winter: { label: 'Winter', mean: 2 },
  spring: { label: 'Spring', mean: 10 },
  summer: { label: 'Summer', mean: 20 },
};

// Branch order also defines the order of a series ("chain") network.
export const ZONES = [
  { id: 'zone_building', name: 'Building heating', short: 'Building', need: 40, room: 21, max: 200, loss: 0.02, anchor: 'building', group: 'roof',
    uses: ['Air-handling heating coil', 'Radiant floors / radiators', 'Pre-heating tap water'] },
  { id: 'zone_robot_lab', name: 'Robotics & Materials Lab', short: 'Robot lab', need: 35, room: 21, max: 90, loss: 0.01, anchor: 'lab', group: 'gf',
    uses: ['Room heating coil', 'Temperature-controlled test stage', 'Water-jacketed materials rig'] },
  { id: 'zone_seed_germination', name: 'Seed germination', short: 'Seed center', need: 28, room: 24, max: 50, loss: 0.01, anchor: 'seed', group: 'b1',
    uses: ['Germination chambers', 'Seed-tray / root-zone warming'] },
  { id: 'zone_greenhouse', name: 'Greenhouse', short: 'Greenhouse', need: 38, room: 18, max: 180, loss: 0.04, anchor: 'greenhouse', group: 'gh',
    uses: ['Root-zone pipes under the beds', 'Air-heating coils'] },
];
export const TAPS = { id: 'zone_hot_taps', name: 'Hot tap water (via heat pump)', short: 'Hot taps', need: 60, loss: 0.03 };
export const VAULT_FRIDGE_KW = 15; // seed vault: kept cold & dry by its own refrigeration, never by the waste-heat loop

export const LIMITS = { chipWarn: 80, chipThrottle: 85 };
export const PRICES = { elec: 0.20, gas: 0.08, boilerEff: 0.9, gridCO2: 0.20, gasCO2: 0.20 };
const SERIES_FLOW = 5; // kg/s in a single chained pipe

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
const solarAt = h => (h >= 6 && h <= 18 ? Math.max(0, Math.sin(Math.PI * (h - 6) / 12)) : 0);

export function ambient(season, h) { return SEASONS[season].mean + 4 * Math.sin(2 * Math.PI * (h - 9) / 24); }

export function zoneDemand(id, inp, h) {
  const Ta = ambient(inp.season, h);
  const cold = clamp((18 - Ta) / 20, 0, 1.1);
  switch (id) {
    case 'zone_building': return 200 * cold * (h >= 7 && h < 19 ? 1 : 0.6);
    case 'zone_robot_lab': return 25 + 55 * cold;                       // test rig runs all the time
    case 'zone_seed_germination': return 18 + 27 * cold;
    case 'zone_greenhouse': return Math.max(0, 170 * clamp((16 - Ta) / 18, 0, 1.2) - 70 * solarAt(h));
    case 'zone_hot_taps': return 40 * (0.5 + 0.5 * (gauss(h, 7.5, 1.5) + gauss(h, 19, 2)));
    default: return 0;
  }
}

// How much a facility's heat emitters can take from water arriving at Tin.
// Water must reach the facility's working temperature; output falls to zero 8 K below it.
export function emitterCapacity(z, Tin) { return z.max * 1.25 * clamp((Tin - z.need + 8) / 8, 0, 1.4); }

export function stepHour(inp, h, E) {
  const Ta = ambient(inp.season, h);
  const IT = inp.itDesign * inp.load;
  const captured = IT * inp.capture;
  const air = IT - captured;
  const m = 30 * inp.pump;
  const Ts = inp.supply;
  const dT = captured / (m * CP);
  const Tr = Ts + dT;
  const T2 = Tr - 3;                                     // heat exchanger approach
  const hallAir = 24 + 12 * (1 - inp.capture) * inp.load * (Ta > 18 ? 1.3 : 1);
  const pipeLoss = 0.015 * captured;
  const budget = Math.max(0, Math.min(inp.hxRating, captured - pipeLoss));   // max via the HX this hour
  const tankOut = Math.min(500, Math.max(E, 0));

  // ── allocate heat to the four branches ──
  const zones = ZONES.map(z => ({ ...z, demand: zoneDemand(z.id, inp, h), Tin: T2, cap: 0, supplied: 0, delivered: 0, lossKW: 0, valve: 0, flow: 0, reason: '' }));
  let pool = budget + tankOut;
  if (inp.topology === 'series') {
    let T = T2;
    for (const z of zones) {
      z.Tin = T;
      z.cap = emitterCapacity(z, T);
      const thermalRoom = SERIES_FLOW * CP * Math.max(T - z.room - 1, 0);
      const want = Math.min(z.demand, z.cap, thermalRoom) / (1 - z.loss);
      z.supplied = Math.max(0, Math.min(want, pool));
      pool -= z.supplied;
      T -= z.supplied / (SERIES_FLOW * CP);
      z.flow = z.supplied > 0 ? SERIES_FLOW : 0;
    }
  } else {
    for (const z of zones) z.cap = emitterCapacity(z, T2);
    const wants = zones.map(z => Math.min(z.demand, z.cap) / (1 - z.loss));
    const total = wants.reduce((a, b) => a + b, 0);
    const s = total > pool ? pool / total : 1;
    zones.forEach((z, i) => { z.supplied = wants[i] * s; z.flow = z.supplied / (CP * 10); });
    pool -= total * s;
  }
  let supplied = 0, delivered = 0, distLoss = 0, unmet = 0, demandTotal = 0;
  for (const z of zones) {
    z.lossKW = z.supplied * z.loss;
    z.delivered = z.supplied - z.lossKW;
    z.unmetKW = Math.max(z.demand - z.delivered, 0);
    z.unmetFrac = z.demand > 0 ? z.unmetKW / z.demand : 0;
    z.valve = z.cap > 0 ? clamp(z.delivered / z.cap, 0, 1) : 0;
    z.reason = z.unmetFrac <= 0.02 ? '' : z.cap + 1e-6 < z.demand ? 'too cool' : 'not enough heat';
    supplied += z.supplied; delivered += z.delivered; distLoss += z.lossKW; unmet += z.unmetKW; demandTotal += z.demand;
  }
  const fromHX = Math.min(supplied, budget);
  const discharge = supplied - fromHX;
  const charge = Math.max(0, Math.min(budget - fromHX, 500, inp.tankCap - E));
  const hx = fromHX + charge;

  // ── heat pump → hot taps (60°C), sourced from the hot primary return ──
  const tapDemand = zoneDemand(TAPS.id, inp, h);
  let cond = 0, source = 0, hpElec = 0, COP = 0;
  const Tcond = TAPS.need + 3;
  const availPrimary = Math.max(captured - pipeLoss - hx, 0);
  if (inp.heatPump && tapDemand > 0) {
    COP = clamp(0.45 * (Tcond + 273) / (Tcond - Tr + 10), 1.5, 7);
    cond = Math.min(tapDemand / (1 - TAPS.loss), inp.hpRating);
    source = cond * (1 - 1 / COP);
    if (source > availPrimary) { source = availPrimary; cond = source / (1 - 1 / COP); }
    hpElec = cond / COP;
  }
  const tapDelivered = cond * (1 - TAPS.loss), tapLoss = cond * TAPS.loss;
  const tapUnmet = Math.max(tapDemand - tapDelivered, 0);
  const taps = { ...TAPS, demand: tapDemand, supplied: cond, delivered: tapDelivered, unmetKW: tapUnmet, unmetFrac: tapDemand > 0 ? tapUnmet / tapDemand : 0, Tin: cond > 0 ? Tcond : null };

  // ── reject whatever primary heat is left ──
  const rem = Math.max(captured - pipeLoss - hx - source, 0);
  const freeCooling = Ts >= Ta + 6;
  let rejected = 0, unrejected = 0, chillerElec = 0, fanElec = 0;
  if (inp.dryCooler) { rejected = rem; fanElec = rem * 0.015; if (!freeCooling) chillerElec = rem / 4.5; }
  else unrejected = rem;

  // ── chips ──
  let chip = Ts + 0.6 * dT + 30 * inp.load + 0.3 * (hallAir - 24);
  if (unrejected > 1) chip += Math.min(unrejected / 30, 30);
  const throttle = chip > LIMITS.chipThrottle;
  const computeLost = clamp((chip - LIMITS.chipThrottle) * 0.06, 0, 0.6);

  // ── backup heater covers anything the recovered heat could not ──
  const backup = unmet + tapUnmet;
  const airElec = air * (Ta > 18 ? 0.28 : Ta > 10 ? 0.14 : 0.06);
  const pumpElec = 30 * inp.pump ** 3 + 4 * ((supplied + cond) / 600);
  const overhead = airElec + pumpElec + chillerElec + fanElec + VAULT_FRIDGE_KW;
  const totalElec = IT + overhead + hpElec;
  const pue = (IT + overhead - VAULT_FRIDGE_KW) / IT;
  const usefulHeat = delivered + tapDelivered;
  const reuseFrac = IT > 0 ? (hx + source) / IT : 0;
  const backupCost = backup / PRICES.boilerEff * PRICES.gas;
  const cost = totalElec * PRICES.elec + backupCost;
  const gasAvoided = usefulHeat / PRICES.boilerEff * PRICES.gas;
  const co2 = totalElec * PRICES.gridCO2 + backup / PRICES.boilerEff * PRICES.gasCO2;

  const tankLoss = Math.max(E, 0) * 0.005;
  const tankEnd = clamp(E + charge - discharge - tankLoss, 0, inp.tankCap);

  const primaryResidual = captured - (pipeLoss + hx + source + rejected + unrejected);
  const secondaryResidual = (hx + discharge + cond) - (supplied + cond + charge);

  // ── robot-lab test rig: can the water hold the sample at its target, steadily? ──
  const labZone = zones[1];
  const lab = labRig(inp.labSet, inp.labControl, labZone.Tin, labZone.unmetFrac);

  const Tret = Math.max(T2 - 10, 22);
  return {
    h, Ta, IT, captured, air, m, Ts, Tr, T2, Tret, dT, hallAir, chip, throttle, computeLost,
    zones, taps, supplied, delivered, usefulHeat, distLoss: distLoss + tapLoss, unmet, demandTotal, backup, backupCost,
    hx, charge, discharge, cond, source, hpElec, COP, Tcond, pipeLoss, rejected, unrejected, freeCooling,
    chillerElec, fanElec, airElec, pumpElec, overhead, totalElec, pue, reuseFrac, cost, gasAvoided, co2,
    homes: usefulHeat / 1.5, heaters: IT / 2, tankStart: E, tankEnd, tankLoss, tankFrac: tankEnd / inp.tankCap,
    primaryResidual, secondaryResidual, lab,
    secFlow: zones.reduce((a, z) => a + z.flow, 0),
    pipes: {
      pri_supply: { T: Ts, flow: m },
      pri_return: { T: Tr, flow: m },
      reject: { T: Tr, flow: rejected / (CP * Math.max(dT, 1)) },
      sec_hx: { T: T2, flow: (hx + discharge) / (CP * 10) },
      br_building: { T: zones[0].Tin, flow: zones[0].flow },
      br_lab: { T: zones[1].Tin, flow: zones[1].flow },
      br_seed: { T: zones[2].Tin, flow: zones[2].flow },
      br_greenhouse: { T: zones[3].Tin, flow: zones[3].flow },
      hp_taps: { T: Tcond, flow: cond / (CP * 20) },
      sec_return: { T: Tret, flow: (supplied + charge) / (CP * 10) },
    },
  };
}

// Specimen temperature over 3 hours on the lab's water-jacketed rig.
export function labRig(set, control, Tin, unmetFrac = 0) {
  const reachMax = Tin - 2;                         // water must be warmer than the target
  const tooCool = set > reachMax || unmetFrac > 0.15;
  const target = Math.min(set, reachMax);
  const pts = [];
  for (let k = 0; k <= 36; k++) {
    const t = k / 12; // hours
    const wobble = control ? 0.18 * Math.sin(k * 0.9) : 2.6 * Math.sin(k * 0.45) + 1.1 * Math.sin(k * 1.7 + 1);
    const warmup = control ? 0 : -0.8;
    pts.push({ t, T: (tooCool ? target - 1.5 * (1 - Math.exp(-k / 6)) : target) + warmup + wobble });
  }
  const swing = Math.max(...pts.map(p => p.T)) - Math.min(...pts.map(p => p.T));
  const valid = control && !tooCool;
  return { pts, set, Tin, reachMax, tooCool, swing, valid, reason: valid ? '' : tooCool ? 'too cool' : 'unstable' };
}

export function simulate(inp) {
  const series = [];
  let E = inp.tankCap * inp.tankStart;
  for (let h = 0; h < 24; h++) { const s = stepHour(inp, h, E); series.push(s); E = s.tankEnd; }
  const i = Math.floor(clamp(inp.hour, 0, 23.99));
  const now = stepHour(inp, inp.hour, series[i].tankStart);
  const sum = k => series.reduce((a, s) => a + s[k], 0);
  const day = {
    IT: sum('IT'), captured: sum('captured'), delivered: sum('usefulHeat'), rejected: sum('rejected'), unmet: sum('backup'),
    totalElec: sum('totalElec'), cost: sum('cost'), co2: sum('co2'), gasAvoided: sum('gasAvoided'),
    maxPrimaryResidual: Math.max(...series.map(s => Math.abs(s.primaryResidual)), Math.abs(now.primaryResidual)),
    maxSecondaryResidual: Math.max(...series.map(s => Math.abs(s.secondaryResidual)), Math.abs(now.secondaryResidual)),
  };
  return { now, series, day };
}

// ───────────── consequences shown in the 3D scene ─────────────
export function evaluateTriggers(r) {
  const f = (n, d = 0) => n.toFixed(d);
  const out = [];
  const add = (id, sev, anchor, title, detail) => out.push({ id, sev, anchor, title, detail });
  if (r.throttle) add('throttle', 'bad', 'gpu', 'Computers overheating: slowing down', `Hottest chip ${f(r.chip)}°C, over the ${LIMITS.chipThrottle}°C limit. They lose ${f(r.computeLost * 100)}% of their speed to protect themselves.`);
  else if (r.chip > LIMITS.chipWarn) add('chipHot', 'warn', 'gpu', 'Chips getting very hot', `Hottest chip ${f(r.chip)}°C. Close to the ${LIMITS.chipThrottle}°C limit.`);
  if (r.unrejected > 1) add('overheat', 'bad', 'roof', 'Nowhere to dump spare heat', `${f(r.unrejected)} kW is building up, so the cooling water gets hotter and hotter.`);
  if (r.chillerElec > 0) add('chiller', 'warn', 'roof', 'Chiller switched on', `The water is colder than outside air can make it, so a fridge-like chiller has to run (+${f(r.chillerElec)} kW).`);
  for (const z of r.zones) if (z.demand > 0 && z.unmetFrac > 0.15)
    add('cold_' + z.id, z.unmetFrac > 0.5 ? 'bad' : 'warn', z.anchor, `${z.short}: backup heater on`,
      z.reason === 'too cool' ? `Water arrives at ${f(z.Tin)}°C but it needs about ${z.need}°C.` : 'There isn\'t enough recovered heat to go round.');
  if (r.taps.demand > 0 && r.taps.unmetFrac > 0.15) add('taps', 'warn', 'plant', 'Hot taps: backup heater on', `Tap water must reach ${TAPS.need}°C for hygiene. ${r.cond > 0 ? 'The heat pump is maxed out.' : 'With the heat pump off, recovered heat can\'t get it that hot.'}`);
  if (r.tankFrac < 0.05) add('tankEmpty', 'warn', 'tank', 'Heat storage tank empty', 'There\'s no stored heat left for the next cold spell.');
  if (r.chillerElec === 0 && r.rejected > 1) add('freeCooling', 'good', 'roof', 'Free cooling', `Outside air at ${f(r.Ta)}°C cools the spare water, so no chiller is needed.`);
  if (r.reuseFrac >= 0.3) add('reuse', 'good', 'plant', `${f(r.reuseFrac * 100)}% of server heat reused`, 'This heat would otherwise go up into the sky.');
  return out;
}

// ───────────── hands-on missions (pass by operating the building) ─────────────
const everyoneWarm = r => r.zones.every(z => z.unmetFrac <= 0.02);
export const CHALLENGES = [
  { id: 'c1', title: 'Warm everyone on a winter night',
    goal: 'At 03:00 in winter, keep all four places warm without the backup heater and without overheating the computers.',
    setup: { season: 'winter', hour: 3, supply: 26, topology: 'parallel' },
    hint: 'The building needs 40°C water. Send warmer water to the computers, or slow the pump.',
    check: (r, inp) => inp.season === 'winter' && (inp.hour >= 21 || inp.hour < 6) && everyoneWarm(r) && !r.throttle },
  { id: 'c2', title: 'One pipe for everybody',
    goal: 'With all four places on one chained pipe, keep everyone warm (including the greenhouse at the end) and keep the chips under 80°C.',
    setup: { season: 'winter', hour: 21, topology: 'series', supply: 34 },
    hint: 'Each stop cools the water. The greenhouse is last, so the water has to start hotter.',
    check: (r, inp) => inp.topology === 'series' && everyoneWarm(r) && r.chip < LIMITS.chipWarn },
  { id: 'c3', title: 'A perfect lab experiment',
    goal: 'Hold the robot lab\'s test sample steady at 38°C or warmer, with the chips under 80°C.',
    setup: { labSet: 38, labControl: false, supply: 30 },
    hint: 'You need the smart valve, and lab water at least 2°C warmer than the target.',
    check: (r, inp) => inp.labSet >= 38 && r.lab.valid && r.chip < LIMITS.chipWarn },
];

export const SCENARIOS = {
  baseline: { label: 'Baseline winter day', set: { season: 'winter', load: 0.9, capture: 0.8, pump: 0.8, supply: 34, heatPump: true, dryCooler: true, topology: 'parallel' } },
  summer: { label: 'Summer peak', set: { season: 'summer', load: 1.0, capture: 0.8, pump: 0.8, supply: 30, heatPump: true, dryCooler: true, topology: 'parallel' } },
  spring: { label: 'Spring shoulder', set: { season: 'spring', load: 0.75, capture: 0.8, pump: 0.7, supply: 32, heatPump: true, dryCooler: true, topology: 'parallel' } },
  series: { label: 'Winter · chained (series) network', set: { season: 'winter', load: 0.9, capture: 0.8, pump: 0.8, supply: 34, heatPump: true, dryCooler: true, topology: 'series' } },
};
