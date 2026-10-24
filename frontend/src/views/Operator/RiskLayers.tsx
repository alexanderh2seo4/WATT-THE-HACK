// Static-ish map layers of the operator view: vegetation, storm, report areas, risk-coloured cells,
// dead lines, planned routes. Cells are drawn once from /api/static; risk + inspection come in as
// MapLibre feature-state (cheap per-poll update of ~420 cells, no re-tiling).
import { useEffect, useMemo, useRef } from 'react'
import { Layer, Source, useMap } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { FeatureCollection, LineString, Polygon } from 'geojson'
import type { LonLat, State, Static } from '../../api'
import { DEAD_COLOR } from '../../components/Map'

/**
 * Fault-risk ramp. Stops sit at log-ish, data-informed breakpoints: after "Load defaults" the median cell
 * is ~5% and the 90th percentile ~20%, so a linear 0..1 ramp painted almost everything the same yellow.
 * Each stop is a distinct hue and strictly darker than the one before (CIE L* 87 > 79 > 69 > 56 > 44 > 27),
 * so the order also reads without hue. 40% / 80% line up with the "confirm" / "send crew" thresholds.
 */
export const RISK_STOPS: [number, string][] = [
  [0.02, '#eed980'], // pale straw  (prior floor)
  [0.05, '#f5bc35'], // yellow-amber
  [0.1, '#f59018'], // amber-orange
  [0.2, '#e35b17'], // orange
  [0.4, '#c9252c'], // red        (confirm)
  [0.8, '#7f1131'], // crimson    (send crew)
]
export const CLEAR_COLOR = '#6b9a7f'
/** Inspected cells below this risk are drawn "calm grey-green". */
const CLEAR_BELOW = 0.3

const risk: ExpressionSpecification = ['coalesce', ['feature-state', 'risk'], 0]
const cellColor: ExpressionSpecification = [
  'case',
  ['all', ['!=', ['coalesce', ['feature-state', 'insp'], 'none'], 'none'], ['<', risk, CLEAR_BELOW]],
  CLEAR_COLOR,
  ['interpolate-lab', ['linear'], risk, ...RISK_STOPS.flat()],
]
/** px by risk (low..high), growing with zoom: ~2.2..6 at the default view, up to 4..9 zoomed in */
const byRisk = (lo: number, hi: number): ExpressionSpecification => ['interpolate', ['linear'], risk, 0, lo, 1, hi]
const cellWidth: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 8, byRisk(1.75, 5), 10, byRisk(2.5, 6.5), 13, byRisk(4, 9)]
const deadWidth: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 10, 3.5, 13, 5]
const routeWidth: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 8, 2, 10, 2.75, 13, 4]
const nodeRadius: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 10, 3, 13, 4.5]

/** Dead = backend says p_live == 0, or operator marked it known dead. */
export function deadSegments(state: State | null): string[] {
  if (!state) return []
  const dead = new Set(state.inputs.known_dead_segments)
  for (const s of state.segments) if (s.p_live === 0) dead.add(s.segment_id)
  return [...dead].sort()
}

