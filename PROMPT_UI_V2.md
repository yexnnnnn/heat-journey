# UI Prompt — "Follow the Heat" (a cinematic, emotional counterpart to an engineering digital twin)

Give this whole file to a developer or an AI coding assistant. It specifies a **brand-new front-end experience**, deliberately different from a technical digital twin. There is a sibling project ("ThermalLoop AI Center") that already nails the rigorous engineering side — a physics backend, dense dashboards, floor-by-floor cutaways. **Do NOT rebuild that.** This project is its opposite number: the experience a non-engineer remembers.

If the ThermalLoop backend is available, **reuse it as the data source** (`GET /api/scene`, `GET /api/config`, `POST /api/simulate`, stable IDs like `gpu_f1_rack_001`, `hx_b2_primary_001`, `zone_greenhouse_soil`). If it isn't, ship the same tiny client-side `simulate()` model described at the end so the site runs standalone. Either way, the *front end* is the whole deliverable here.

---

## 0. One-sentence brief

> **A cinematic, almost wordless journey that follows a single drop of water as it carries one rack's heat from a GPU all the way to a tomato plant — so that a 12-year-old, a journalist, or an investor walks away *feeling* why data-center heat reuse matters.**

Audience: the general public, students, press, non-technical stakeholders. Success = emotional "oh, I get it" + one shareable screenshot, NOT numerical completeness. This is the heart to the engineering twin's brain.

## 1. The core creative idea (this is what makes it different)

**You play as a drop of water.** The camera is (mostly) *inside the loop*, travelling with the heat, not orbiting a building from outside. The whole piece is a continuous ride broken into chapters, like a nature documentary shot from the water's point of view.

Three signature moves the engineering twin does NOT have:

1. **First-person "heat POV" camera.** A continuous spline the camera flies along: chip → cold plate → riser → heat exchanger → heat pump → buried pipe → greenhouse soil → up through a tomato root. The building is something you travel *through*, revealed in cutaway as you pass, not a static model you rotate.

