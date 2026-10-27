import { useEffect, useRef, useState } from 'react'

const BRIEF_PLACEHOLDER = `Co děláme – např. obývací stěna s TV, celá stěna 4 m, podkroví
Představy – styl, materiály, barvy, co se má kam vejít
Co nevím / s čím poradit – např. nevím, jak řešit roh se šikminou
Ostatní – rozpočet, termín, kdo to bude vyrábět`

interface Props {
  title: string
  name: string
  brief: string
  okLabel: string
  onOk: (p: { name: string; brief: string }) => void
  onCancel: () => void
}

/** Založení / úprava projektu: název a zadání, které dostane Claude jako kontext ke každému převodu. */
export function ProjectDialog({ title, name: initialName, brief: initialBrief, okLabel, onOk, onCancel }: Props) {
  const [name, setName] = useState(initialName)
  const [brief, setBrief] = useState(initialBrief)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onOk({ name: name.trim() || 'Nový projekt', brief: brief.trim() })
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="dialog project-dialog" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h3>{title}</h3>
        <label className="stack">
          <span>Název</span>
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="stack">
          <span>Zadání pro AI – kontext ke všem převodům</span>
          <textarea value={brief} rows={8} placeholder={BRIEF_PLACEHOLDER} onChange={(e) => setBrief(e.target.value)} />
        </label>
        <div className="dialog-buttons">
          <button type="button" onClick={onCancel}>
            Zrušit
          </button>
          <button type="submit" className="primary">
            {okLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
