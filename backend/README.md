# Backend

FastAPI app: API (PLAN.md §3), on-demand simulation, planner. Everything in memory.

## Run

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs. Quick try:

```bash
curl -X POST localhost:8000/api/plan/start-positions
curl -X POST localhost:8000/api/sim/control -H 'content-type: application/json' -d '{"action":"start","speed":60}'
curl localhost:8000/api/state
```

## Tests

```bash
uv run pytest -q
```

## Planner: smart vs dumb

`SmartPlanner` is the default. Run the M1 baseline instead with `PLANNER=dumb uv run uvicorn app.main:app --port 8000`.

How SmartPlanner works:
- **Belief** = P(fault of type t in cell). Prior from reports (confidence × w(type), spread thinner over big polygons), forest share of the 30 m corridor, storm footprint, dead lines. Every observation is a Bayes update per type, using the published sensor specs.
- **Value of a look** = expected detections = Σ_t p_t · p_detect_t (air or landed). Faults already above the crew threshold are worth nothing more. That one number drives everything below.
- **Start positions**: greedy, one drone at a time. Each drone gets the start whose real first flight collects the most value; cells already covered by an earlier drone count only 15 %. The first flights are then flown exactly as planned.
- **Routes**: greedy runs along lines, ranked by value / time. Transit counts 4× (nothing is inspected while transiting). The flight always keeps enough battery to land on a live line with a 5 min reserve. The landing spot is chosen for what landed-only sensors can still find there, the value left nearby for the next flight and p_live.
- **Sensor use**: uncertain findings pull the next charged flight to land on that cell to confirm. While charging, a drone makes short take-off/land hops to nearby cells where only landed sensors help (galloping/sag in the report 06 area). A dead line found by landing is dropped as a charging spot for all drones.

Comparison on the default scenario, 4 h sim, seeds 1–10 (`uv run python scripts/compare_planners.py 4 1 2 3 4 5 6 7 8 9 10`). Times are the first detection of each fault, averaged over the runs that found it:

| planner | faults found (of 4) | mean time to detection | F1 vegetation (report 02) | F2 hotspot (report 05) | F3 galloping (landed only) | F4 vegetation (forest, no report) | cells inspected | landings |
|---|---|---|---|---|---|---|---|---|
| dumb | 1.7 | 190 min | 10/10, 226 min | 7/10, 139 min | 0/10 | 0/10 | 210 | 15 |
| **smart** | **2.5** | **124 min** | **10/10, 7 min** | 7/10, 216 min | **8/10, 191 min** | 0/10 | 159 | 17 |

Smart finds the report 02 vegetation fault in about 7 minutes instead of almost 4 hours. One drone also lands to confirm the finding, which triggers the "send crew" recommendation. Smart also finds the galloping fault, which you can only detect after landing, in 8 of 10 runs; Dumb never does. Smart inspects fewer cells because it skips low-risk lines. Neither planner reaches F4 in 4 h. Caveats: there are only 4 faults and the result is sensitive to the tuning. With the transit weight set to 3 or 6 instead of 4, no drone gets stationed in the report 06 area and galloping is missed. Treat the numbers as an illustration, not a benchmark. Compute time is about 3 s for a 4 h sim with either planner.

## Frontend mocks / OpenAPI

After changing `app/models.py` (= the contract), regenerate and commit:

```bash
uv run python scripts/export_mocks.py   # -> frontend/src/mocks/{static,state}.json, frontend/openapi.json
```

## Layout

- `app/models.py` Pydantic models = API contract
- `app/data.py` loads `resources/`, splits lines into ~500 m cells, default operator inputs
- `app/planner/` (never imports `sim/`): `Planner` interface + `DumbPlanner` (M1 baseline: nearest unchecked line) in `__init__.py`; `smart.py` `SmartPlanner` (default); `risk.py` prior per fault type + pure Bayes updates; `start_positions.py` greedy max-coverage; `missions.py` greedy routes, landing choice, dead-line hop; `recommend.py` §4.5 recommendations
- `app/sim/engine.py` sim stepping (1 s steps, wall time x speed, seeded), cell inspection, findings
- `app/sim/sensors.py` sensor model: ground truth -> noisy `Observation` (air per cell, landed per cell, magnetometer)
- `app/main.py` endpoints
- `scenarios/*.json` `SimConfig` presets (ground truth + sensor/drone params); `default.json` is loaded at start. Listed by `GET /api/sim/presets`, fetched by `GET /api/sim/presets/{name}` (sim-setup view)
