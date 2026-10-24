# Plan (draft v2, for team iteration)

> Status: draft. Decisions so far are in §8; anything marked **[DECIDE]** is still open (§9). Assumptions go in [`ASSUMPTIONS.md`](./ASSUMPTIONS.md).

## 1. Idea in one paragraph

A web app that turns vague storm reports into a **risk map** of the grid. The operator imports the reports (polygons plus fault type and confidence), marks any lines already known to be dead, and presses **Find start positions**. After that the backend plans everything: where the five sensor packages start, where they fly and where they land to charge. The operator watches the drones on the map: which line sections have been checked, a log of take-offs, landings and findings, and recommendations for when to send a crew. Every drone observation updates the risk map, and the plan follows. For example, a drone that lands on a dead line changes the risk map and the charging options for all the other drones.

A second view sets up the **simulation ground truth**: dead lines, real faults and sensor detection probabilities. The planner never sees this ground truth, only the drone observations.

| Task question | Where we answer it |
|---|---|
| What would you measure? | Sensor model (§4.4) + pitch slide on sensors |
| Where would you look first? | Risk map + start-position optimiser (§4.2, §4.3) |
| What happens next? | Bayesian risk update + replanning on every observation (§4.3) |
| When would you act? | Recommendation thresholds shown in the log (§4.5) |

## 2. Architecture: one backend process, one state object, frontend just renders

```
Frontend (React + MapLibre)                Backend (one FastAPI process)
┌──────────────────────────┐   GET /api/static (once)   ┌──────────────────────────────┐
│ Operator view            │ ─────────────────────────▶ │ api.py      ~6 endpoints      │
│ Sim-setup view           │   GET /api/state (500 ms)  │ planner/    reports+events →  │
│ one store = last /state  │ ─────────────────────────▶ │             risk, missions    │
│ animates drones between  │   POST commands            │ sim/        ground truth,     │
│ snapshots                │ ─────────────────────────▶ │             drones, sensors   │
└──────────────────────────┘                            └──────────────────────────────┘
```

Design choices (all for simplicity):

