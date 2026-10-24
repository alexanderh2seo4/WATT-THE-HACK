import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { MapProvider, Marker, Popup, useMap, type MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { Feature, FeatureCollection, Position } from 'geojson'
import {
  type DroneState,
  postSimControl,
  postStartPositions,
  putInputs,
  type FaultType,
  type OperatorInputs,
  type Report,
  type SimEvent,
  type State,
  type Static,
} from '../../api'
import { Map } from '../../components/Map'
import { Section, SidebarLayout } from '../../components/Sidebar'
import { useStore } from '../../store'
import { DRONE_COLORS, Drones } from './Drones'
import { Legend } from './Legend'
import { RecommendationList, RecommendationMarkers, recommendations } from './Recommendations'
import { deadSegments, RiskLayers } from './RiskLayers'

const MAP_ID = 'operator'

export function Operator() {
  return (
    <MapProvider>
      <OperatorPage />
    </MapProvider>
  )
}

function OperatorPage() {
  const { staticData, state } = useStore()
  const [showVegetation, setShowVegetation] = useState(true)
  const [hover, setHover] = useState<{ id: string; lngLat: [number, number] } | null>(null)
  const setup = !state || state.status === 'setup'
  const flyTo = useFlyTo(staticData)
  const recs = useMemo(() => recommendations(state), [state])

  // map handlers can fire with an older closure; always toggle against the latest snapshot
  const stateRef = useRef(state)
  stateRef.current = state
  const toggleDead = (segmentId: string) => {
    const inputs = stateRef.current?.inputs
    if (!inputs) return
    const dead = inputs.known_dead_segments
    const next = dead.includes(segmentId) ? dead.filter((s) => s !== segmentId) : [...dead, segmentId]
    putInputs({ ...inputs, known_dead_segments: next })
  }

  const onClick = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.segment_id as string | undefined
    if (id && setup) toggleDead(id)
  }
  // map mousemove keeps firing over markers; suppress the line popup so the marker tooltip stays visible
  const overMarker = useRef(false)
  const onMove = (e: MapLayerMouseEvent) => {
    const id = overMarker.current && setup ? undefined : (e.features?.[0]?.properties?.segment_id as string | undefined)
    setHover(id ? { id, lngLat: [e.lngLat.lng, e.lngLat.lat] } : null)
  }

  return (
    <SidebarLayout
      sidebar={
        <>
          <Stepper staticData={staticData} state={state} onRemoveDead={toggleDead} />
          {state && !setup && (
            <>
              <Stats state={state} toAct={recs.filter((r) => !r.resolved && r.kind !== 'cleared').length} />
              <DroneSummary state={state} />
              <Section title="Recommendations">
                <RecommendationList recs={recs} onSelect={(r) => flyTo(r.event)} />
              </Section>
            </>
          )}
          <Log state={state} onSelect={flyTo} />
        </>
      }
    >
      <Map
        id={MAP_ID}
        interactiveLayerIds={['segments-hit']}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        cursor={hover && setup ? 'pointer' : 'grab'}
      >
        {staticData && <RiskLayers staticData={staticData} state={state} showVegetation={showVegetation} />}
        {setup && state?.start_positions.map((sp, i) => (
          <Marker key={sp.drone_id} longitude={sp.position[0]} latitude={sp.position[1]}>
            <div
              className="group relative"
              onMouseEnter={() => {
                overMarker.current = true
                setHover(null)
              }}
              onMouseLeave={() => (overMarker.current = false)}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white shadow-md ring-2 ring-white">
                {i + 1}
              </div>
              <div className="pointer-events-none absolute bottom-9 left-1/2 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                <span className="font-semibold">{sp.drone_id}</span> · {sp.segment_id}
                <div className="text-slate-300">{sp.reason}</div>
              </div>
            </div>
          </Marker>
        ))}
        <RecommendationMarkers recs={recs} onSelect={(r) => flyTo(r.event)} />
        <Drones state={state} />
        {hover && (
          <Popup longitude={hover.lngLat[0]} latitude={hover.lngLat[1]} closeButton={false} offset={12} className="pointer-events-none text-xs">
            <span className="font-medium">{hover.id}</span>
            {setup && (
              <span className="text-slate-500">
                {' '}
                · click to {state?.inputs.known_dead_segments.includes(hover.id) ? 'unmark' : 'mark'} dead
              </span>
            )}
          </Popup>
        )}
      </Map>
      <Legend showVegetation={showVegetation} onToggleVegetation={() => setShowVegetation((v) => !v)} />
    </SidebarLayout>
  )
}

// ---------- stepper ----------

const btn =
  'w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition enabled:hover:bg-highlight enabled:hover:text-brand disabled:opacity-40'
const btnGhost =
  'flex-1 cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-center text-sm text-slate-700 transition hover:bg-slate-50'