2. **A near-wordless HUD built from visual metaphors, not dashboards.** Replace numbers with felt quantities:
   - Temperature = the color *of the world around you* (you literally travel through a blue→red tube; the glow warms as heat is picked up, cools as it's spent).
   - "How much heat" = how fast the world streaks past + particle density, not a kW readout.
   - "Is it hot enough?" = a single **thermometer gate** the drop must clear to enter a room; if it falls short, the gate stays shut and a heat-pump "elevator" visibly lifts you.
   - At most ONE number on screen at a time, and only when it lands emotionally (e.g. a kettle counter: "= 20 kettles boiling, forever").

3. **An emotional ending with consequence.** The ride ends at a choice: you decide how the building runs (one knob, not a console), and the world *responds physically* — the greenhouse either flourishes (plants green, snow melts outside) or the heat is dumped to the sky as visible waste steam while the tomato wilts. Same facts as the engineering twin, but you *feel* the trade-off.

## 2. Structure — a continuous ride in 6 "beats" (not slides)

The experience auto-plays like a film with a scrubbable timeline, but the viewer can pause and nudge one control per beat. Each beat is a segment of the same camera spline.

| Beat | Where the camera is | What the viewer feels / does | The single idea |
|---|---|---|---|
| **1 · Birth** | Hovering over a dark campus at dawn; then plunging toward one GPU | Awe + scale. Tap to "drop in." | This building breathes heat. |
| **2 · Pickup** | *Inside* a cold plate on a glowing chip; the world turns orange around you | The tube warms from blue to orange as you absorb heat. One kettle-counter number blooms, then fades. | Electricity becomes heat — all of it. |
| **3 · The ride** | Streaking through risers and down into the plant room with the current | Speed + flow. A **flow dial** the viewer can nudge: slower = the world glows hotter around you. | Water carries the heat; it never vanishes. |
| **4 · The gate** | Arriving at three glowing doorways (robot lab 35°, greenhouse 45°, homes 65°) | **The thermometer-gate moment.** Your current temperature is a glowing bar; doors you can't reach stay shut. Pull the "heat-pump elevator" lever to rise and unlock the top door. | Heat has a *quality*, not just a quantity. |
| **5 · Arrival** | Bursting up through soil into a greenhouse at night, snow outside | Payoff + warmth. Camera rises along a tomato stem; frost retreats from the glass. | Waste heat becomes life. |
| **6 · Your call** | Pull back to a calm diorama of the whole campus | **One decision:** a single slider "Run it cold & safe ↔ Run it warm & generous." The world responds live: plants thrive vs. steam wasted to sky. A one-line verdict. | Every choice is a trade-off. |

No quizzes. No tabs full of metrics. The viewer touches exactly one control per beat.

## 3. Art direction (make it look like a film, not an app)

- **Painterly / stylized, not technical.** Think a Pixar-ish cross-section diorama at golden hour, or a cozy "tiny planet" campus. Soft depth-of-field, warm key light, volumetric god-rays in the plant room, gentle bloom on hot surfaces.
- **Mood shifts with the story:** cool dawn blues (beat 1) → hot amber core (beat 2–3) → warm green life (beat 5). Let the *background and lighting* carry the temperature story, not a legend.
- **HUD is a thin, elegant overlay:** a single progress "ribbon" at the bottom shaped like the pipe itself; a small floating caption (one short line, fades in/out); the current control as one tactile knob/lever. Lots of empty space. No panels of figures.
- **Typography:** one friendly humanist sans, large, few words. Captions read like a documentary narrator, present tense, ≤ 12 words. (Optional: real voiceover / ambient sound — water, fans, a greenhouse at night.)
- **Deliberately the inverse of a dark engineering dashboard.** If the twin is a cockpit, this is a window.

## 4. Interaction & technical spec

- **Stack:** React + TypeScript + React Three Fiber (+ drei). This matches the sibling project so assets/IDs are reusable.
- **Camera:** a single authored `CatmullRomCurve3` "heat path." Camera position follows a scroll/time parameter `u ∈ [0,1]`; look-at leads slightly ahead on the curve. Auto-play advances `u`; scroll or the bottom ribbon scrubs it; it snaps to the 6 beat anchors. Add a gentle handheld noise so it feels filmed. Provide a "cinematic ↔ free orbit" toggle for people who want to look around.
- **The tube world:** render the active pipe as a `TubeGeometry` the camera travels *inside*; its emissive color = current water temperature (blue→red ramp). Flow particles stream past the camera; density/speed scale with flow and load.
- **The thermometer gate (beat 4):** three doors with a required-temperature threshold each. The drop's current temperature is a vertical glowing bar. A door opens only if `temp ≥ need`. The "heat-pump elevator" is a literal lift platform that raises the bar (and visibly costs a little spark of electricity) — teaching COP without the letters "COP."
- **The one ending knob (beat 6):** a single slider mapped to coolant supply temperature (cool/safe ↔ warm/generous). Drive two *visible* outcomes from the sim: (a) greenhouse vitality (plant color, frost on/off, soil glow) and (b) wasted heat (volume of steam plumes from the dry cooler). Show one plain-language verdict line, e.g. *"Warm & generous: the greenhouse thrives, but the chips run hotter."* No table.
- **Data binding:** if the ThermalLoop API is present, call `POST /api/simulate` and read per-ID `pipe_states` (`temperature_C`, `mass_flow_kg_s`) and zone delivery to drive tube color, particle speed, gate thresholds, and the ending outcomes. Reuse its stable IDs so the two front ends are swappable on the same backend. If the API is absent, use the fallback model in §6.
- **Accessibility & honesty:** keep the one-number-at-a-time captions truthful (this mirrors a real, if simplified, model — never show fabricated figures as measured). Offer captions + reduced-motion mode (less camera shake, option to step beats instead of fly). Must run as a static site and degrade gracefully if WebGL/CDN fails (show a short explainer image + text).

## 5. What to reuse vs. invent

- **Reuse:** the backend simulation, the config contract, stable object/pipe/zone IDs, and (if exported) the GLB geometry from the sibling project. Don't duplicate the physics — be its friendly face.
- **Invent (your real work):** the heat-POV camera spline, the tube-interior rendering, the thermometer-gate mechanic, the metaphor HUD, the lighting/mood arc, the emotional ending. These are the parts the engineering twin intentionally doesn't have.

## 6. Fallback `simulate(state)` model (only if no backend is available)

Illustrative teaching physics, clearly labeled, deterministic:
- IT heat `Q = 1000·load` kW; ~100% of electricity → heat.
- Coolant rise `dT = 10·load·(0.6/flow)`; return `Tr = supply + dT`; secondary `T2 = Tr − 3`.
- Chip temp `= supply + dT + 22·load + 3`; **throttles above 85°C**.
- Heat-pump lift `COP ≈ clamp(0.42·338 / max(65 − T2 + 8, 6), 1.5, 7)` — warmer input, cheaper lift.
- Users & needs: robot lab 35°C, greenhouse 45°C, district 65°C. Direct if `T2 ≥ need`, else via heat pump if enabled, else unmet.
- Outcomes for the ending: `recovery %`, `wasted heat (kW)`, `greenhouse served %`, `chip temp`. Map these to visuals, not readouts.

## 7. Definition of done

A stranger can open the link, watch/scrub a ~90-second ride, touch ~6 simple controls, never read a table, and afterwards explain in one sentence why reusing data-center heat is worth doing — and share a single beautiful frame of a tomato growing on a server's warmth.
