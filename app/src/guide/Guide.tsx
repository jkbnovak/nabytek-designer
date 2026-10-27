import type { Assembly } from '../model/schema'
import { projectKey } from '../projects'
import { guideSteps, type GuideAction } from './steps'

function advisorCount(projectId: string): number {
  try {
    const raw = localStorage.getItem(projectKey(projectId, 'advisor'))
    return raw ? (JSON.parse(raw) as unknown[]).length : 0
  } catch {
    return 0
  }
}

interface Props {
  projectId: string
  assembly: Assembly
  onAction: (a: GuideAction) => void
  onClose: () => void
}

/** Průvodce postupem projektu: kroky s krátkým návodem, hotové se odškrtnou samy podle modelu. */
export function Guide({ projectId, assembly, onAction, onClose }: Props) {
  const steps = guideSteps(assembly, advisorCount(projectId))
  const required = steps.filter((s) => !s.optional && s.done !== null)
  const doneCount = required.filter((s) => s.done).length
  const current = steps.find((s) => !s.optional && s.done === false)

  return (
    <aside className="guide-panel">
      <header>
        <strong>🧭 Průvodce projektem</strong>
        <span className="guide-progress">
          {doneCount} / {required.length}
        </span>
        <button onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </header>
      <ol className="guide-steps">
        {steps.map((s) => (
          <li key={s.id} className={(s.done ? 'done' : '') + (s === current ? ' current' : '')}>
            <div className="guide-title">
              <span className="guide-check">{s.done ? '✓' : s.done === null ? '•' : ''}</span>
              {s.title}
              {s.optional && <em> nepovinné</em>}
            </div>
            {/* hotové kroky jen stručně; aktuální a nehotové s návodem */}
            {(!s.done || s === current) && <p>{s.text}</p>}
            {!s.done && s.actions.length > 0 && (
              <div className="guide-actions">
                {s.actions.map((a) => (
                  <button key={a.label} className={s === current ? 'primary' : ''} disabled={a.disabled} onClick={() => onAction(a.action)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="guide-tips">
        Tipy: Ctrl+Z vrací krok zpět · dělicí čáru mezi editorem a 3D jde posunout (dvojklik = půl na půl) · projekty zálohuj v 🗂 Projekty →
        ⬇ Soubor.
      </p>
    </aside>
  )
}
