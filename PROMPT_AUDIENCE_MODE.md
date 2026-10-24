# UI Prompt — add an "Audience Mode" guided flow on top of ThermalLoop

Give this whole file to a developer or an AI coding assistant working **inside the existing ThermalLoop AI Center repo**. The goal is NOT a new project and NOT a new physics model. ThermalLoop already has a correct, tested simulation backend, a config contract with stable IDs, a React + TypeScript + React Three Fiber 3D facility, and an engineering dashboard. **Reuse all of it.** We are adding one thing: a second front-end layer — **Audience Mode** — so the same platform works for non-technical people (students, press, investors, the public), while the current engineering UI stays untouched as **Expert Mode**.

The experience must be **guided and highly interactive**: the visitor is led through the heat story in clear steps, and in every step they move **sliders / toggles** and immediately see **"change this → this happens"** consequences in both the 3D scene and a few big, friendly readouts. No quizzes. No wall of engineering metrics. No gimmicky "follow a water droplet" narration — this is a real control room made legible, not a cartoon.

---

## 0. One-line brief

> **A guided, slider-driven "Audience Mode" on top of ThermalLoop: the same real digital twin, re-presented so a non-engineer can turn a knob, watch the building react, and understand every trade-off in data-center heat reuse.**

A top-right toggle switches **Audience Mode ⇄ Expert Mode**. Expert Mode = today's dashboard, unchanged. Audience Mode = everything below. Both drive the *same* `POST /api/simulate` and render the *same* 3D scene; only the framing, guidance, and level of detail differ.

## 1. Reuse (do not rebuild)

- **Backend / physics:** `GET /api/config`, `GET /api/scene`, `GET /api/state`, `POST /api/simulate`. Audience Mode is just another caller of `/api/simulate`.
- **Stable IDs:** `gpu_f{1,2,3}_rack_NNN`, `pump_*_001`, `hx_b2_primary_001`, `tank_buffer_001`, `zone_robot_lab`, `zone_seed_storage`, `zone_seed_testing`, `zone_greenhouse_soil`, `pipe_*`, `sensor_*`. Use these to highlight objects and read per-ID `pipe_states` (`temperature_C`, `mass_flow_kg_s`), zone demand/delivery/unmet, buffer charge/discharge, pump & heat-pump electricity.
- **3D + cameras:** the existing `Architecture`, `ServerHall`, `InteriorEquipment`, `Greenhouse`, `Hydronics`, and `CameraRig` (auto-fit, isometric, front cutaway, per-floor, greenhouse, underground, walkthrough). Audience Mode scripts these existing presets; it does not author new geometry.
- **State:** extend the existing Zustand `store.ts` with an audience-mode slice (`mode`, `step`, `audienceInputs`, `savedPlan`). Don't fork the app.

## 2. What to build — an Audience Mode shell

A thin layer composed of four pieces, laid over the existing 3D canvas:

1. **A left "story card"** (one headline + ≤ 2 plain-english sentences for the current step). Large type, lots of whitespace.
2. **A bottom step bar** (progress through the guided flow; clickable to revisit completed steps; Back / Next).
3. **The interaction dock** (per step): the sliders/toggles for *this* step, plus a **consequence panel** that shows which outcomes moved and in which direction when the visitor changes something.
4. **A friendly readout strip** (3–5 big tiles, e.g. Power, Hottest chip, Heat reused %, Running cost) that reveal progressively as the story unlocks them — NOT the full engineering dashboard.

Expert users keep their current dense dashboard via the mode toggle.

## 3. The guided flow (7 steps) — each step = a camera move + 1–3 controls + live consequences

Every control calls `/api/simulate` (debounced) and updates the 3D scene and readouts live. The "consequence panel" compares the result *before vs. after* the change and shows arrows (▲/▼) with plain labels.

**Step 1 · The building.** Camera: auto-fit / isometric of the whole campus + greenhouse. Controls: none (orientation). Scene: label the 4 zones (compute, plant room, heat users, rejection) using existing IDs. Readout: one big tile — total IT power. Card: "This building turns electricity into computing — and a lot of heat."

**Step 2 · Heat is born.** Camera: front cutaway, focus a GPU floor (`gpu_f1_*`). **Control: GPU load slider** (maps to `gpu_load_base/peak_fraction` or `total_it_power_kW`). Consequence: as load rises, racks glow hotter, and the panel shows ▲ Power, ▲ Hottest chip, ▲ Heat produced. Card: "Almost all of that electricity becomes heat."

**Step 3 · Catching the heat.** Camera: front cutaway showing risers + HX (`hx_b2_primary_001`). **Control: liquid-capture slider** (`liquid_capture_fraction`). Consequence: higher capture → more heat into the water loop (pipes recolor warmer via `pipe_states`), less dumped to air; panel shows ▲ Liquid captured, ▼ Air-side loss. Card: "Water grabs the heat before it escapes into the air."

**Step 4 · Hot enough? (the quality step).** Camera: B2 / underground, focus HX + heat pump + the three zones. **Control: heat-pump toggle** (`heat_pump_enabled`) and a small "which users can we reach?" visual. Consequence: with the heat pump OFF, the 65°C user (`zone_*` district/homes) shows **unmet**; turning it ON lifts the temperature and the door "opens" (highlight the zone green), at the cost of ▲ heat-pump electricity. Card: "Some heat is warm enough as-is; some needs a boost." (Teaches temperature quality + COP without jargon.)

