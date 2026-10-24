import type { ReactNode } from 'react'
import MapGL, { NavigationControl } from 'react-map-gl/maplibre'

// Study area [west, south, east, north]
export const STUDY_BOUNDS: [number, number, number, number] = [10.45, 48.09, 10.88, 48.38]
const BASEMAP = 'https://tiles.openfreemap.org/styles/positron'

/** Shared MapLibre map (both views). Pass <Source>/<Layer> elements as children. */
export function Map({ children }: { children?: ReactNode }) {
  return (
    <MapGL
      initialViewState={{ bounds: STUDY_BOUNDS, fitBoundsOptions: { padding: 32 } }}
      mapStyle={BASEMAP}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {children}
    </MapGL>
  )
}
