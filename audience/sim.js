// ThermalLoop — Audience Mode prototype · simplified, deterministic teaching model.
// Mirrors the structure of the ThermalLoop backend (capture split → primary loop → HX →
// buffer tank → zones, optional series heat pump, dry-cooler rejection) with energy
// balances that close by construction. Illustrative only: not calibrated, not measured data.

export const CP = 4.186; // kJ/(kg·K)

export const DEFAULTS = Object.freeze({
  itDesign: 1500,   // kW total IT (3 GPU floors × 12 racks)
  load: 0.9,        // GPU workload fraction
  capture: 0.8,     // liquid capture fraction
  pump: 0.8,        // primary pump speed fraction (30 kg/s at 100%)
  supply: 34,       // primary supply temperature to racks, °C
  season: 'winter',
  hour: 21,
  heatPump: true,
  townExport: false,
  dryCooler: true,
  hxRating: 450,    // kW heat-exchanger limit
  hpRating: 400,    // kW heat-pump condenser limit
  tankCap: 2000,    // kWh buffer tank
  tankStart: 0.5,   // tank state of charge at 00:00
});

export const SEASONS = {
  winter: { label: 'Winter', mean: 2 },
  spring: { label: 'Spring / autumn', mean: 10 },
  summer: { label: 'Summer', mean: 20 },
};

export const ZONES = [
  { id: 'zone_greenhouse_soil', name: 'Greenhouse soil', short: 'Greenhouse', need: 40, loss: 0.04, anchor: 'greenhouse' },
  { id: 'zone_robot_lab', name: 'Robot laboratory', short: 'Robot lab', need: 35, loss: 0.01, anchor: 'lab' },
  { id: 'zone_seed_testing', name: 'Seed testing', short: 'Seed testing', need: 30, loss: 0.01, anchor: 'seed' },
  { id: 'zone_seed_storage', name: 'Seed storage (cooled)', short: 'Seed storage', need: null, loss: 0, anchor: 'seed' },
  { id: 'zone_town_hot_water', name: 'Town hot water (export)', short: 'Town hot water', need: 65, loss: 0.06, anchor: 'town', optional: true },
];

export const LIMITS = { chipWarn: 80, chipThrottle: 85 };
export const PRICES = { elec: 0.20, heat: 0.06, gridCO2: 0.20, gasCO2PerHeat: 0.22 };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
const solarAt = h => (h >= 6 && h <= 18 ? Math.max(0, Math.sin(Math.PI * (h - 6) / 12)) : 0);

export function ambient(season, h) {
  return SEASONS[season].mean + 4 * Math.sin(2 * Math.PI * (h - 9) / 24); // warmest ~15:00
}

export function zoneDemand(id, inp, h) {
  const Ta = ambient(inp.season, h);
  switch (id) {
    case 'zone_greenhouse_soil':
      return Math.max(0, 450 * clamp((18 - Ta) / 23, 0, 1.1) - 160 * solarAt(h));
    case 'zone_robot_lab':
      return 140 * clamp((20 - Ta) / 25, 0, 1) * (h >= 8 && h < 18 ? 1 : 0.6);
    case 'zone_seed_testing':
      return 70;
    case 'zone_seed_storage':
      return 0;
    case 'zone_town_hot_water':
      return inp.townExport ? 250 * (0.55 + 0.45 * (gauss(h, 7.5, 1.5) + gauss(h, 19, 2))) : 0;
    default:
      return 0;
  }
}