1. **Simulation in the backend, as a separate module.** One clock, one language for geometry, no syncing. **`planner/` never imports `sim/`.** The sim talks to the planner only through the interface in §3.3. Real drones could later post the same `Event`s.
2. **Polling instead of WebSockets.** The frontend calls `GET /api/state` every 500 ms. That means no reconnect logic and no message types. A mock backend is just a static JSON file. We switch to WS only if it ever feels slow (it won't at 5 drones × ~400 cells).
3. **No background thread.** The sim advances **on demand**. Each `GET /api/state` steps the sim forward by `wall time since last call × speed`, in fixed 1 s sim steps. Pause = stop the clock. There's no concurrency and no locking.
4. **Deterministic.** The sim config contains a `seed`. Same config → same demo run. That matters for rehearsing the pitch.
5. **One snapshot = whole truth for the UI.** The frontend never computes anything. It renders the latest `State` and smoothly interpolates drone positions between snapshots, so movement looks fluid even at 300× speed.
6. **Everything in memory.** No database. Scenario presets are JSON files.

### Repo layout

```
backend/
  app/main.py          FastAPI app + all endpoints (small enough for one file)
  app/models.py        Pydantic models = THE contract (§3)
  app/data.py          load resources/ + external/vegetation.geojson, build cells
  app/planner/         risk.py, start_positions.py, missions.py
  app/sim/             engine.py (step function), sensors.py
  scenarios/*.json     sim presets (ground truth + params)
  tests/               a few smoke tests
frontend/
  src/api.ts           types (generated from /openapi.json) + fetch helpers + usePolling hook
  src/mocks/           static.json, state.json (so FE works before BE exists)
  src/components/Map/  shared map (both views)
  src/views/Operator/
  src/views/SimSetup/
resources/external/    vegetation.geojson (one-off OSM Overpass export)
```

## 3. API contract (agree on this first)

`models.py` is the single source of truth. FastAPI serves `/openapi.json`, and `openapi-typescript` generates the frontend types. The frontend starts against `src/mocks/*.json`, which have the same shapes.

### 3.1 Endpoints (that's all of them)

| Method | Path | Body / Returns |
|---|---|---|
| GET | `/api/static` | `Static`: network + context, fetched once |
| GET | `/api/state` | `State`: everything that changes, polled |
| PUT | `/api/inputs` | `OperatorInputs`: replaces the operator's reports + known dead lines, recomputes risk |
| POST | `/api/plan/start-positions` | → `StartPosition[]` (also visible in `State`) |
| GET / PUT | `/api/sim/config` | `SimConfig`: ground truth + params (sim-setup view only) |
| POST | `/api/sim/control` | `{ "action": "start" \| "pause" \| "resume" \| "reset", "speed"?: 1-600 }` |

### 3.2 Objects

```jsonc
Static {
  "segments": FeatureCollection,      // props: segment_id, voltage_kv, length_km, from_node, to_node
  "cells":    FeatureCollection,      // ~500 m pieces, props: cell_id "LINE_001#03", segment_id
  "nodes":    FeatureCollection,      // props: node_id, node_type
  "storm":    Feature,                // synthetic footprint
  "default_inputs": OperatorInputs,   // the 6 given reports + LINE_024 dead, for "load defaults"
  "vegetation": FeatureCollection     // optional layer
}

State {
  "t": 5400, "speed": 60, "status": "setup|running|paused",
  "drones": [{ "drone_id": "D1", "position": [lon, lat], "heading": 123,
               "status": "charging|flying|landing|stranded",
               "battery_min": 0-30, "segment_id": "LINE_004" | null,
               "route": [[lon, lat], ...] }],          // planned path of current flight, for drawing
  "cells":    [{ "cell_id": "...", "risk": 0.0-1.0, "inspected": "none|air|landed",
                 "top_fault": "vegetation" | null }],
  "segments": [{ "segment_id": "...", "p_live": 0.0-1.0 }],
  "inputs": OperatorInputs,
  "start_positions": StartPosition[],
  "events": Event[]                                    // full log, newest last (a few hundred, fine)
}

OperatorInputs { "reports": Report[], "known_dead_segments": ["LINE_024"] }   // defaults: the 6 reports + LINE_024
Report        { "report_id", "polygon": Polygon, "fault_types": FaultType[], "confidence": 0-1, "text" }
StartPosition { "drone_id", "segment_id", "position": [lon, lat], "reason": "covers report 02 + 14 km forest" }
Event         { "t", "type": "takeoff|landing|finding|line_dead|recommendation|stranded",
                "drone_id"?, "cell_id"?, "segment_id"?, "fault_type"?, "confidence"?, "message" }
FaultType     = "vegetation" | "sag" | "ice" | "galloping" | "hotspot" | "broken_conductor"

SimConfig {
  "seed": 42,
  "dead_segments": ["LINE_012"],   // hidden ground truth; operator's known_dead_segments are also dead in the sim
  "faults": [{ "fault_id": "F1", "segment_id": "LINE_012", "position": [lon, lat], "fault_type": "vegetation" }],
  "sensors": { "vegetation": { "p_detect_air": 0.8, "p_detect_landed": 0.6, "p_false_positive": 0.02 }, ... },
  "drone":   { "speed_inspect_mps": 10, "speed_transit_mps": 16, "max_flight_min": 30,
               "full_charge_min": 180, "landing_min": 3, "start_battery_min": 30 }
}
```

Every `Event` has a human-readable `message`, so the log renders it as is. Adding a new event type needs no frontend change.

### 3.3 Internal contract: simulator ↔ planner

```python
class Planner:
    def set_inputs(self, inputs: OperatorInputs) -> None          # reports + known dead lines
    def start_positions(self, n: int = 5) -> list[StartPosition]
    def on_event(self, event: Event) -> None                       # drone observations
    def next_route(self, drone: DroneState) -> list[Waypoint] | None  # called when a drone may fly
    def cell_states(self) -> list[CellState]; def segment_states(self) -> list[SegmentState]
```

This is the main point of **adaptability**. Backend people can swap the planning strategy (greedy → smarter) without touching the API or the frontend. The first version can be a 20-line dumb planner.

## 4. Logic

### 4.1 Discretisation
We split every segment into **cells of about 500 m**, roughly 400 cells for the 198 km. Risk, coverage and findings are all tracked per cell.

### 4.2 Risk map (prior)
`risk(cell) = 1 − Π(1 − p_i)` over independent contributions:
- **Reports**: if the cell lies inside a report polygon, `p = confidence × w(type)`. We spread this over the cells in the polygon, so a big vague polygon gives a lower per-cell risk.
- **Vegetation**: the share of the cell's 30 m buffer covered by OSM `landuse=forest` / `natural=wood` / `natural=tree_row`.
- **Storm footprint**: a multiplier inside the polygon, damped outside.
- **Known dead lines** (operator input, pre-filled with LINE_024 from report 03): `p_live = 0`, the line can't be used for charging, and its risk goes up. A known dead line is still worth inspecting, because the fault that tripped it may be on it. Operator knowledge is treated as true, so the sim also treats these lines as dead.
- Stretch: line voltage (110 kV lines are lower and closer to trees), DEM exposure.

### 4.3 Planning
- **Start positions**: greedy max-coverage. We pick 5 points on lines with high `p_live` and maximise the expected risk reachable within one flight. We penalise overlap between drones. Every choice comes with a human-readable `reason`.
- **Routes (one flight)**: greedy on the line graph. A drone flies along cells (inspecting) or cuts straight across (transit, faster). It picks the next cell by `expected risk reduction / time`. The flight must end on a cell with high `p_live`, and the drone keeps a 5 min reserve so it can hop on if its landing line turns out to be dead.
- **Belief update** after each observation (Bayes per cell):
  - Air pass, no finding: `p ← p·(1−pd) / (p·(1−pd) + (1−p))`
  - Finding: `p ← p·pd / (p·pd + (1−p)·pfp)`. Uncertain findings → the planner schedules a confirmation (second pass or landing)
  - Landing → current sensor: `p_live` becomes 0 or 1. A dead line raises risk on that segment and its neighbours, and is removed as a charging spot for **all** drones.
- **Charging**: linear (1 min of flight = 6 min of charge). Partial charges are allowed.

### 4.4 Sensors (pitch material + sim parameters)
Base kit from the real Nomad: RGB camera (air), current sensor, IMU/inclinometer (sag), accelerometer (galloping), conductor temperature (all **landed only**). Proposed additions, for the creativity criterion:
- **Thermal camera**: hotspots from the air (report 05).
- **Acoustic/ultrasonic sensor**: ticking/arcing.
- **50 Hz magnetometer**: estimates line current from the air. This is a proposed sensor, not a Nomad feature. It would reduce the risk of landing on a line we can't charge on. An E-field sensor alone isn't enough: it detects voltage, while inductive charging needs current. On double-circuit towers, a reading from the air can't tell which circuit is live, so landing still confirms.

**[DECIDE]** which extras we model. Each extra is just another entry in `SimConfig.sensors`.

### 4.5 When to act (recommendations)
- `risk > 0.8` after a confirmed finding → **"Send repair crew to LINE_x km y"**
- `0.4–0.8` → **"Needs confirmation"**, and the planner schedules a landing or second pass
- Segment dead + no finding along it → **"Inspect from ground / check protection"**
- All cells in an area covered and below threshold → **"Area cleared"**

These are `recommendation` events in the log and markers on the map.

## 5. Frontend experience

Principles: **one screen, one main action at a time, everything else stays out of the way.**

- **Two routes** (`/` operator, `/setup` simulation). Both use the same map component, the same polling hook and the same store.
- **Operator flow as a 3-step stepper** in the sidebar: ① Inputs (load defaults / upload report GeoJSON, no drawing for now; click a line → "known dead", shown as a removable chip list) → ② Find start positions (markers appear with their `reason` as tooltips) → ③ Run (live view). The current step is highlighted, and later steps are greyed out until they're possible.
- **Map**: lines coloured by risk (yellow → red), checked & clear = calm grey-green, dead lines dashed, report polygons faint, drones as icons with a battery ring, flown path fading behind each drone, planned route as a thin dotted line.
- **Log**: newest on top, findings and recommendations highlighted. Clicking an entry flies the map to it.
- **Small top bar on both views**: sim clock, play/pause, speed (1× · 10× · 60× · 300×).
- **Sim-setup view**: click a line → popover "mark dead (hidden) / add fault here". Lines the operator marked as known dead are shown as dead here too, but read-only. A form for sensor and drone parameters. A preset dropdown (load/save scenario JSON).
- **Smoothness**: drone positions are interpolated between polls with `requestAnimationFrame`. Polling never blocks the UI.
- Stack: React + Vite + TS, `react-map-gl` + MapLibre, free vector basemap (OpenFreeMap / Carto Positron), shadcn/ui (or Mantine) + Tailwind. Light, clean, few colours: risk is the only strong colour on the map.

## 6. Team split (2 frontend, 2 backend)

| Who | Workstream | Owns | First deliverable |
|---|---|---|---|
| **FE1** | Operator view | map component, layers, stepper, drone animation, log | map rendering `mocks/static.json` + `mocks/state.json` |
| **FE2** | Shared FE + sim setup | `api.ts` (types, polling hook), mocks, top bar controls, sim-setup view | generated types + mocks + polling hook |
| **BE1** | Planner | cells, vegetation export, risk prior, Bayes update, start positions, routes | `Planner` with dumb strategy, then the real one |
| **BE2** | API + sim | `main.py`, `models.py`, `data.py`, sim step function, sensors, presets | `/api/static` + `/api/state` with dummy moving drones |

Contract changes: a PR touching `models.py` + mocks, with a heads-up in the chat. **[DECIDE]** who owns slides/demo script (suggestion: whoever finishes their main path first; everyone contributes one slide).

## 7. Milestones

| # | Goal | Done when |
|---|---|---|
| M0 | **Contract & skeleton** | `models.py` + mocks merged, FE renders network from the real backend, drones move on screen |
| M1 | **Dumb end-to-end** | Fixed start positions, "nearest unchecked line" routes, sim detects faults, log shows events, pause/speed work |
| M2 | **Smart planning** | Real risk prior (reports + vegetation), greedy start positions, risk-driven routes, Bayes updates, dead-line handling, charging constraint |
| M3 | **Demo polish** | One scripted scenario with a clear story, recommendations, visuals, slides, assumptions & limitations |

Rule: after M1 the demo must always run on `main`.

### Demo scenario (draft)
- LINE_024 dead (given). One more dead line found by a drone landing on it → replanning visible.
- Vegetation fault inside the report 02 area (true positive).
- Hotspot inside the report 05 area (hard to see from the air → needs a landing or thermal camera).
- Report 04 flash = generator test (false alarm → area cleared).
- Report 06 = galloping on one span (found only when landed).
- One fault **outside** all report areas, in forest → found because of the vegetation layer. This shows that reports alone are not enough.

## 8. Decisions

| Topic | Decision |
|---|---|
| Sensor parameters | `p_detect_air`, `p_detect_landed`, `p_false_positive` per fault type (false negative = 1 − p_detect) |
| Report import | File upload (GeoJSON) + "load defaults" only. Drawing on the map is a stretch goal |
| Flight paths | Drones may fly cross-country in straight lines (transit). Inspection happens only when flying along a line |
| Wind limit (36 km/h) | Not modelled for now. Mentioned in limitations |
| Known dead lines | Set by the operator, treated as true by the sim too (§4.2) |

## 9. Still open **[DECIDE]**
1. Time horizon: `scenario_public_config.json` has `"scenario_window_hours": 4`, but nothing explains it. Ask the organisers. Until then the sim runs until paused. Either way each drone gets only a few flights, so the start positions matter a lot.
2. Which extra sensors (§4.4) do we model?
3. Who owns slides and the demo script (§6)?
