import { useEffect, useRef, useState } from 'react'

export interface DimField {
  key: string
  label: string
  value: number
  min?: number // výchozí: hodnota musí být kladná
}

interface Props {
  title: string
  fields: DimField[]
  onOk: (values: Record<string, number>) => void
  onCancel: () => void
}

/** Dialog pro zadání kót v mm – velká pole pro dotykovou klávesnici. */
export function DimensionDialog({ title, fields, onOk, onCancel }: Props) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, String(Math.round(f.value))])))
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
    firstRef.current?.select()
  }, [])

  const parsed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v.replace(',', '.'))]))
  const valid = fields.every((f) => {
    const v = parsed[f.key]
    return Number.isFinite(v) && (f.min !== undefined ? v >= f.min : v > 0)
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (valid) onOk(parsed)
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h3>{title}</h3>
        {fields.map((f, i) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input
              ref={i === 0 ? firstRef : undefined}
              inputMode="decimal"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            <em>{['rotation', 'angle', 'fov'].includes(f.key) ? '°' : 'mm'}</em>
          </label>
        ))}
        <div className="dialog-buttons">
          <button type="button" onClick={onCancel}>
            Zrušit
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            OK
          </button>
        </div>
      </form>
    </div>
  )
}