// One quasi-steady hour. E = tank energy at start of the hour (kWh).
export function stepHour(inp, h, E) {
  const Ta = ambient(inp.season, h);
  const IT = inp.itDesign * inp.load;
  const captured = IT * inp.capture;
  const air = IT - captured;
  const m = 30 * inp.pump;                      // kg/s primary
  const Ts = inp.supply;
  const dT = captured / (m * CP);
  const Tr = Ts + dT;
  const T2 = Tr - 3;                            // HX approach
  const hallAir = 24 + 12 * (1 - inp.capture) * inp.load * (Ta > 18 ? 1.3 : 1);

  // ── demand split: direct (hot enough) vs needs-a-lift ──
  const zones = ZONES.map(z => {
    const demand = zoneDemand(z.id, inp, h);
    const req = demand > 0 ? demand / (1 - z.loss) : 0;
    const mode = z.need == null || demand <= 0 ? 'idle' : T2 >= z.need ? 'direct' : 'lift';
    return { ...z, demand, req, mode, supplied: 0, delivered: 0, lossKW: 0, via: 'none' };
  });
  const direct = zones.filter(z => z.mode === 'direct');
  const lift = zones.filter(z => z.mode === 'lift');
  const Rd = direct.reduce((s, z) => s + z.req, 0);

  const pipeLoss = 0.015 * captured;
  let avail = captured - pipeLoss;

  // ── heat exchanger + buffer tank ──
  const rating = inp.hxRating;
  let hx, charge = 0, discharge = 0, supplyDirect;
  if (Rd <= rating) {
    charge = Math.min(rating - Rd, Math.max(inp.tankCap - E, 0), 500);
    hx = Rd + charge;
  } else {
    hx = rating;
    discharge = Math.min(Rd - rating, Math.max(E, 0), 500);
  }
  if (hx > avail) {            // not enough captured heat: give up charging first
    const over = hx - avail;
    const cut = Math.min(over, charge);
    charge -= cut; hx -= cut;
    if (hx > avail) hx = avail;
  }
  supplyDirect = Math.min(Rd, hx - charge + discharge);
  if (Rd > hx - charge + discharge) {           // if HX was clipped, top up from tank
    const extra = Math.min(Rd - (hx - charge + discharge), Math.max(E - discharge, 0), 500 - discharge);
    if (extra > 0) { discharge += extra; supplyDirect += extra; }
  }
  avail -= hx;
  const fd = Rd > 0 ? supplyDirect / Rd : 0;
  for (const z of direct) { z.supplied = z.req * fd; z.via = 'direct'; }

  // ── series heat pump for zones that need a higher temperature ──
  let cond = 0, source = 0, hpElec = 0, COP = 0, Tcond = 0;
  if (inp.heatPump && lift.length) {
    Tcond = Math.max(...lift.map(z => z.need)) + 3;
    COP = clamp(0.45 * (Tcond + 273) / (Tcond - Tr + 10), 1.5, 7);
    const Rh = lift.reduce((s, z) => s + z.req, 0);
    cond = Math.min(Rh, inp.hpRating);
    source = cond * (1 - 1 / COP);
    if (source > avail) { source = Math.max(avail, 0); cond = source / (1 - 1 / COP); }
    hpElec = cond / COP;
    avail -= source;
    const fh = Rh > 0 ? cond / Rh : 0;
    for (const z of lift) { z.supplied = z.req * fh; z.via = 'heat pump'; }
  }

  let delivered = 0, distLoss = 0, unmet = 0, demandTotal = 0;
  for (const z of zones) {
    z.lossKW = z.supplied * z.loss;
    z.delivered = z.supplied - z.lossKW;
    z.unmetKW = Math.max(z.demand - z.delivered, 0);
    z.unmetFrac = z.demand > 0 ? z.unmetKW / z.demand : 0;
    delivered += z.delivered; distLoss += z.lossKW; unmet += z.unmetKW; demandTotal += z.demand;
  }

  // ── rejection of whatever primary heat is left ──
  const rem = Math.max(avail, 0);
  const freeCooling = Ts >= Ta + 6;
  let rejected = 0, unrejected = 0, chillerElec = 0, fanElec = 0;
  if (inp.dryCooler) {
    rejected = rem;
    fanElec = rem * 0.015;
    if (!freeCooling) chillerElec = rem / 4.5;
  } else {
    unrejected = rem;
  }

  // ── chips & throttling ──
  let chip = Ts + 0.6 * dT + 30 * inp.load + 0.3 * (hallAir - 24);
  if (unrejected > 1) chip += Math.min(unrejected / 30, 30);   // loop heats up with nowhere to dump heat
  const throttle = chip > LIMITS.chipThrottle;
  const computeLost = clamp((chip - LIMITS.chipThrottle) * 0.06, 0, 0.6);

  // ── electricity, cost, carbon ──
  const airElec = air * (Ta > 18 ? 0.28 : Ta > 10 ? 0.14 : 0.06);
  const pumpElec = 30 * inp.pump ** 3 + 4 * ((supplyDirect + cond) / 600);
  const overhead = airElec + pumpElec + chillerElec + fanElec;
  const total = IT + overhead + hpElec;
  const pue = (IT + overhead) / IT;
  const reuseFrac = IT > 0 ? (hx + source) / IT : 0;   // share of ALL server heat put to use
  const cost = total * PRICES.elec - delivered * PRICES.heat;
  const co2 = total * PRICES.gridCO2 - delivered * PRICES.gasCO2PerHeat;

  const tankLoss = Math.max(E, 0) * 0.005;
  const tankEnd = clamp(E + charge - discharge - tankLoss, 0, inp.tankCap);

  // ── conservation residuals (should be ~0) ──
  const primaryResidual = captured - (pipeLoss + hx + source + rejected + unrejected);
  const suppliedTotal = zones.reduce((s, z) => s + z.supplied, 0);
  const secondaryResidual = (hx + cond + discharge) - (suppliedTotal + charge);

  const ghZ = zones[0];
  const zoneTemp = {
    zone_greenhouse_soil: ghZ.demand > 0 ? 22 - 10 * ghZ.unmetFrac : 22,
    zone_robot_lab: 21 - 6 * zones[1].unmetFrac,
    zone_seed_testing: 24 - 6 * zones[2].unmetFrac,
    zone_seed_storage: 15.7,
    zone_town_hot_water: inp.townExport ? (zones[4].supplied > 0 ? Tcond : T2) : null,
  };
  const Tret = Math.max(T2 - 10, 22);
  const ghSupplyT = ghZ.via === 'heat pump' ? Tcond : T2;

  return {
    h, Ta, IT, captured, air, m, Ts, Tr, T2, Tret, dT, hallAir, chip, throttle, computeLost,
    zones, delivered, distLoss, unmet, demandTotal, hx, charge, discharge, cond, source, hpElec, COP, Tcond,
    pipeLoss, rejected, unrejected, freeCooling, chillerElec, fanElec, airElec, pumpElec, overhead, total, pue,
    reuseFrac, cost, co2, homes: delivered / 1.5, tankStart: E, tankEnd, tankLoss, tankFrac: tankEnd / inp.tankCap,
    primaryResidual, secondaryResidual, zoneTemp, ghSupplyT,
    secFlow: (hx + discharge) / (CP * 10),
    pipes: {
      pri_supply: { T: Ts, flow: m },
      pri_return: { T: Tr, flow: m },
      reject: { T: Tr, flow: rejected / (CP * Math.max(dT, 1)) },
      sec_hx: { T: T2, flow: hx / (CP * 10) },
      sec_lab: { T: T2, flow: zones[1].supplied / (CP * 10) },
      sec_seed: { T: T2, flow: zones[2].supplied / (CP * 10) },
      sec_gh: { T: ghSupplyT, flow: ghZ.supplied / (CP * 10) },
      hp_town: { T: Tcond || T2, flow: zones[4].supplied / (CP * 20) },
      sec_return: { T: Tret, flow: (suppliedTotal + charge) / (CP * 10) },
    },
  };
}