export function RiskLayers({
  staticData,
  state,
  showVegetation,
  hoveredReports = [],
}: {
  staticData: Static
  state: State | null
  showVegetation: boolean
  /** report ids under the cursor, most specific first: all get a stronger outline, the first a slightly stronger fill */
  hoveredReports?: string[]
}) {
  const { current: map } = useMap()
  const applied = useRef<{ src: unknown; cells: Record<string, string> }>({ src: null, cells: {} })

  // push cell risk / inspection into feature-state, only for cells that changed
  useEffect(() => {
    const m = map?.getMap()
    const src = m?.getSource('cells')
    if (!m || !src || !state) return
    if (applied.current.src !== src) applied.current = { src, cells: {} } // source (re)created -> reapply all
    const done = applied.current.cells
    for (const c of state.cells) {
      const key = `${c.risk}|${c.inspected}`
      if (done[c.cell_id] === key) continue
      done[c.cell_id] = key
      m.setFeatureState({ source: 'cells', id: c.cell_id }, { risk: c.risk, insp: c.inspected })
    }
  }, [map, state])

  const deadKey = deadSegments(state).join(',')
  const deadFilter = useMemo(() => ['in', ['get', 'segment_id'], ['literal', deadKey ? deadKey.split(',') : []]], [deadKey])
  const aliveFilter = useMemo(() => ['!', deadFilter], [deadFilter])

  const hoverKey = hoveredReports.join(',')
  const hoverFilter = useMemo(
    () => ['in', ['get', 'report_id'], ['literal', hoverKey ? hoverKey.split(',') : []]] as ExpressionSpecification,
    [hoverKey],
  )
  // only the most specific one gets the fill: the broad study-area report would otherwise tint the whole map
  const topFilter = useMemo(
    () => ['==', ['get', 'report_id'], hoverKey.split(',')[0] ?? ''] as ExpressionSpecification,
    [hoverKey],
  )

  const reportsKey = JSON.stringify(state?.inputs.reports ?? [])
  const reports = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: (JSON.parse(reportsKey) as State['inputs']['reports']).map((r) => ({
        type: 'Feature',
        properties: { report_id: r.report_id },
        geometry: r.polygon,
      })),
    }),
    [reportsKey],
  )

  const routesKey = JSON.stringify(
    (state?.status === 'setup' ? [] : (state?.drones ?? []))
      .filter((d) => d.status === 'flying' && d.route.length > 1)
      .map((d) => d.route),
  )
  const routes = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: (JSON.parse(routesKey) as LonLat[][]).map((coordinates) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      })),
    }),
    [routesKey],
  )

  return (
    <>
      {staticData.vegetation && (
        <Source id="vegetation" type="geojson" data={staticData.vegetation}>
          <Layer
            id="vegetation-fill"
            type="fill"
            layout={{ visibility: showVegetation ? 'visible' : 'none' }}
            paint={{ 'fill-color': '#65a30d', 'fill-opacity': 0.08 }}
          />
        </Source>
      )}
      {staticData.storm?.geometry?.coordinates?.length > 0 && (
        <Source id="storm" type="geojson" data={staticData.storm}>
          <Layer
            id="storm-line"
            type="line"
            paint={{ 'line-color': '#64748b', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.45 }}
          />
        </Source>
      )}
      <Source id="reports" type="geojson" data={reports}>
        <Layer id="reports-fill" type="fill" paint={{ 'fill-color': '#6366f1', 'fill-opacity': 0.035 }} />
        <Layer id="reports-line" type="line" paint={{ 'line-color': '#6366f1', 'line-width': 1, 'line-opacity': 0.3 }} />
        <Layer id="reports-hover-fill" type="fill" filter={topFilter} paint={{ 'fill-color': '#6366f1', 'fill-opacity': 0.08 }} />
        <Layer
          id="reports-hover-line"
          type="line"
          filter={hoverFilter}
          paint={{ 'line-color': '#6366f1', 'line-width': 2.5, 'line-opacity': 0.85 }}
        />
      </Source>

      {/* invisible wide hit area for clicking/hovering lines */}
      <Source id="segments" type="geojson" data={staticData.segments}>
        <Layer id="segments-hit" type="line" paint={{ 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 }} />
      </Source>

      <Source id="cells" type="geojson" data={staticData.cells} promoteId="cell_id">
        <Layer
          id="cells-alive"
          type="line"
          filter={aliveFilter as ExpressionSpecification}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': cellColor, 'line-width': cellWidth }}
        />
        <Layer
          id="cells-dead"
          type="line"
          filter={deadFilter as ExpressionSpecification}
          paint={{ 'line-color': DEAD_COLOR, 'line-width': deadWidth, 'line-dasharray': [1.5, 1.2] }}
        />
      </Source>

      <Source id="nodes" type="geojson" data={staticData.nodes}>
        <Layer
          id="nodes-circle"
          type="circle"
          paint={{ 'circle-radius': nodeRadius, 'circle-color': '#ffffff', 'circle-stroke-color': '#94a3b8', 'circle-stroke-width': 1 }}
        />
      </Source>

      <Source id="routes" type="geojson" data={routes}>
        <Layer
          id="routes-line"
          type="line"
          layout={{ 'line-cap': 'round' }}
          paint={{ 'line-color': '#1e293b', 'line-width': routeWidth, 'line-opacity': 0.85, 'line-dasharray': [0.1, 2.2] }}
        />
      </Source>
    </>
  )
}
