import { useEffect, useRef, useState } from 'react'
import { MATERIAL_GROUPS, MATERIALS, material, type Material } from './library'

function Swatch({ m }: { m: Material }) {
  const bg = m.grain ? `repeating-linear-gradient(90deg, ${m.color} 0 5px, ${m.grain} 5px 6px, ${m.color} 6px 9px)` : m.color
  return <span className="swatch" style={{ background: bg }} />
}

interface Props {
  label: string
  value: string | undefined // undefined = dědí z projektu
  inherited?: string // materiál projektu – nabídne se volba „jako projekt“
  onChange: (id: string | undefined) => void
}

/** Výběr materiálu z knihovny: tlačítko se vzorkem, po rozkliknutí mřížka po skupinách. */
export function MaterialPicker({ label, value, inherited, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = material(value ?? inherited)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (id: string | undefined) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="field wide material-picker" ref={ref}>
      <span>{label}</span>
      <button type="button" className="material-current" onClick={() => setOpen((o) => !o)}>
        <Swatch m={current} />
        {current.name}
        {inherited && value === undefined && <em> (projekt)</em>}
      </button>
      {open && (
        <div className="material-pop">
          {inherited && (
            <button type="button" className={value === undefined ? 'on' : ''} onClick={() => pick(undefined)}>
              <Swatch m={material(inherited)} /> Jako projekt – {material(inherited).name}
            </button>
          )}
          {MATERIAL_GROUPS.map((g) => (
            <div key={g.kind}>
              <h4>{g.label}</h4>
              <div className="material-grid">
                {MATERIALS.filter((m) => m.kind === g.kind).map((m) => (
                  <button type="button" key={m.id} className={value === m.id ? 'on' : ''} onClick={() => pick(m.id)} title={m.code}>
                    <Swatch m={m} />
                    <span>
                      {m.name}
                      {m.code && (
                        <small>
                          {m.brand ? `${m.brand} ` : ''}
                          {m.code}
                        </small>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
