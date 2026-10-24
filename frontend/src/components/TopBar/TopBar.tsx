import { NavLink } from 'react-router'
import { MOCK, postSimControl } from '../../api'
import { useStore } from '../../store'

const SPEEDS = [1, 10, 60, 300]

function formatClock(t: number) {
  const s = Math.floor(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

export function TopBar() {
  const { state } = useStore()
  const status = state?.status ?? 'setup'
  const running = status === 'running'

  const togglePlay = () =>
    postSimControl({ action: running ? 'pause' : status === 'setup' ? 'start' : 'resume' })
  // Speed changes keep the current run state. Backend only pauses when running and only resumes
  // when paused, so 'pause' is a no-op when already paused; 'resume' is safe while running or in setup
  // (avoids pausing right after Start when the last polled status is still 'setup').
  const setSpeed = (speed: number) => postSimControl({ action: status === 'paused' ? 'pause' : 'resume', speed })

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        <span className="font-semibold tracking-tight">Storm Patrol</span>
        {MOCK && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">mock</span>}
      </div>

      <nav className="flex gap-1">
        <NavLink to="/" end className={tab}>
          Operator
        </NavLink>
        <NavLink to="/setup" className={tab}>
          Simulation
        </NavLink>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-400">{status}</span>
        <span className="w-20 font-mono text-lg tabular-nums">{formatClock(state?.t ?? 0)}</span>
        <button
          onClick={togglePlay}
          title={running ? 'Pause' : 'Play'}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700"
        >
          {running ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5 fill-current">
              <path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
            </svg>
          )}
        </button>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-md px-2.5 py-1 text-sm tabular-nums transition ${
                state?.speed === s ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          onClick={() => postSimControl({ action: 'reset' })}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          Reset
        </button>
      </div>
    </header>
  )
}
