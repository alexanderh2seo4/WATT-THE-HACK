import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import { useStore } from '../../store'

export const DEAD_COLOR = '#94a3b8'
export const HIDDEN_DEAD_COLOR = '#c026d3'

/** zoom-interpolated line width: px at zoom 8 / 10 (about the default view) / 13 */
const zw = (z8: number, z10: number, z13: number): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], 8, z8, 10, z10, 13, z13]

const inList = (ids: string[]): ExpressionSpecification => ['in', ['get', 'segment_id'], ['literal', ids]]

/** Base grid layer: storm footprint, line segments and nodes from /api/static.
 * `dead` lines are drawn grey dashed, `hiddenDead` (sim ground truth) magenta dashed.
 * Includes an invisible wide `segments-hit` layer for clicking/hovering lines. */
export function NetworkLayer({ dead = [], hiddenDead = [] }: { dead?: string[]; hiddenDead?: string[] }) {
  const { staticData } = useStore()
  const deadKey = dead.join(',')
  const hiddenKey = hiddenDead.filter((s) => !dead.includes(s)).join(',')
  const filters = useMemo(() => {
    const d = deadKey ? deadKey.split(',') : []
    const h = hiddenKey ? hiddenKey.split(',') : []
    return {
      alive: ['!', inList([...d, ...h])] as ExpressionSpecification,
      dead: inList(d),
      hidden: inList(h),
    }
  }, [deadKey, hiddenKey])

  if (!staticData) return null
  return (
    <>
      {staticData.storm?.geometry?.coordinates?.length > 0 && (
        <Source id="storm" type="geojson" data={staticData.storm}>
          <Layer id="storm-fill" type="fill" paint={{ 'fill-color': '#64748b', 'fill-opacity': 0.06 }} />
          <Layer
            id="storm-line"
            type="line"
            paint={{ 'line-color': '#64748b', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.5 }}
          />
        </Source>
      )}
      <Source id="segments" type="geojson" data={staticData.segments}>
        <Layer id="segments-hit" type="line" paint={{ 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 }} />
        <Layer
          id="segments-line"
          type="line"
          filter={filters.alive}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': '#334155', 'line-width': zw(2, 2.75, 4.5) }}
        />
        <Layer
          id="segments-dead"
          type="line"
          filter={filters.dead}
          paint={{ 'line-color': DEAD_COLOR, 'line-width': zw(2.5, 3.5, 5), 'line-dasharray': [1.5, 1.5] }}
        />
        <Layer
          id="segments-hidden-dead"
          type="line"
          filter={filters.hidden}
          paint={{ 'line-color': HIDDEN_DEAD_COLOR, 'line-width': zw(3, 4, 6), 'line-dasharray': [1.5, 1.2] }}
        />
      </Source>
      <Source id="nodes" type="geojson" data={staticData.nodes}>
        <Layer
          id="nodes-circle"
          type="circle"
          paint={{
            'circle-radius': zw(2.5, 3.25, 4.5),
            'circle-color': '#ffffff',
            'circle-stroke-color': '#475569',
            'circle-stroke-width': 1.5,
          }}
        />
      </Source>
    </>
  )
}
