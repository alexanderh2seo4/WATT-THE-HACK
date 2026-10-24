import { useState, type ReactNode } from 'react'
import MapGL, { NavigationControl, type ErrorEvent, type MapProps, type StyleSpecification } from 'react-map-gl/maplibre'

// Study area [west, south, east, north]
export const STUDY_BOUNDS: [number, number, number, number] = [10.45, 48.09, 10.88, 48.38]
const BASEMAP = 'https://tiles.openfreemap.org/styles/positron'
// Used if the basemap style can't be fetched (offline / blocked), so our own layers still render.
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#f1f5f9' } }],
}

/** Shared MapLibre map (both views). Pass <Source>/<Layer> elements as children; other MapProps
 * (id, onClick, interactiveLayerIds, cursor, ...) are passed through. */
export function Map({ children, ...props }: { children?: ReactNode } & Partial<MapProps>) {
  const [style, setStyle] = useState<string | StyleSpecification>(BASEMAP)
  const onError = (e: ErrorEvent) => {
    const url = (e.error as { url?: string } | undefined)?.url
    if (style === BASEMAP && url === BASEMAP) setStyle(BLANK)
  }
  return (
    <MapGL
      initialViewState={{ bounds: STUDY_BOUNDS, fitBoundsOptions: { padding: 32 } }}
      mapStyle={style}
      onError={onError}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
      dragRotate={false}
      {...props}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      {children}
    </MapGL>
  )
}