**Step 5 · Supply vs. demand over a day.** Camera: greenhouse + buffer tank (`tank_buffer_001`). **Control: time-of-day scrubber** (play the baseline-diurnal series) + **season selector** (`scenario_id` / `ambient_mean_C`). Consequence: a simple two-line chart (supply vs. demand) and the tank visibly charging/discharging; panel shows when there's surplus (store charges) vs. shortfall (store discharges). Card: "The building makes heat all day; the greenhouse mostly needs it at night."

**Step 6 · You run it (the payoff).** Camera: calm isometric of the whole site. **Controls (the full friendly console):** GPU load, coolant/supply temperature, season, heat-pump on/off, aux rejection on/off. The whole scene and all readouts react live. Add **"Save as Plan A"**, then let them change settings to compare **Plan A → B** with ▲/▼ on: Heat reused %, Hottest chip, Heat-pump electricity, Net running cost, Wasted heat. Card: "There's no perfect setting — only trade-offs. Try to reuse the most heat without cooking the chips." Optionally offer 2–3 one-tap goals ("maximise reuse", "lowest cost", "safest chips") that just preset the sliders and score the current result.

**Step 7 · What you changed.** Camera: back to auto-fit. Show a 3-line recap and the visitor's final numbers (reuse %, cost, hottest chip) pulled from the last `/api/simulate`. Offer "Play with the console again" (jump to Step 6) and "Switch to Expert Mode" (the full dashboard). Card: the three takeaways — electricity → heat; water moves it; temperature decides where it's useful.

## 4. The "change X → Y happens" mechanic (make this the star)

This is the heart of Audience Mode and the main ask. For every control:

- Debounce the slider, call `/api/simulate`, keep the previous result in state.
- Render a **consequence panel**: a short list of outcomes, each a row of `label · new value · ▲/▼ arrow` colored by whether it's good or bad for the obvious intent (e.g. chip getting hotter = red up-arrow; more heat reused = green up-arrow). Keep it to 3–5 rows per step so it stays legible.
- Mirror the change in 3D immediately: recolor pipes by `temperature_C`, scale flow-particle speed by `mass_flow_kg_s`, brighten/overheat GPU racks, open/close the "served" state of zones, raise/lower the buffer-tank fill, and show visible waste (dry-cooler plume / rejection) when heat is thrown away.
- Pull real cause→effect from the model, e.g.: **raise supply temperature** → more usable heat + cheaper heat pump (higher COP) **but** hotter chips; **lower it** → safe chips **but** a chiller kicks in and cost rises; **raise capture** → more reuse, less air loss; **turn off the heat pump** → the 65°C user goes unmet; **colder season** → higher demand, more reuse, less rejection.

Never fabricate values — read them from the backend result (`is_measured_data` stays false, as the platform already guarantees).

## 5. Look & feel

- Audience Mode should feel **lighter and friendlier** than the engineering dashboard, but it's the *same* world: keep the real 3D facility, add calm overlay cards, big readable numbers, one accent color, generous spacing, soft shadows. Think "guided museum exhibit on top of a real control room."
- Progressive disclosure: start with almost nothing on screen; reveal one readout tile per step as the story earns it; never show all engineering metrics at once in this mode.
- Temperature = color everywhere (reuse the existing hydronic temperature coloring), and always print the actual value next to the color so it's readable and color-blind-safe.
- Smooth, scripted camera transitions between the existing `CameraRig` presets (ease in/out). Provide a "let me look around" free-orbit toggle.
- Accessibility: captions, reduced-motion option (step instead of fly), keyboard arrows for Back/Next, graceful fallback text if WebGL/the API is unavailable.

## 6. Technical notes

- Add an `audience/` front-end folder: `AudienceMode.tsx` (shell + step router), `StoryCard.tsx`, `StepBar.tsx`, `InteractionDock.tsx`, `ConsequencePanel.tsx`, `Readouts.tsx`, and a `steps.ts` config describing each step (camera preset, focused IDs, which controls, which readouts, card copy).
- `steps.ts` is data-driven so copy/controls can be tuned without touching logic — mirror how the backend/config is the single source of truth.
- Reuse the existing `/api/simulate` request shape; map each audience control to a request field or `overrides.*` path (e.g. `controls.heat_pump_enabled`, `liquid_capture_fraction`, `total_it_power_kW`, `ambient_mean_C`, `scenario_id`).
- Debounce simulate calls (~150–250 ms); show a subtle "updating…" shimmer, cache the previous result for the consequence diff.
- Keep Expert Mode exactly as-is; the mode toggle only swaps the overlay UI and the camera script, not the scene or the backend.

## 7. Definition of done

A non-engineer opens the platform in Audience Mode, is guided through 7 short steps, moves a handful of sliders/toggles, watches the real 3D twin and a few big numbers react with clear "if I do this, that happens" feedback, finishes by running the building themselves and comparing two plans — and can switch to Expert Mode to see it's all backed by the real ThermalLoop simulation.