export function simulate(inp) {
  const series = [];
  let E = inp.tankCap * inp.tankStart;
  for (let h = 0; h < 24; h++) { const s = stepHour(inp, h, E); series.push(s); E = s.tankEnd; }
  const now = series[Math.floor(clamp(inp.hour, 0, 23.99))];
  const sum = k => series.reduce((a, s) => a + s[k], 0);
  const day = {
    IT: sum('IT'), captured: sum('captured'), delivered: sum('delivered'), rejected: sum('rejected'),
    unmet: sum('unmet'), total: sum('total'), cost: sum('cost'), co2: sum('co2'), hpElec: sum('hpElec'),
    maxPrimaryResidual: Math.max(...series.map(s => Math.abs(s.primaryResidual))),
    maxSecondaryResidual: Math.max(...series.map(s => Math.abs(s.secondaryResidual))),
  };
  return { now, series, day };
}

// ───────────── consequence triggers (what the audience sees light up) ─────────────
export function evaluateTriggers(r, inp) {
  const z = id => r.zones.find(q => q.id === id);
  const gh = z('zone_greenhouse_soil'), lab = z('zone_robot_lab'), town = z('zone_town_hot_water');
  const f = (n, d = 0) => n.toFixed(d);
  const out = [];
  const add = (id, sev, anchor, title, detail) => out.push({ id, sev, anchor, title, detail });

  if (r.throttle) add('throttle', 'bad', 'gpu', `GPUs throttling: ${f(r.computeLost * 100)}% compute lost`, `Hottest chip ${f(r.chip)}°C, above the ${LIMITS.chipThrottle}°C limit. The chips slow down to protect themselves.`);
  else if (r.chip > LIMITS.chipWarn) add('chipHot', 'warn', 'gpu', 'Chips close to their limit', `Hottest chip ${f(r.chip)}°C. A little more heat and they start throttling.`);
  if (r.unrejected > 1) add('overheat', 'bad', 'roof', 'Cooling loop overheating', `${f(r.unrejected)} kW of spare heat has nowhere to go with the dry cooler off.`);
  if (r.chillerElec > 0) add('chiller', 'warn', 'roof', `Chiller switched on (+${f(r.chillerElec)} kW)`, `Supply water at ${f(r.Ts)}°C is too cold for outside air at ${f(r.Ta)}°C to reach, so a chiller has to run.`);
  if (gh.demand > 0 && gh.unmetFrac > 0.15) add('ghCold', 'bad', 'greenhouse', 'Greenhouse going cold: frost risk', `${f(gh.unmetFrac * 100)}% of its heat demand is not met. ${r.T2 < gh.need ? `The water is ${f(r.T2)}°C and the soil needs ${gh.need}°C.` : 'There isn\'t enough heat to go round.'}`);
  if (lab.demand > 0 && lab.unmetFrac > 0.15) add('labCold', 'warn', 'lab', 'Robot lab under-heated', `${f(lab.unmetFrac * 100)}% of its demand is not met.`);
  if (town.demand > 0 && town.unmetFrac > 0.15) add('townUnmet', 'warn', 'town', 'Town hot water short', `${f(town.unmetFrac * 100)}% not delivered. Hot water needs ${town.need}°C, so it can only come through the heat pump.`);
  if (r.tankFrac < 0.05) add('tankEmpty', 'warn', 'tank', 'Thermal store empty', 'There\'s nothing left in the tank to cover the next shortfall.');
  if (r.hpElec > 0 && r.COP < 3) add('hpHard', 'warn', 'plant', `Heat pump straining (COP ${f(r.COP, 1)})`, `It's lifting heat from ${f(r.Tr)}°C to ${f(r.Tcond)}°C. Warmer source water would make it cheaper to run.`);
  if (r.chillerElec === 0 && r.rejected > 1) add('freeCooling', 'good', 'roof', 'Free cooling', `Outside air at ${f(r.Ta)}°C is enough to cool the loop, so no chiller is needed.`);
  if (gh.demand > 0 && gh.unmetFrac < 0.02 && gh.via === 'direct') add('ghWarm', 'good', 'greenhouse', 'Greenhouse heated by server heat', `${f(gh.delivered)} kW straight from the GPUs, with no heat pump.`);
  if (r.reuseFrac >= 0.4) add('reuseHigh', 'good', 'plant', `${f(r.reuseFrac * 100)}% of server heat reused`, 'That\'s heat that would otherwise be dumped into the sky.');
  if (r.pue <= 1.08) add('lowPUE', 'good', 'gpu', `Efficient: PUE ${f(r.pue, 2)}`, 'Very little power goes on cooling overhead.');
  return out;
}

