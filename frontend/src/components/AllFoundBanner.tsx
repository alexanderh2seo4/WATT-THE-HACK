import { useState } from 'react'
import { formatClock } from '../format'
import { useStore } from '../store'

/** Benchmark toast: the backend pauses the sim once when every ground-truth fault was found (state.progress).
 * Shown over the map in both views until dismissed; comes back after Reset / scenario change on the next run. */
export function AllFoundBanner() {
  const { state } = useStore()
  const progress = state?.progress
  const t = progress?.all_found_t ?? null
  const [dismissed, setDismissed] = useState(false)
  const [prevT, setPrevT] = useState(t)
  if (t !== prevT) {
    setPrevT(t)
    setDismissed(false) // reset / new scenario (t back to null) or a new run: show again
  }
  if (!progress || t === null || dismissed) return null

  const paused = state?.status === 'paused' && state.t === t
  const confirmed = progress.found.filter((f) => f.t_confirmed != null).length

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center pl-96">
      <div className="pointer-events-auto w-[30rem] rounded-xl bg-white/95 p-4 text-sm shadow-lg ring-1 ring-emerald-200">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">
              All {progress.total} faults found in <span className="font-mono tabular-nums">{formatClock(t)}</span> sim time
            </div>
            <div className="text-xs text-slate-500">
              {paused ? 'Simulation paused · press play to continue' : 'Simulation continues'}
              {' · '}
              {progress.all_confirmed_t != null
                ? `all confirmed in ${formatClock(progress.all_confirmed_t)}`
                : `${confirmed}/${progress.total} confirmed`}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            title="Dismiss"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-1 font-medium">Fault</th>
              <th className="pb-1 font-medium">Line</th>
              <th className="pb-1 font-medium">Found</th>
              <th className="pb-1 font-medium">By</th>
              <th className="pb-1 font-medium">Confirmed</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {progress.found.map((f) => (
              <tr key={f.fault_id} className="border-t border-slate-100">
                <td className="py-1">
                  <span className="font-medium text-slate-900">{f.fault_id}</span> {f.fault_type.replace('_', ' ')}
                </td>
                <td className="py-1">
                  {f.segment_id} km {f.km.toFixed(1)}
                </td>
                <td className="py-1 font-mono tabular-nums">{formatClock(f.t_found)}</td>
                <td className="py-1">{f.drone_id}</td>
                <td className="py-1 font-mono tabular-nums text-slate-400">
                  {f.t_confirmed != null ? formatClock(f.t_confirmed) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
