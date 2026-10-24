# Frontend

React + Vite + TypeScript, `react-map-gl` (MapLibre, OpenFreeMap Positron basemap), Tailwind v4, react-router.

Routes: `/` operator view, `/setup` simulation setup.

## Run

```bash
npm install
npm run dev            # http://localhost:5173, proxies /api -> http://localhost:8000
VITE_MOCK=1 npm run dev  # no backend: serves src/mocks/static.json + state.json
npm run build          # type-check + production build
```

Mock mode works even if the mock files are missing (empty data). Play/pause/speed update the clock locally.

## API types

`src/api-types.ts` is generated from `openapi.json` (`npm run gen:types`; rerun when the backend contract changes).
`src/api.ts` aliases those types (tightening GeoJSON / `[lon, lat]` fields) and adds fetch helpers and the `usePolling` hook (GET `/api/state` every 500 ms).

If the basemap can't be fetched (offline), the map falls back to a blank background so our layers still render.

## Layout

- `src/api.ts`: types, fetch helpers, mock mode, `usePolling` / `useStatic`
- `src/store.tsx`: one shared store (static data + latest state) for both views
- `src/components/Map/`: shared map fitted to the study bounds; layers go in as children (`NetworkLayer` draws grid + storm)
- `src/components/TopBar/`: sim clock, play/pause, speed (1×, 10×, 60×, 300×), reset
- `src/views/Operator/`: stepper (inputs → start positions → run), stats, log (click → fly to), risk layers (cell risk via feature-state), drones (rAF-interpolated markers + client-side trails), legend
- `src/views/SimSetup/`: simulation setup page
