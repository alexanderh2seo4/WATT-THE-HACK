import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import MapGL, { Layer, Source } from 'react-map-gl/maplibre'
import { STUDY_BOUNDS } from './Map/Map'
import { useStore } from '../store'
import { HEAT_COORDINATES, startupHeatmaps } from './startupHeatmaps'

const STEPS = [
  { name: 'Vegetation', text: 'Scanning vegetation exposure' },
  { name: 'Storm exposure', text: 'Tracing storm-exposed grid corridors' },
  { name: 'Report areas', text: 'Locating reported hazards' },
  { name: 'Combined fault risk', text: 'Finding starting points' },
]
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

/** A four-second visual preview only: never modifies inputs, config or the mission. */
export function StartupIntro({ children }: { children: ReactNode }) {
  const { staticData, state } = useStore()
  const [finished, setFinished] = useState(false)
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(0)
  const onReady = useCallback(() => setReady(true), [])
  // Freeze the initial snapshot: polling must not regenerate four rasters every 500 ms.
  const [snapshot, setSnapshot] = useState<typeof state>(null)
  useEffect(() => {
    if (state && !snapshot) setSnapshot(state)
  }, [state, snapshot])

  useEffect(() => {
    if (!ready || finished) return
    const start = performance.now()
    const timer = window.setInterval(() => {
      const next = Math.floor((performance.now() - start) / 1000)
      if (next >= STEPS.length) setFinished(true)
      else setStep(next)
    }, 25)
    return () => window.clearInterval(timer)
  }, [ready, finished])

  const heatmaps = useMemo(() => staticData && snapshot ? startupHeatmaps(staticData, snapshot) : null, [staticData, snapshot])

  if (finished) return children
  // The store's existing connection screen covers this while the private worker starts.
  if (!staticData || !state || !heatmaps) return <div className="h-full bg-white" />

  return (
    <main className="startup-intro fixed inset-0 bg-white text-black" data-intro-step={step}>
      <div className="absolute inset-0 bottom-36">
        <MapGL
          initialViewState={{ bounds: STUDY_BOUNDS, fitBoundsOptions: { padding: 48 } }}
          mapStyle={STYLE}
          onIdle={onReady}
          interactive={false}
          attributionControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          {heatmaps.map((url, index) => (
            <Source key={index} id={`intro-heat-${index}`} type="image" url={url} coordinates={HEAT_COORDINATES}>
              <Layer id={`intro-heat-layer-${index}`} type="raster" layout={{ visibility: step === index ? 'visible' : 'none' }}
                paint={{ 'raster-opacity': 1, 'raster-fade-duration': 0 }} />
            </Source>
          ))}
          <Source id="intro-network" type="geojson" data={staticData.segments}>
            <Layer id="intro-grid" type="line" paint={{ 'line-color': '#334155', 'line-width': 1.25, 'line-opacity': 0.65 }} />
          </Source>
          <Source id="intro-nodes" type="geojson" data={staticData.nodes}>
            <Layer id="intro-node-dots" type="circle" paint={{ 'circle-color': '#111', 'circle-radius': 2 }} />
          </Source>
        </MapGL>
      </div>
      <footer className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl px-8 pb-10 pt-5 sm:px-12">
        <div className="mb-4 flex items-end justify-between gap-4 font-sans">
          <div role="status" aria-live="polite">
            <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-neutral-500">{STEPS[step].name}</p>
            <p className="text-lg font-normal tracking-tight sm:text-2xl">{STEPS[step].text}<span aria-hidden="true">…</span></p>
          </div>
          <span className="shrink-0 font-mono text-xs text-neutral-500">0{step + 1} / 04</span>
        </div>
        <div role="progressbar" aria-label="Preparing map" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step}
          className="h-0.5 overflow-hidden bg-neutral-200">
          <div className={`h-full origin-left bg-black ${ready ? 'startup-progress' : 'scale-x-0'}`} />
        </div>
        <p className="mt-3 text-[9px] tracking-wide text-neutral-400">Map data © OpenStreetMap contributors · Initial risk preview, not confirmed faults</p>
      </footer>
    </main>
  )
}