function Step({
  n,
  title,
  state,
  summary,
  children,
}: {
  n: number
  title: string
  state: 'done' | 'active' | 'todo'
  summary?: string
  children?: ReactNode
}) {
  return (
    <li className={`flex gap-3 ${state === 'todo' ? 'opacity-40' : ''}`}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          state === 'active' ? 'bg-brand text-highlight' : state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {state === 'done' ? '✓' : n}
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-medium ${state === 'active' ? 'text-slate-900' : 'text-slate-500'}`}>{title}</span>
          {summary && <span className="truncate text-xs text-slate-400">{summary}</span>}
        </div>
        {children && <div className="mt-2 space-y-2">{children}</div>}
      </div>
    </li>
  )
}

function parseReports(fc: FeatureCollection, offset: number): Report[] {
  return fc.features
    .filter((f) => f.geometry?.type === 'Polygon')
    .map((f, i) => {
      const p = f.properties ?? {}
      const types = Array.isArray(p.fault_types) ? p.fault_types : String(p.fault_types ?? '').split(/[,;\s]+/)
      return {
        report_id: String(p.report_id ?? `upload_${offset + i + 1}`),
        polygon: f.geometry as Report['polygon'],
        fault_types: types.filter(Boolean) as FaultType[],
        confidence: Number(p.confidence ?? 0.5),
        text: String(p.text ?? ''),
      }
    })
}

function Stepper({
  staticData,
  state,
  onRemoveDead,
}: {
  staticData: Static | null
  state: State | null
  onRemoveDead: (id: string) => void
}) {
  // start positions computed for an older version of the inputs need a recompute
  const [startsFor, setStartsFor] = useState<string | null>(null)
  const inputs = state?.inputs
  const inputsKey = JSON.stringify(inputs ?? null)
  const live = !!state && state.status !== 'setup'
  const hasInputs = !!inputs && inputs.reports.length + inputs.known_dead_segments.length > 0
  const anyStarts = (state?.start_positions.length ?? 0) > 0
  // first time we see start positions (e.g. page reload) we assume they match the current inputs
  useEffect(() => {
    if (startsFor === null && anyStarts) setStartsFor(inputsKey)
  }, [startsFor, anyStarts, inputsKey])
  const hasStarts = anyStarts && (startsFor === null || startsFor === inputsKey)
  const [error, setError] = useState<string | null>(null)

  const save = (next: OperatorInputs) => putInputs(next).catch((e) => setError(String(e)))

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !inputs) return
    try {
      const reports = parseReports(JSON.parse(await file.text()), inputs.reports.length)
      if (!reports.length) throw new Error('no polygons found')
      setError(null)
      save({ ...inputs, reports: [...inputs.reports, ...reports] })
    } catch (err) {
      setError(`Could not read ${file.name}: ${(err as Error).message}`)
    }
  }

  const findStarts = async () => {
    await postStartPositions()
    setStartsFor(inputsKey)
  }

  const step1 = live || hasStarts ? 'done' : 'active'
  const step2 = live || hasStarts ? 'done' : hasInputs ? 'active' : 'todo'
  const step3 = live ? 'active' : hasStarts ? 'active' : 'todo'
  const dead = inputs?.known_dead_segments ?? []
  const nReports = inputs?.reports.length ?? 0

  return (
    <Section title="Mission">
      <ol>
        <Step n={1} title="Inputs" state={step1} summary={`${nReports} reports · ${dead.length} dead`}>
          {!live && (
            <>
              <div className="flex gap-2">
                <button className={btnGhost} disabled={!staticData} onClick={() => staticData && save(staticData.default_inputs)}>
                  Load defaults
                </button>
                <label className={btnGhost}>
                  Upload reports
                  <input type="file" accept=".geojson,.json,application/geo+json" className="hidden" onChange={onUpload} />
                </label>
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">Known dead lines · click a line on the map</div>
                <div className="flex flex-wrap gap-1.5">
                  {dead.map((s) => (
                    <span key={s} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-700">
                      {s}
                      <button
                        onClick={() => onRemoveDead(s)}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        title="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {!dead.length && <span className="text-xs text-slate-400">none</span>}
                </div>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </>
          )}
        </Step>
        <Step n={2} title="Find start positions" state={step2} summary={hasStarts || live ? `${state?.start_positions.length} drones` : undefined}>
          {!live && hasInputs && (
            <button className={hasStarts ? btnGhost + ' w-full' : btn} onClick={findStarts}>
              {hasStarts ? 'Recompute' : 'Find start positions'}
            </button>
          )}
          {!live && hasStarts && <p className="text-xs text-slate-400">Hover a marker to see why it was chosen.</p>}
        </Step>
        <Step n={3} title="Run" state={step3} summary={live ? state?.status : undefined}>
          {!live && hasStarts && (
            <button className={btn} onClick={() => postSimControl({ action: 'start' })}>
              Start mission
            </button>
          )}
        </Step>
      </ol>
    </Section>
  )
}

// ---------- stats + log ----------

function Stats({ state, toAct }: { state: State; toAct: number }) {
  const inspected = state.cells.filter((c) => c.inspected !== 'none').length
  const pct = state.cells.length ? Math.round((100 * inspected) / state.cells.length) : 0
  const findings = state.events.filter((e) => e.type === 'finding').length
  const dead = deadSegments(state).length
  const item = (v: ReactNode, label: string) => (
    <div className="flex-1">
      <div className="text-base font-semibold tabular-nums text-slate-900">{v}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  )
  return (
    <div className="flex gap-2 rounded-xl bg-slate-50 px-3 py-2">
      {item(`${pct}%`, 'checked')}
      {item(findings, 'findings')}
      {item(<span className={toAct ? 'text-rose-600' : undefined}>{toAct}</span>, 'to act on')}
      {item(dead, 'dead lines')}
    </div>
  )
}

const EVENT_STYLE: Partial<Record<SimEvent['type'], string>> = {
  finding: 'bg-amber-50 text-amber-950 ring-1 ring-amber-200',
  recommendation: 'bg-rose-50 text-rose-950 ring-1 ring-rose-200 font-medium',
  line_dead: 'bg-slate-100 text-slate-900 font-medium',
  stranded: 'bg-rose-100 text-rose-900 font-medium',
  all_found: 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200 font-medium',
}
/** routine flight events stay quiet so findings and recommendations stand out */
const ROUTINE = 'text-xs text-slate-400 hover:bg-slate-50'

function coordsOf(f: Feature | undefined): Position[] {
  const g = f?.geometry
  if (!g) return []
  if (g.type === 'LineString') return g.coordinates
  if (g.type === 'MultiLineString') return g.coordinates.flat()
  return []
}

/** Fly the map to an event's position (or the bounds of its cell / segment). */
function useFlyTo(staticData: Static | null) {
  const { [MAP_ID]: map } = useMap()
  const index = useMemo(() => {
    const m = new globalThis.Map<string, Feature>()
    for (const f of staticData?.cells.features ?? []) m.set(f.properties?.cell_id, f)
    for (const f of staticData?.segments.features ?? []) m.set(f.properties?.segment_id, f)
    return m
  }, [staticData])

  return (e: SimEvent) => {
    if (!map) return
    if (e.position) return map.flyTo({ center: e.position, zoom: Math.max(map.getZoom(), 12.5) })
    const coords = coordsOf(index.get(e.cell_id ?? '') ?? index.get(e.segment_id ?? ''))
    if (!coords.length) return
    const lons = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], { padding: 80, maxZoom: 13 })
  }
}

const DRONE_TEXT: Record<DroneState['status'], string> = {
  flying: 'Flying',
  landing: 'Landing',
  charging: 'Charging',
  stranded: 'Stranded',
}

/** "What are the drones doing now": one row per drone with its battery. */
function DroneSummary({ state }: { state: State }) {
  return (
    <Section title="Drones now">
      <ul className="space-y-1">
        {state.drones.map((d) => {
          const frac = Math.max(0, Math.min(1, d.battery_min / (d.max_flight_min || 30)))
          const color = DRONE_COLORS[d.status]
          return (
            <li key={d.drone_id} className="flex items-center gap-2 text-[13px]">
              <span className="w-6 font-semibold text-slate-900">{d.drone_id}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {DRONE_TEXT[d.status]}
                {d.segment_id && d.status !== 'flying' && <span className="text-slate-400"> on {d.segment_id}</span>}
              </span>
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" title="Battery">
                <span className="block h-full rounded-full" style={{ width: `${frac * 100}%`, background: color }} />
              </span>
              <span className="w-7 text-right text-xs tabular-nums text-slate-400">{Math.round(d.battery_min)}′</span>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function Log({ state, onSelect }: { state: State | null; onSelect: (e: SimEvent) => void }) {
  const events = (state?.events ?? []).slice(-300).reverse()
  return (
    <Section title="Log">
      <ul className="space-y-1">
        {events.map((e, i) => (
          <li key={events.length - i}>
            <button
              onClick={() => onSelect(e)}
              className={`flex w-full gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-snug transition hover:brightness-95 ${
                EVENT_STYLE[e.type] ?? ROUTINE
              }`}
            >
              <span className="w-9 shrink-0 font-mono text-[11px] leading-5 text-slate-400">{formatT(e.t)}</span>
              <span className="min-w-0">{e.message}</span>
            </button>
          </li>
        ))}
        {!events.length && (
          <li className="px-1 text-sm text-slate-400">
            {!state || state.status === 'setup'
              ? 'Takeoffs, findings and recommendations appear here once the mission runs.'
              : 'No events yet'}
          </li>
        )}
      </ul>
    </Section>
  )
}

function formatT(t: number) {
  const m = Math.floor(t / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
