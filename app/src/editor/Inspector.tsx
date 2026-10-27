import { useEffect, useState } from 'react'
import type { Cabinet, Fill, Front, Zone } from '../model/schema'
import type { Leaf } from '../model/geometry'
import { MaterialPicker } from '../materials/MaterialPicker'

/** Číselné pole, které potvrzuje změnu až po Enteru / opuštění (jeden krok historie). */
export function NumberField({
  label,
  value,
  onCommit,
  allowEmpty,
  allowZero,
}: {
  label: string
  value: number | null
  onCommit: (v: number | null) => void
  allowEmpty?: boolean
  allowZero?: boolean
}) {
  const [text, setText] = useState(value === null ? '' : String(Math.round(value)))
  useEffect(() => setText(value === null ? '' : String(Math.round(value))), [value])
  const commit = () => {
    if (text.trim() === '' && allowEmpty) return value !== null && onCommit(null)
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n !== value) onCommit(n)
    else setText(value === null ? '' : String(Math.round(value)))
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={allowEmpty ? 'auto' : ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, min, onChange }: { value: number; min: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span>{value}</span>
      <button onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

interface CabinetProps {
  cab: Cabinet
  defaults: { carcass: string; fronts: string } // materiály projektu
  ceiling: 'cut' | 'conflict' | null // vztah k šikmině / schodům
  onChange: (patch: Partial<Cabinet>) => void
  onDelete: () => void
  onOpenElevation: () => void
}

export function CabinetInspector({ cab, defaults, ceiling, onChange, onDelete, onOpenElevation }: CabinetProps) {
  return (
    <div className="inspector">
      <label className="field wide">
        <span>Název</span>
        <input value={cab.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <NumberField label="Šířka" value={cab.width} onCommit={(v) => onChange({ width: v! })} />
      <NumberField label="Výška" value={cab.height} onCommit={(v) => onChange({ height: v! })} />
      <NumberField label="Hloubka" value={cab.depth} onCommit={(v) => onChange({ depth: v! })} />
      <NumberField label="Sokl" value={cab.plinth} allowZero onCommit={(v) => onChange({ plinth: v ?? 0 })} />
      <NumberField label="Zavěšení" value={cab.elevation} allowZero onCommit={(v) => onChange({ elevation: v ?? 0 })} />
      <NumberField label="Otočení °" value={cab.rotation} allowZero onCommit={(v) => onChange({ rotation: v ?? 0 })} />
      <MaterialPicker
        label="Korpus"
        value={cab.carcassMaterial}
        inherited={defaults.carcass}
        onChange={(id) => onChange({ carcassMaterial: id })}
      />
      <MaterialPicker
        label="Fronty"
        value={cab.frontsMaterial}
        inherited={defaults.fronts}
        onChange={(id) => onChange({ frontsMaterial: id })}
      />
      {ceiling && (
        <label className={'field wide ceiling-fit' + (ceiling === 'conflict' ? ' conflict' : '')}>
          <span>{ceiling === 'conflict' ? '⚠ Zasahuje do šikminy / schodů' : '◢ Pod šikminou / schody'}</span>
          <span className="check">
            <input
              type="checkbox"
              checked={cab.fitCeiling !== false}
              onChange={(e) => onChange({ fitCeiling: e.target.checked ? undefined : false })}
            />
            Zkosit automaticky
          </span>
        </label>
      )}
      <div className="actions">
        <button className="primary" onClick={onOpenElevation}>
          Členění →
        </button>
        <button className="danger" onClick={onDelete}>
          Smazat
        </button>
      </div>
    </div>
  )
}

interface CellProps {
  leaf: Leaf
  size: number | null
  inSplit: boolean
  onChange: (zone: Zone) => void
  onSize: (size: number | null) => void
  onMerge: () => void
}

export function CellInspector({ leaf, size, inSplit, onChange, onSize, onMerge }: CellProps) {
  const setFill = (fill: Fill) => onChange({ ...leaf, fill })
  const setFront = (front: Front) => onChange({ ...leaf, front })
  const { fill } = leaf
  return (
    <div className="inspector">
      <div className="field wide">
        <span>Obsah</span>
        <Seg
          value={fill.type}
          options={[
            ['open', 'Police'],
            ['rod', 'Tyč'],
            ['drawers', 'Šuplíky'],
          ]}
          onChange={(t) =>
            setFill(t === 'open' ? { type: 'open', shelves: 0 } : t === 'rod' ? { type: 'rod' } : { type: 'drawers', count: 3 })
          }
        />
      </div>
      {fill.type === 'open' && (
        <div className="field">
          <span>Počet polic</span>
          <Stepper value={fill.shelves} min={0} onChange={(n) => setFill({ type: 'open', shelves: n })} />
        </div>
      )}
      {fill.type === 'drawers' && (
        <div className="field">
          <span>Počet šuplíků</span>
          <Stepper value={fill.count} min={1} onChange={(n) => setFill({ type: 'drawers', count: n })} />
        </div>
      )}
      {fill.type !== 'drawers' && (
        <div className="field wide">
          <span>Front</span>
          <Seg
            value={leaf.front}
            options={[
              ['none', 'Otevřené'],
              ['door-left', 'Dvířka L'],
              ['door-right', 'Dvířka P'],
            ]}
            onChange={setFront}
          />
        </div>
      )}
      {inSplit && (
        <>
          <NumberField label="Rozměr pole" value={size} allowEmpty onCommit={onSize} />
          <div className="actions">
            <button className="danger" onClick={onMerge}>
              Zrušit dělení
            </button>
          </div>
        </>
      )}
    </div>
  )
}
