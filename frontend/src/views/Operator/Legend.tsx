import type { CSSProperties, ReactNode } from 'react'
import { CLEAR_COLOR, RISK_STOPS } from './RiskLayers'
import { DRONE_COLORS } from './Drones'

const Row = ({ swatch, label }: { swatch: ReactNode; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="flex w-7 justify-center">{swatch}</span>
    <span>{label}</span>
  </div>
)

const line = (style: CSSProperties) => <span className="block w-6" style={{ borderTopWidth: 3, ...style }} />

export function Legend({ showVegetation, onToggleVegetation }: { showVegetation: boolean; onToggleVegetation: () => void }) {
  const gradient = `linear-gradient(90deg, ${RISK_STOPS.map(([, c]) => c).join(', ')})`
  return (
    <div className="absolute bottom-3 left-3 w-48 space-y-1.5 rounded-xl bg-white/95 p-3 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
      <div>
        <div className="mb-1 h-1.5 rounded-full" style={{ background: gradient }} />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>low risk</span>
          <span>high</span>
        </div>
      </div>
      <Row swatch={line({ borderColor: CLEAR_COLOR })} label="Checked, clear" />
      <Row swatch={line({ borderColor: '#94a3b8', borderTopStyle: 'dashed' })} label="Dead line" />
      <Row swatch={line({ borderColor: '#334155', borderTopStyle: 'dotted', borderTopWidth: 2 })} label="Planned route" />
      <Row
        swatch={<span className="block h-3 w-5 rounded-sm border border-indigo-300 bg-indigo-50" />}
        label="Report area"
      />
      <Row
        swatch={
          <span className="flex gap-0.5">
            {(['flying', 'charging', 'stranded'] as const).map((s) => (
              <span key={s} className="h-2 w-2 rounded-full" style={{ background: DRONE_COLORS[s] }} />
            ))}
          </span>
        }
        label="Flying · charging · stranded"
      />
      <label className="flex cursor-pointer items-center gap-2 pt-0.5">
        <span className="flex w-7 justify-center">
          <input type="checkbox" checked={showVegetation} onChange={onToggleVegetation} className="accent-lime-600" />
        </span>
        <span>Vegetation</span>
      </label>
    </div>
  )
}
