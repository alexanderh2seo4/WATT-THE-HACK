import { useEffect, useState } from 'react'
import { getSimConfig, type SimConfig } from '../../api'
import { Map, NetworkLayer } from '../../components/Map'
import { Section, SidebarLayout } from '../../components/Sidebar'

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-400">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {s}
        </span>
      ))}
    </div>
  )
}

export function SimSetup() {
  const [config, setConfig] = useState<SimConfig | null>(null)
  useEffect(() => {
    getSimConfig().then(setConfig).catch(() => setConfig(null))
  }, [])

  return (
    <SidebarLayout
      sidebar={
        <>
          <Section title="Scenario">
            <select disabled className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option>Preset (TODO)</option>
            </select>
            {config && <p className="mt-1 text-xs text-slate-500">seed {config.seed}</p>}
          </Section>
          <Section title="Dead lines (hidden)">
            <Chips items={config?.dead_segments ?? []} empty="None" />
          </Section>
          <Section title="Faults">
            <Chips items={(config?.faults ?? []).map((f) => `${f.segment_id} · ${f.fault_type}`)} empty="None" />
          </Section>
          <Section title="Sensors">
            <Chips items={Object.keys(config?.sensors ?? {})} empty="—" />
          </Section>
          <Section title="Drone">
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
              {Object.entries(config?.drone ?? {}).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-slate-500">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <p className="text-xs text-slate-400">Click a line to mark it dead or add a fault: TODO</p>
        </>
      }
    >
      <Map>
        <NetworkLayer />
      </Map>
    </SidebarLayout>
  )
}
