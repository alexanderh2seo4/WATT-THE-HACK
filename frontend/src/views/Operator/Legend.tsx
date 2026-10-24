import type { CSSProperties, ReactNode } from 'react'
import { DEAD_COLOR } from '../../components/Map'
import { CLEAR_COLOR, RISK_STOPS } from './RiskLayers'
import { DRONE_COLORS } from './Drones'
import { REC_STYLE, type RecKind } from './Recommendations'

const Row = ({ swatch, label }: { swatch: ReactNode; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="flex w-6 justify-center">{swatch}</span>
    <span>{label}</span>
  </div>
)

const line = (style: CSSProperties) => <span className="block w-5" style={{ borderTopWidth: 4, ...style }} />

const dot = (color: string, key?: string) => <span key={key} className="h-2 w-2 rounded-full" style={{ background: color }} />

export function Legend({ showVegetation, onToggleVegetation }: { showVegetation: boolean; onToggleVegetation: () => void }) {
  // stops evenly spaced, matching the map's log-ish breakpoints: every colour band gets the same width
  const gradient = `linear-gradient(90deg, ${RISK_STOPS.map(([, c]) => c).join(', ')})`
  const last = RISK_STOPS.length - 1
  return (
    <div className="absolute bottom-3 left-3 w-56 space-y-1 rounded-xl bg-white/95 p-2.5 text-[11px] text-slate-600 shadow-sm ring-1 ring-slate-200">
      <div className="pb-0.5">
        <div className="mb-1 flex justify-between text-[10px] text-slate-400">
          <span className="text-slate-500">Fault risk</span>
          <span>40% confirm · 80% crew</span>
        </div>
        <div className="mx-2 h-2 rounded-full" style={{ background: gradient }} />
        <div className="relative mx-2 h-3.5 text-[10px] text-slate-400">
          {RISK_STOPS.map(([v], i) => (
            <span
              key={v}
              className={`absolute top-0 -translate-x-1/2 ${v === 0.4 || v === 0.8 ? 'font-medium text-slate-600' : ''}`}
              style={{ left: `${(i / last) * 100}%` }}
            >
              {Math.round(v * 100)}%
            </span>
          ))}
        </div>
      </div>
      <Row swatch={line({ borderColor: CLEAR_COLOR })} label="Checked, clear" />
      <Row swatch={line({ borderColor: DEAD_COLOR, borderTopStyle: 'dashed' })} label="Dead line" />
      <Row swatch={line({ borderColor: '#1e293b', borderTopStyle: 'dotted', borderTopWidth: 3 })} label="Planned route" />
      <Row swatch={<span className="block h-2.5 w-5 rounded-sm border border-indigo-300 bg-indigo-50" />} label="Report area" />
      <Row
        swatch={<span className="flex gap-0.5">{(['flying', 'charging', 'stranded'] as const).map((s) => dot(DRONE_COLORS[s], s))}</span>}
        label="Drone flying · charging · stranded"
      />
      <Row
        swatch={
          <span className="flex gap-0.5">
            {(['crew', 'confirm', 'cleared'] as RecKind[]).map((k) => dot(REC_STYLE[k].color, k))}
          </span>
        }
        label="Send crew · confirm · cleared"
      />
      <label className="flex cursor-pointer items-center gap-2">
        <span className="flex w-6 justify-center">
          <input type="checkbox" checked={showVegetation} onChange={onToggleVegetation} className="h-3 w-3 accent-lime-600" />
        </span>
        <span>Vegetation</span>
      </label>
    </div>
  )
}
