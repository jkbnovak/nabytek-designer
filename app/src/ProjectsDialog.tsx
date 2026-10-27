import { useRef, useState } from 'react'
import type { ProjectMeta } from './projects'

interface Props {
  projects: ProjectMeta[]
  currentId: string
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: (text: string) => void
  onNew: () => void
  onSample: () => void
  onClose: () => void
}

const when = (t: number) =>
  new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Seznam projektů: otevřít, uložit do souboru, smazat; nový, vzor, načtení ze souboru. */
export function ProjectsDialog({ projects, currentId, onOpen, onDelete, onExport, onImport, onNew, onSample, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const sorted = [...projects].sort((a, b) => b.updated - a.updated)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onImport(await file.text())
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog projects-dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h3>Projekty</h3>
        <ul className="project-list">
          {sorted.map((p) => (
            <li key={p.id} className={p.id === currentId ? 'current' : ''}>
              <button className="open" onClick={() => onOpen(p.id)} disabled={p.id === currentId}>
                <strong>{p.name}</strong>
                <span>{p.id === currentId ? 'otevřený' : when(p.updated)}</span>
              </button>
              <button onClick={() => onExport(p.id)} title="Uložit do souboru (záloha, přenos na jiné zařízení)">
                ⬇ Soubor
              </button>
              {confirmDelete === p.id ? (
                <button className="danger" onClick={() => onDelete(p.id)}>
                  Opravdu smazat
                </button>
              ) : (
                <button className="danger" onClick={() => setConfirmDelete(p.id)} title="Smazat projekt">
                  🗑
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="dialog-buttons">
          <button onClick={() => fileRef.current?.click()}>⬆ Načíst ze souboru</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
          <button onClick={onSample}>Vzor: ložnice</button>
          <button className="primary" onClick={onNew}>
            + Nový projekt
          </button>
          <button onClick={onClose}>Zavřít</button>
        </div>
      </div>
    </div>
  )
}
