import type { Geometry, Polygon, Position } from 'geojson'
import type { State, Static } from '../api'
import { STUDY_BOUNDS } from './Map/Map'
import { RISK_STOPS } from '../views/Operator/RiskLayers'

const SIZE = 384
const DECAY_KM = 0.5 // same distance falloff as show_forest_map(..., decay_km=0.5) in playground.ipynb
const [WEST, SOUTH, EAST, NORTH] = STUDY_BOUNDS
export const HEAT_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [[WEST, NORTH], [EAST, NORTH], [EAST, SOUTH], [WEST, SOUTH]]
type WeightedGeometry = { geometry: Geometry; weight: number; clip?: Polygon }

function heatmap(features: WeightedGeometry[], color: [number, number, number] | null): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const field = new Float32Array(SIZE * SIZE)
  const pixel = ([lon, lat]: Position) => [(lon - WEST) / (EAST - WEST) * (SIZE - 1), (NORTH - lat) / (NORTH - SOUTH) * (SIZE - 1)]
  const ring = (points: Position[]) => {
    points.forEach((point, i) => {
      const [x, y] = pixel(point)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
  }
  // Rasterise the supplied geometries; preserve overlapping weights with a max, not a sum.
  for (const { geometry, weight, clip } of features) {
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.save()
    if (clip) {
      ctx.beginPath()
      for (const points of clip.coordinates) { ring(points); ctx.closePath() }
      ctx.clip('evenodd')
    }
    ctx.fillStyle = ctx.strokeStyle = '#fff'
    ctx.lineWidth = 3
    ctx.beginPath()
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
      for (const polygon of polygons) for (const points of polygon) { ring(points); ctx.closePath() }
      ctx.fill('evenodd')
    } else if (geometry.type === 'LineString') {
      ring(geometry.coordinates)
      ctx.stroke()
    }
    ctx.restore()
    const mask = ctx.getImageData(0, 0, SIZE, SIZE).data
    for (let i = 0; i < field.length; i++) field[i] = Math.max(field[i], mask[i * 4 + 3] / 255 * weight)
  }
  // Two-pass distance decay: heat = weight * exp(-distance / decay_km), matching the repo's
  // forest_heat_overlay idea. This grid/chamfer approximation avoids adding scipy to the app.
  const dx = (EAST - WEST) / (SIZE - 1) * 111.32 * Math.cos((NORTH + SOUTH) / 2 * Math.PI / 180)
  const dy = (NORTH - SOUTH) / (SIZE - 1) * 111.32
  const fx = Math.exp(-dx / DECAY_KM), fy = Math.exp(-dy / DECAY_KM)
  const fd = Math.exp(-Math.hypot(dx, dy) / DECAY_KM)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x
    if (x) field[i] = Math.max(field[i], field[i - 1] * fx)
    if (y) field[i] = Math.max(field[i], field[i - SIZE] * fy)
    if (x && y) field[i] = Math.max(field[i], field[i - SIZE - 1] * fd)
    if (x < SIZE - 1 && y) field[i] = Math.max(field[i], field[i - SIZE + 1] * fd)
  }
  for (let y = SIZE - 1; y >= 0; y--) for (let x = SIZE - 1; x >= 0; x--) {
    const i = y * SIZE + x
    if (x < SIZE - 1) field[i] = Math.max(field[i], field[i + 1] * fx)
    if (y < SIZE - 1) field[i] = Math.max(field[i], field[i + SIZE] * fy)
    if (x < SIZE - 1 && y < SIZE - 1) field[i] = Math.max(field[i], field[i + SIZE + 1] * fd)
    if (x && y < SIZE - 1) field[i] = Math.max(field[i], field[i + SIZE - 1] * fd)
  }
  ctx.clearRect(0, 0, SIZE, SIZE)
  const image = ctx.createImageData(SIZE, SIZE)
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  for (let i = 0; i < field.length; i++) {
    const value = field[i]
    let shade = color
    if (!shade) {
      const high = RISK_STOPS.findIndex(([stop]) => stop >= value)
      const upper = RISK_STOPS[high < 0 ? RISK_STOPS.length - 1 : high]
      const lower = RISK_STOPS[Math.max(0, high < 0 ? RISK_STOPS.length - 1 : high - 1)]
      const fraction = upper[0] === lower[0] ? 0 : Math.max(0, (value - lower[0]) / (upper[0] - lower[0]))
      const a = rgb(lower[1]), b = rgb(upper[1])
      shade = a.map((v, j) => Math.round(v + (b[j] - v) * fraction)) as [number, number, number]
    }
    image.data.set(shade, i * 4)
    image.data[i * 4 + 3] = Math.round(255 * (color ? (value > 0.99 ? 0.6 : 0.45 * value) : Math.min(0.75, value * 2)))
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

export function startupHeatmaps(data: Static, state: State): string[] {
  const risks = new Map(state.cells.map((cell) => [cell.cell_id, cell.risk]))
  return [
    heatmap((data.vegetation?.features ?? []).filter((f) => f.geometry).map((f) => ({ geometry: f.geometry, weight: 1 })), [51, 153, 64]),
    // The supplied weather polygon is broad, not a detailed wind measurement. Show it faintly,
    // with stronger heat only along the actual grid corridors exposed inside that footprint.
    heatmap([
      { geometry: data.storm.geometry, weight: 0.12 },
      ...data.segments.features.map((f) => ({ geometry: f.geometry, weight: 1, clip: data.storm.geometry })),
    ], [245, 158, 11]),
    heatmap(data.default_inputs.reports.map((r) => ({ geometry: r.polygon, weight: r.confidence })), [120, 70, 200]),
    heatmap(data.cells.features.map((f) => ({ geometry: f.geometry, weight: risks.get(String(f.properties?.cell_id)) ?? 0 })), null),
  ]
}
