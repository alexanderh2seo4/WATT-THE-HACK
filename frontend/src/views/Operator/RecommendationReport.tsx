// Report panel for one recommendation: what is recommended, why (the rule in planner/recommend.py),
// the simulated observations behind it (state.observations: every pass with risk before -> after) and
// what the sensors cannot tell. Re-derived from the latest state on every poll, so it updates live.
import { useEffect, useState } from 'react'
import type { Position } from 'geojson'
import { getSimConfig, type CellObservation, type SensorParams, type State, type Static } from '../../api'
import { REC_STYLE, type Rec } from './Recommendations'

// backend thresholds (planner/recommend.py)
const CREW = 0.8
const CONFIRM = 0.4
const CONFIRM_CONF = 0.8

const pct = (p: number) => `${Math.round(p * 100)}%`
const clock = (t: number) => {
  const m = Math.floor(t / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
const nice = (s: string) => s.replace('_', ' ')

/** "RGB camera (air) / IMU inclinometer (landed)" -> the part for this mode. */
function sensorFor(sp: SensorParams | undefined, mode: string): string {
  if (!sp?.sensor) return 'sensor'
  const parts = sp.sensor.split(' / ')
  return (parts.find((p) => p.includes(`(${mode})`)) ?? parts[0]).replace(/ \((air|landed)\)/, '')
}

function useSensors() {
  const [sensors, setSensors] = useState<Record<string, SensorParams>>({})
  useEffect(() => {
    getSimConfig()
      .then((c) => setSensors((c?.sensors ?? {}) as Record<string, SensorParams>))
      .catch(() => {})
  }, [])
  return sensors
}

function inPolygon([x, y]: Position, ring: Position[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Point halfway along a line (planar degrees; good enough for ~500 m cells). */
function midpoint(c: Position[]): Position {
  const seg = c.slice(1).map((p, i) => Math.hypot(p[0] - c[i][0], p[1] - c[i][1]))
  let left = seg.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) {
      const f = seg[i] ? left / seg[i] : 0
      return [c[i][0] + f * (c[i + 1][0] - c[i][0]), c[i][1] + f * (c[i + 1][1] - c[i][1])]
    }
    left -= seg[i]
  }
  return c[c.length - 1]
}

/** Cell id -> {km along the line, midpoint}, from the static cell geometry. */
function cellInfo(staticData: Static | null) {
  const out = new globalThis.Map<string, { km: number; mid: Position; seg: string }>()
  const byLine = new globalThis.Map<string, number>()
  for (const f of staticData?.cells.features ?? []) {
    const p = f.properties ?? {}
    const start = byLine.get(p.segment_id) ?? 0
    byLine.set(p.segment_id, start + Number(p.length_m))
    out.set(p.cell_id, { km: (start + Number(p.length_m) / 2) / 1000, mid: midpoint(f.geometry.coordinates), seg: p.segment_id })
  }
  return out
}

export function RecommendationReport({
  rec,
  state,
  staticData,
  onClose,
}: {
  rec: Rec
  state: State
  staticData: Static | null
  onClose: () => void
}) {
  const sensors = useSensors()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const s = REC_STYLE[rec.kind]
  const e = rec.event
  const msg = e.message
  const cells = cellInfo(staticData)
  const risk = new globalThis.Map(state.cells.map((c) => [c.cell_id, c]))
  const obs = state.observations ?? []

  let title = ''
  let where = ''
  let riskLine = ''
  let why = ''
  let limits: string[] = []
  let body: React.ReactNode = null

  if (rec.kind === 'crew' || rec.kind === 'confirm') {
    const cell = e.cell_id ?? ''
    const fault = (/possible (\w+) at/.exec(msg) ?? /: (\w+) confirmed/.exec(msg))?.[1] ?? risk.get(cell)?.top_fault ?? 'fault'
    const info = cells.get(cell)
    const now = risk.get(cell)?.risk ?? 0
    const atRec = /risk (\d+)%/.exec(msg)?.[1]
    const mine = obs.filter((o) => o.cell_id === cell)
    const dets = mine.flatMap((o) => o.detections.filter((d) => d.fault_type === fault).map((d) => ({ o, d })))
    const confidentLanded = dets.some(({ o, d }) => o.mode === 'landed' && d.confidence >= CONFIRM_CONF)
    title = rec.kind === 'crew' ? `Send repair crew: ${nice(fault)}` : `Needs confirmation: possible ${nice(fault)}`
    where = `${e.segment_id} · km ${info?.km.toFixed(1) ?? '?'} · cell ${cell}`
    riskLine = `Fault risk now ${pct(now)}${atRec ? ` (${atRec}% when recommended)` : ''}`
    if (rec.kind === 'crew')
      why = `Risk above ${pct(CREW)} and ${nice(fault)} confirmed ${
        dets.length >= 2 ? `by ${dets.length} detections` : confidentLanded ? `by a landed detection with ≥${pct(CONFIRM_CONF)} confidence` : 'by the sensors'
      }.`
    else if (rec.resolved) why = `A ${nice(fault)} detection raised the risk above ${pct(CONFIRM)}; re-inspection without a finding has since dropped it below ${pct(CONFIRM)}, so this is resolved.`
    else
      why = `${dets.length === 1 ? 'One' : dets.length} ${nice(fault)} detection${dets.length === 1 ? '' : 's'} put the risk ${
        now > CREW ? `above ${pct(CREW)}, but it is not confirmed yet (needs 2 detections or a confident landed one)` : `in the ${pct(CONFIRM)}–${pct(CREW)} band`
      }, so a second look is scheduled.`
    const sp = sensors[fault]
    if (sp)
      limits = [
        sp.p_detect_air === 0
          ? `${nice(fault)} is only detectable when landed (${sp.sensor}); air passes cannot see it.`
          : `${sp.sensor}: detects ${nice(fault)} in ${pct(sp.p_detect_air)} of air passes, ${pct(sp.p_detect_landed)} when landed.`,
        `False alarms ~${(sp.p_false_positive * 100).toFixed(1)}% per pass; confidence is the sensor's own certainty.`,
      ]
    body = mine.length ? (
      <ol className="space-y-1">
        {mine.map((o, i) => (
          <ObsRow key={i} o={o} fault={fault} sensors={sensors} />
        ))}
      </ol>
    ) : (
      <Empty />
    )
  } else {
    // area cleared / ground check: one line per cell of the area
    let ids: string[] = []
    if (rec.kind === 'cleared') {
      const rid = /^Area of (\S+) cleared/.exec(msg)?.[1]
      const report = state.inputs.reports.find((r) => r.report_id === rid)
      const ring = (report?.polygon.coordinates[0] ?? []) as Position[]
      ids = [...cells].filter(([, c]) => ring.length && inPolygon(c.mid, ring)).map(([id]) => id)
      title = `Area cleared: ${rid}`
      where = `${ids.length} cells · reported: ${report?.fault_types.map(nice).join(', ') || '–'}`
      const maxRisk = Math.max(0, ...ids.map((id) => risk.get(id)?.risk ?? 0))
      riskLine = `Highest cell risk now ${pct(maxRisk)}`
      why = `All ${ids.length} cells of the report area were inspected and every one is below ${pct(CONFIRM)} risk: nothing found.`
      limits = (report?.fault_types ?? [])
        .map((t) => [t, sensors[t]] as const)
        .filter(([, sp]) => sp)
        .map(([t, sp]) =>
          sp.p_detect_air === 0
            ? `${nice(t)} is only detectable when landed; air passes alone cannot rule it out.`
            : `An air pass misses ${nice(t)} ${pct(1 - sp.p_detect_air)} of the time.`,
        )
    } else {
      const seg = e.segment_id ?? ''
      ids = [...cells].filter(([, c]) => c.seg === seg).map(([id]) => id)
      title = `Ground check: ${seg}`
      where = `${seg} · ${ids.length} cells`
      riskLine = `Line is dead (no current measured)`
      why = `${seg} carries no current, but all ${ids.length} cells were inspected with no fault seen: the cause may be off the line (protection, substation, upstream), so check from the ground.`
      limits = ['Drones see the conductors from above; faults inside substations or protection equipment are invisible to them.']
    }
    body = (
      <ol className="space-y-1">
        {ids.map((id) => {
          const mine = obs.filter((o) => o.cell_id === id)
          return <CellRow key={id} id={id} km={cells.get(id)?.km ?? 0} obs={mine} riskNow={risk.get(id)?.risk ?? 0} />
        })}
      </ol>
    )
  }

  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-[380px] flex-col overflow-hidden rounded-xl bg-white/95 text-[13px] text-slate-700 shadow-lg ring-1 ring-slate-200">
      <div className={`flex items-start gap-2.5 px-3 py-2.5 ring-1 ${rec.resolved ? 'bg-slate-50 ring-slate-100' : s.card}`}>
        <span
          className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: rec.resolved ? '#cbd5e1' : s.color }}
        >
          {s.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{title}</div>
          <div className="text-xs opacity-75">{where}</div>
        </div>
        <button onClick={onClose} className="-mr-1 -mt-0.5 rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-black/5 hover:text-slate-700" title="Close (Esc)">
          ×
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto px-3 py-2.5">
        <div>
          <div className="font-medium text-slate-900">{riskLine}</div>
          <div className="text-[11px] text-slate-400">recommended at {clock(e.t)} sim time</div>
        </div>
        <Block title="Why">
          <p className="leading-snug">{why}</p>
        </Block>
        <Block
          title="What was measured"
          extra={<span className="rounded bg-violet-50 px-1.5 py-px text-[10px] font-medium normal-case tracking-normal text-violet-700">simulated</span>}
        >
          {body}
        </Block>
        {limits.length > 0 && (
          <Block title="Limits">
            <ul className="space-y-0.5 text-xs leading-snug text-slate-500">
              {limits.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </div>
  )
}

function Block({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
        {extra}
      </h3>
      {children}
    </section>
  )
}

const Empty = () => <p className="text-xs text-slate-400">No passes recorded yet.</p>

const SimTag = () => (
  <span className="rounded bg-violet-50 px-1 text-[10px] text-violet-600" title="Hypothetical: produced by the simulation, not a real sensor">
    simulated observation
  </span>
)

function Delta({ a, b }: { a: number; b: number }) {
  const up = b > a + 0.005
  const down = b < a - 0.005
  return (
    <span className="shrink-0 tabular-nums text-slate-500">
      {pct(a)} → <span className={up ? 'font-semibold text-rose-600' : down ? 'font-semibold text-emerald-600' : ''}>{pct(b)}</span>
    </span>
  )
}

/** One pass over the recommendation's cell. */
function ObsRow({ o, fault, sensors }: { o: CellObservation; fault: string; sensors: Record<string, SensorParams> }) {
  const hit = o.detections.find((d) => d.fault_type === fault)
  const other = o.detections.filter((d) => d.fault_type !== fault)
  const sp = sensors[hit?.fault_type ?? fault]
  return (
    <li className="rounded-lg bg-slate-50 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="font-mono">{clock(o.t)}</span>
        <span className="font-semibold text-slate-800">{o.drone_id}</span>
        <span>· {o.mode === 'air' ? 'air pass' : 'landed'}</span>
        <span className="min-w-0 truncate">· {sensorFor(sp, o.mode)}</span>
        <span className="ml-auto shrink-0">
          <SimTag />
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className={hit ? 'font-medium text-rose-700' : 'text-slate-500'}>
          {hit ? `${nice(fault)} detected · confidence ${pct(hit.confidence)}` : 'no detection'}
          {other.length > 0 && (
            <span className="font-normal text-slate-400"> · also {other.map((d) => `${nice(d.fault_type)} ${pct(d.confidence)}`).join(', ')}</span>
          )}
        </span>
        <Delta a={o.risk_before} b={o.risk_after} />
      </div>
    </li>
  )
}

/** One cell of a cleared area / dead line: its passes summarised. */
function CellRow({ id, km, obs, riskNow }: { id: string; km: number; obs: CellObservation[]; riskNow: number }) {
  const first = obs[0]
  const dets = obs.flatMap((o) => o.detections)
  return (
    <li className="flex items-baseline gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs">
      <span className="w-28 shrink-0 font-medium text-slate-800">
        {id.split('#')[0]} <span className="font-normal text-slate-400">km {km.toFixed(1)}</span>
      </span>
      <span className="min-w-0 flex-1 text-slate-500">
        {obs.length
          ? obs.map((o) => `${clock(o.t)} ${o.drone_id} ${o.mode === 'air' ? 'air' : 'landed'}`).join(', ')
          : 'no pass recorded'}
        {dets.length ? ` · ${dets.length} weak detection${dets.length > 1 ? 's' : ''}` : ' · no detection'}
      </span>
      {first ? <Delta a={first.risk_before} b={riskNow} /> : <span className="tabular-nums text-slate-500">{pct(riskNow)}</span>}
    </li>
  )
}
