import type { Camera } from '../model/schema'
import { NumberField } from './Inspector'

export function CameraInspector({ camera: c, onChange, onDelete }: { camera: Camera; onChange: (p: Partial<Camera>) => void; onDelete: () => void }) {
  return (
    <div className="inspector">
      <label className="field wide">
        <span>Název</span>
        <input value={c.label} placeholder="Pohled od dveří…" onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <NumberField label="Výška oka" value={c.position[1]} onCommit={(v) => onChange({ position: [c.position[0], v!, c.position[2]] })} />
      <NumberField label="Výška cíle" value={c.target[1]} allowZero onCommit={(v) => onChange({ target: [c.target[0], v ?? 0, c.target[2]] })} />
      <NumberField label="Zorný úhel °" value={c.fov} onCommit={(v) => onChange({ fov: Math.max(10, Math.min(120, v!)) })} />
      <div className="actions">
        <button className="danger" onClick={onDelete}>
          Smazat kameru
        </button>
      </div>
    </div>
  )
}
