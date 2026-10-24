import type { CSSProperties, ReactNode } from 'react'
import { CLEAR_COLOR, RISK_STOPS } from './RiskLayers'
import { DRONE_COLORS } from './Drones'
import { REC_STYLE, type RecKind } from './Recommendations'

const Row = ({ swatch, label }: { swatch: ReactNode; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="flex w-6 justify-center">{swatch}</span>
    <span>{label}</span>
  </div>
)

const line = (style: CSSProperties) => <span className="block w-5" style={{ borderTopWidth: 3, ...style }} />

const dot = (color: string, key?: string) => <span key={key} className="h-2 w-2 rounded-full" style={{ background: color }} />

export function Legend({ showVegetation, onToggleVegetation }: { showVegetation: boolean; onToggleVegetation: () => void }) {
  const gradient = `linear-gradient(90deg, ${RISK_STOPS.map(([, c]) => c).join(', ')})`
  return (
    <div className="absolute bottom-3 left-3 w-56 space-y-1 rounded-xl bg-white/95 p-2.5 text-[11px] text-slate-600 shadow-sm ring-1 ring-slate-200">
      <div className="pb-0.5">
        <div className="mb-0.5 h-1.5 rounded-full" style={{ background: gradient }} />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>low fault risk</span>
          <span>high</span>
        </div>
      </div>
      <Row swatch={line({ borderColor: CLEAR_COLOR })} label="Checked, clear" />
      <Row swatch={line({ borderColor: '#94a3b8', borderTopStyle: 'dashed' })} label="Dead line" />
      <Row swatch={line({ borderColor: '#334155', borderTopStyle: 'dotted', borderTopWidth: 2 })} label="Planned route" />
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