// ───────────── open-ended challenges (no quizzes — you pass by operating the building) ─────────────
const isNight = h => h >= 21 || h < 6;
export const CHALLENGES = [
  {
    id: 'c1', title: 'Winter night, no heat pump',
    goal: 'Keep the greenhouse, robot lab and seed testing fully heated on a winter night, with the heat pump off and no throttling.',
    setup: { season: 'winter', hour: 2, heatPump: false, townExport: false, supply: 28 },
    hint: 'The water has to leave the HX at 40°C or more. Try a warmer supply or a slower pump, but keep an eye on the chips.',
    check: (r, inp) => inp.season === 'winter' && isNight(inp.hour) && !inp.heatPump && !r.throttle &&
      ['zone_greenhouse_soil', 'zone_robot_lab', 'zone_seed_testing'].every(id => r.zones.find(z => z.id === id).unmetFrac <= 0.02),
  },
  {
    id: 'c2', title: 'Reuse 40% at full power',
    goal: 'Run the GPUs at 95% load or more and put at least 40% of all server heat to use, with every chip below 80°C.',
    setup: { load: 1.0, season: 'winter', hour: 19, townExport: false },
    hint: 'More heat users means more reuse. Exporting hot water to the town (via the heat pump) is a big one.',
    check: (r, inp) => inp.load >= 0.95 && r.reuseFrac >= 0.4 && r.chip < LIMITS.chipWarn,
  },
  {
    id: 'c3', title: 'Summer afternoon, lean and safe',
    goal: 'At 15:00 in summer and 95%+ load: no chiller, no throttling, and PUE at or below 1.08.',
    setup: { season: 'summer', hour: 15, load: 1.0, supply: 26, capture: 0.6 },
    hint: 'Outside air is hot, so free cooling needs warmer water. Catching more heat in liquid also cuts the air-cooling bill.',
    check: (r, inp) => inp.season === 'summer' && Math.floor(inp.hour) === 15 && inp.load >= 0.95 && r.chillerElec === 0 && !r.throttle && r.pue <= 1.08,
  },
];

export const SCENARIOS = {
  baseline: { label: 'Baseline winter day', set: { season: 'winter', load: 0.9, capture: 0.8, pump: 0.8, supply: 34, heatPump: true, townExport: false, dryCooler: true } },
  summer: { label: 'Summer peak', set: { season: 'summer', load: 1.0, capture: 0.8, pump: 0.8, supply: 30, heatPump: true, townExport: false, dryCooler: true } },
  shoulder: { label: 'Spring shoulder', set: { season: 'spring', load: 0.75, capture: 0.8, pump: 0.7, supply: 32, heatPump: true, townExport: false, dryCooler: true } },
  export: { label: 'Winter + town export', set: { season: 'winter', load: 0.95, capture: 0.85, pump: 0.8, supply: 34, heatPump: true, townExport: true, dryCooler: true } },
};
