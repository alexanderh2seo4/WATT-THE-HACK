import type { ReactNode } from 'react'
import { postSimControl, postStartPositions, putInputs } from '../../api'
import { Map, NetworkLayer } from '../../components/Map'
import { Section, SidebarLayout } from '../../components/Sidebar'
import { useStore } from '../../store'

function Step({
  n,
  title,
  active,
  enabled,
  children,
}: {
  n: number
  title: string
  active: boolean
  enabled: boolean
  children?: ReactNode
}) {
  return (
    <li className={`flex gap-3 ${enabled ? '' : 'opacity-40'}`}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {n}
      </span>
      <div className="flex-1 pb-4">
        <div className={`text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-500'}`}>{title}</div>
        {active && <div className="mt-2 space-y-2">{children}</div>}
      </div>
    </li>
  )
}

const btn =
  'w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40'

export function Operator() {
  const { staticData, state } = useStore()
  const inputs = state?.inputs
  const hasInputs = !!inputs && inputs.reports.length > 0
  const hasStarts = (state?.start_positions.length ?? 0) > 0
  const live = !!state && state.status !== 'setup'
  const step = live ? 3 : hasStarts ? 3 : hasInputs ? 2 : 1

  return (
    <SidebarLayout
      sidebar={
        <>
          <Section title="Workflow">
            <ol>
              <Step n={1} title="Inputs" active={step === 1} enabled>
                <button
                  className={btn}
                  disabled={!staticData}
                  onClick={() => staticData && putInputs(staticData.default_inputs)}
                >
                  Load default reports
                </button>
                <p className="text-xs text-slate-500">Upload & known-dead chips: TODO</p>
              </Step>
              <Step n={2} title="Find start positions" active={step === 2} enabled={hasInputs}>
                <button className={btn} onClick={() => postStartPositions()}>
                  Find start positions
                </button>
              </Step>
              <Step n={3} title="Run" active={step === 3} enabled={hasStarts || live}>
                {!live && (
                  <button className={btn} onClick={() => postSimControl({ action: 'start' })}>
                    Start mission
                  </button>
                )}
                {live && <p className="text-xs text-slate-500">{state.drones.length} drones in the air</p>}
              </Step>
            </ol>
          </Section>

          <Section title="Log">
            <ul className="space-y-1.5 text-sm">
              {(state?.events ?? [])
                .slice()
                .reverse()
                .map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-xs text-slate-400">{Math.round(e.t / 60)}′</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              {!state?.events.length && <li className="text-slate-400">No events yet</li>}
            </ul>
          </Section>
        </>
      }
    >
      <Map>
        <NetworkLayer />
      </Map>
    </SidebarLayout>
  )
}
