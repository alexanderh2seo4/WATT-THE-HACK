// API types + fetch helpers + polling hook.
// TODO: swap the hand-written types below for the generated ones
// (`npm run gen:types` -> src/api-types.ts) once frontend/openapi.json lands.

import { useEffect, useState } from 'react'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'

// ---------- types (PLAN.md §3.2) ----------

export type LonLat = [number, number]
export type FaultType = 'vegetation' | 'sag' | 'ice' | 'galloping' | 'hotspot' | 'broken_conductor'

export interface Report {
  report_id: string
  polygon: Polygon
  fault_types: FaultType[]
  confidence: number
  text: string
}

export interface OperatorInputs {
  reports: Report[]
  known_dead_segments: string[]
}

export interface StartPosition {
  drone_id: string
  segment_id: string
  position: LonLat
  reason: string
}

export type EventType = 'takeoff' | 'landing' | 'finding' | 'line_dead' | 'recommendation' | 'stranded'

export interface SimEvent {
  t: number
  type: EventType | string
  drone_id?: string | null
  cell_id?: string | null
  segment_id?: string | null
  fault_type?: FaultType | null
  confidence?: number | null
  message: string
}

export interface Static {
  segments: FeatureCollection<LineString>
  cells: FeatureCollection<LineString>
  nodes: FeatureCollection<Point>
  storm: Feature<Polygon>
  default_inputs: OperatorInputs
  vegetation?: FeatureCollection | null
}

export interface DroneState {
  drone_id: string
  position: LonLat
  heading: number
  status: 'charging' | 'flying' | 'landing' | 'stranded'
  battery_min: number
  segment_id: string | null
  route: LonLat[]
}

export interface CellState {
  cell_id: string
  risk: number
  inspected: 'none' | 'air' | 'landed'
  top_fault: FaultType | null
}

export interface SegmentState {
  segment_id: string
  p_live: number
}

export type SimStatus = 'setup' | 'running' | 'paused'

export interface State {
  t: number
  speed: number
  status: SimStatus
  drones: DroneState[]
  cells: CellState[]
  segments: SegmentState[]
  inputs: OperatorInputs
  start_positions: StartPosition[]
  events: SimEvent[]
}

export interface SensorParams {
  p_detect_air: number
  p_detect_landed: number
  p_false_positive: number
}

export interface SimConfig {
  seed: number
  dead_segments: string[]
  faults: { fault_id: string; segment_id: string; position: LonLat; fault_type: FaultType }[]
  sensors: Record<string, SensorParams>
  drone: {
    speed_inspect_mps: number
    speed_transit_mps: number
    max_flight_min: number
    full_charge_min: number
    landing_min: number
    start_battery_min: number
  }
}

export interface SimControl {
  action: 'start' | 'pause' | 'resume' | 'reset'
  speed?: number
}

// ---------- mock mode (VITE_MOCK=1) ----------

export const MOCK = import.meta.env.VITE_MOCK === '1'

// glob so the build still works while the mock files don't exist yet
const mockFiles = import.meta.glob<{ default: unknown }>('./mocks/*.json', { eager: true })
const mockFile = <T>(name: string, fallback: T): T =>
  structuredClone((mockFiles[`./mocks/${name}.json`]?.default as T) ?? fallback)

const emptyFc = { type: 'FeatureCollection', features: [] } as FeatureCollection<never>
const emptyInputs: OperatorInputs = { reports: [], known_dead_segments: [] }
const mockStatic: Static = mockFile('static', {
  segments: emptyFc,
  cells: emptyFc,
  nodes: emptyFc,
  storm: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } },
  default_inputs: emptyInputs,
})
const mockState: State = mockFile('state', {
  t: 0,
  speed: 60,
  status: 'setup',
  drones: [],
  cells: [],
  segments: [],
  inputs: emptyInputs,
  start_positions: [],
  events: [],
})
let mockConfig: SimConfig | null = mockFile<SimConfig | null>('sim_config', null)
let mockLastTick = performance.now()

function mockTick(): State {
  const now = performance.now()
  if (mockState.status === 'running') mockState.t += ((now - mockLastTick) / 1000) * mockState.speed
  mockLastTick = now
  return structuredClone(mockState)
}

function mockControl(c: SimControl): State {
  mockTick()
  if (c.speed) mockState.speed = c.speed
  if (c.action === 'start' || c.action === 'resume') mockState.status = 'running'
  if (c.action === 'pause') mockState.status = 'paused'
  if (c.action === 'reset') Object.assign(mockState, { status: 'setup', t: 0 })
  return structuredClone(mockState)
}

// ---------- fetch helpers ----------

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

const mock = <T>(value: T) => Promise.resolve(value)

export const getStatic = () => (MOCK ? mock(structuredClone(mockStatic)) : req<Static>('GET', '/static'))

export const getState = () => (MOCK ? mock(mockTick()) : req<State>('GET', '/state'))

export const putInputs = (inputs: OperatorInputs) =>
  MOCK ? mock((mockState.inputs = inputs)) : req<unknown>('PUT', '/inputs', inputs)

export const postStartPositions = () =>
  MOCK ? mock(mockState.start_positions) : req<StartPosition[]>('POST', '/plan/start-positions')

export const getSimConfig = () =>
  MOCK ? mock(mockConfig as SimConfig) : req<SimConfig>('GET', '/sim/config')

export const putSimConfig = (config: SimConfig) =>
  MOCK ? mock((mockConfig = config)) : req<unknown>('PUT', '/sim/config', config)

export const postSimControl = (control: SimControl) =>
  MOCK ? mock(mockControl(control)) : req<unknown>('POST', '/sim/control', control)

// ---------- hooks ----------

/** Polls GET /api/state every `intervalMs`; returns the latest snapshot (null until the first one). */
export function usePolling(intervalMs = 500): State | null {
  const [state, setState] = useState<State | null>(null)
  useEffect(() => {
    let alive = true
    let timer: number
    const tick = async () => {
      try {
        const s = await getState()
        if (alive) setState(s)
      } catch {
        // backend not up yet; keep last snapshot and retry
      }
      if (alive) timer = window.setTimeout(tick, intervalMs)
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [intervalMs])
  return state
}

/** Fetches GET /api/static once. */
export function useStatic(): Static | null {
  const [data, setData] = useState<Static | null>(null)
  useEffect(() => {
    getStatic().then(setData).catch(() => setData(null))
  }, [])
  return data
}
