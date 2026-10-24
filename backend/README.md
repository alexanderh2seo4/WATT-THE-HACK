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

## Frontend mocks / OpenAPI

After changing `app/models.py` (= the contract), regenerate and commit:

```bash
uv run python scripts/export_mocks.py   # -> frontend/src/mocks/{static,state}.json, frontend/openapi.json
```

## Layout

- `app/models.py` Pydantic models = API contract
- `app/data.py` loads `resources/`, splits lines into ~500 m cells, default operator inputs
- `app/planner/` `Planner` interface + `DumbPlanner` (M1: nearest unchecked line), `risk.py` pure Bayes updates, `recommend.py` §4.5 recommendations (never imports `sim/`)
- `app/sim/engine.py` sim stepping (1 s steps, wall time x speed, seeded), cell inspection, findings
- `app/sim/sensors.py` sensor model: ground truth -> noisy `Observation` (air per cell, landed per cell, magnetometer)
- `app/main.py` endpoints
- `scenarios/default.json` default `SimConfig` (ground truth + sensor/drone params)
