import { Layer, Source } from 'react-map-gl/maplibre'
import { useStore } from '../../store'

/** Base grid layer: storm footprint, line segments and nodes from /api/static. */
export function NetworkLayer() {
  const { staticData } = useStore()
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
        <Layer
          id="segments-line"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': '#475569', 'line-width': 2 }}
        />
      </Source>
      <Source id="nodes" type="geojson" data={staticData.nodes}>
        <Layer
          id="nodes-circle"
          type="circle"
          paint={{
            'circle-radius': 3,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#475569',
            'circle-stroke-width': 1.5,
          }}
        />
      </Source>
    </>
  )
}
