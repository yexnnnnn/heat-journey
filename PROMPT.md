# Prompt — add the "Heat Journey" interactive layer onto a Blender model

Copy everything below the line and send it to whoever has the Blender model. It's written so they (or an AI coding assistant) can wire the same interactive, data-driven heat system onto their own geometry. It assumes **Three.js + React Three Fiber (or plain Three.js) in the browser**, loading the Blender model as a `.glb`.

---

## What I want you to build

Take my Blender model of a data-center campus and turn it into a **guided, interactive web explainer** about where the AI servers' heat goes and how it gets reused. The story runs in 7 short steps; each step moves the camera, highlights part of the model, and exposes **live sliders/toggles** that change a small physics simulation. There are **no quizzes** — the whole point is that the user plays with controls and immediately sees the consequences.

Keep the visual style calm and warm: light background, soft floating glass cards, generous whitespace, one accent color. Reference feel: the SEED Cambridge campus tour (light meadow-green world, floating overview card top-left, a "See inside" toggle rail on the right, a step/progress bar along the bottom).

## 1. How to prepare the Blender model

Export a single `.glb` (glTF binary, Y-up, apply transforms, include materials). **The names of the objects matter** — the web code finds parts by name to highlight/dim them and to route pipes. Please name objects exactly like this (empty parent groups are fine):

| Object / group name | What it is |
|---|---|
| `DataCenter` | the building shell + halls |
| `Rack1` … `Rack5` (or more) | individual server racks; put the glowing GPU strips as children |
| `DryCooler` | rooftop heat-rejection unit (give the fan blades their own child meshes) |
| `PlantRoom` | the underground equipment room shell |
| `Pump` | pump (separate the impeller/rotor as a child so it can spin) |
| `HeatExchanger` | plate heat exchanger (plates as children if possible) |
| `HeatPump` | heat pump (compressor as a child so it can pulse) |
| `Tank` | thermal storage tank (give the "liquid level" its own child mesh) |
| `Boreholes` | optional: the seasonal ground store under the meadow |
| `Greenhouse`, `RobotLab`, `District` | the three heat users |
| `PrimaryHot`, `PrimaryCold` | pipes on the server (primary) loop |
| `SecondaryHot`, `SecondaryMain`, `ToGreenhouse`, `ToTank`, `Return` | pipes on the reuse (secondary) loop |
| `HeatPumpOut` | the hot pipe leaving the heat pump |
| `Reject` | pipe up to the dry cooler |

If modeling every pipe is too much, you can leave pipes out and I'll generate them from a list of 3D points in code — but named pipe meshes look best. Keep materials simple; the code recolors pipes and GPUs at runtime.

## 2. The simulation (the "brain")

Implement this small, illustrative model as a pure function `simulate(state) → metrics`. It is intentionally simplified teaching physics, not a real CFD model. Use these example numbers:

- IT load: **1000 kW × `load`** (slider 0.3–1.0). ~**100%** of electricity becomes heat.
- Coolant temperature rise across the chips: `dT = 10 × load × (0.6 / flow)`; return temp `Tr = supply + dT`.
- Chip temp (when cooling is on): `supply + dT + 22×load + 3`. If cooling is **off**, let it climb ~7°C/s and call it **throttling above 85°C**.
- Heat exchanger loses ~3°C: secondary supply `T2 = Tr − 3`.
- Heat-pump efficiency: `COP ≈ clamp(0.42 × 338 / max(65 − T2 + 8, 6), 1.5, 7)` — warmer input → cheaper lift.
- Three users with temperature needs: Robot lab **35°C**, Greenhouse **45°C**, District heating **65°C**. If `T2 ≥ need`, serve directly; else serve via heat pump only if it's on; else unmet.
- Seasonal demand (kW): summer {lab 10, gh 60, dist 150}, spring {25, 180, 350}, winter {40, 300, 500}.
- Costs: electricity £0.20/kWh, recovered heat worth £0.07/kWh. `net cost = total_electricity × 0.20 − usable_heat × 0.07`.
- Output metrics: total power, chip temp, return temp, secondary temp, COP, heat recovered, recovery %, usable heat, heat-pump electricity, rejected heat, net cost, and a `throttle` flag.

The headline teaching points the model must make obvious:
1. Almost all electricity becomes heat.
2. **Temperature quality matters** — 42°C water runs underfloor heating but can't reach a 65°C user without the heat pump.
3. Everything trades off — raise the coolant supply temperature and you recover more heat and run the heat pump cheaper, **but the chips get hotter**; drop it and chips are safe but a chiller kicks in and cost rises.

## 3. The 7 steps (camera + highlight + controls)

For each step: ease the camera to a preset, set which named objects stay bright (others fade to ~12% opacity), and render the controls. Some steps have 2–3 **tabs** (sub-views) in the card.

1. **The idea** — orbit the whole campus. Tabs: "Overview" (stat: 100% → heat), "The system" (name the 4 parts).
2. **Why it heats** — zoom to one rack. Tabs: intro (40 kW), **GPU-load slider** (chips glow hotter, a consequence table shows rack power / chip temp / heat rising), "No cooling?" button (chips run away → throttle).
3. **Where it goes** — follow the water. Primary pipes get colored by temperature and animated with flowing particles. Tab: **flow-rate slider** (slower flow → hotter return, but hotter chips).
4. **Heat quality** — go underground to the heat exchanger. Tabs: exchanger (secondary ends cooler), **"hot enough?"** (send `T2` water to each user, show direct / needs-pump / unmet), **heat-pump toggle** (shows COP and the 1 + N → lift).
5. **Who uses it** — pan to the three users. Tabs: a per-user served % list with a heat-pump toggle; a **24-hour timeline slider** (flat supply line vs. a demand curve that peaks at night) with the tank charging/discharging.
6. **You run it** — the full **console**: sliders for load, coolant supply temp, season, heat-pump on/off; a live result panel; a "compare to a saved Plan A" view.
7. **Recap** — three takeaways + the user's final recovery %, cost, and chip temp.

## 4. Visual encodings (important)

- **Temperature = color**, everywhere: blue 20°C → teal → amber 42°C → orange → red 70°C. Recolor pipe meshes, pipe particles, GPU strips, and heat-exchanger plates from the sim each frame.
- **Flow = particles** moving along each pipe's centerline; particle speed scales with flow rate.
- **Focus = opacity**: the active subsystem is bright; everything else fades down.
- Always show the actual number next to any color (e.g. "45°C") so it's readable for color-blind users.
- A "See inside" rail (like SEED) with toggles: X-ray the building shell, ground cutaway on/off, show boreholes, labels on/off.

## 5. Tech notes

- Load the `.glb` with `GLTFLoader`; after load, index objects by name into a map, then drive highlight/dim, pipe recoloring, and the pump/compressor/fan animations from that map. (If you prefer, keep my primitive-built scene and just swap in the model piece by piece — the object names are the contract.)
- Animate pipe particles with an `InstancedMesh` sampled along a `CurvePath` per pipe.
- Camera moves: tween position + orbit target between named presets with an ease-in-out curve.
- One accent color, light theme, floating glass cards (`backdrop-filter: blur`), rounded 16–18px corners, soft long shadows.
- It must run as a static site (no backend) and load Three.js from a CDN.

If you want a working reference, there's a primitive-geometry implementation of exactly this (same object names, same `simulate()` model) here: **https://github.com/yexnnnnn/heat-journey** → `threejs-prototype-v2/index.html`. Swap the primitives for the Blender `.glb` and keep the rest.
