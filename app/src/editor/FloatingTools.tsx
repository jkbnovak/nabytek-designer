import { useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToolbarTarget } from './toolbar'

const KEY = 'nabytek-designer:floating-tools'
const WIDTH = 104 // úzký svislý sloupec

/** Lišta nástrojů: normálně na svém místě, v režimu celé obrazovky v plovoucím panelu (order = pořadí v panelu). */
export function ToolbarSlot({ order, children }: { order: number; children: ReactNode }) {
  const target = useContext(ToolbarTarget)
  if (!target) return <>{children}</>
  return createPortal(
    <div className="tool-slot" style={{ order }}>
      {children}
    </div>,
    target,
  )
}

interface Pos {
  x: number
  y: number
  collapsed: boolean
}

function loadPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '') as Pos
    if (typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch {
    // výchozí poloha
  }
  return { x: 12, y: 12, collapsed: false }
}

const clamp = (p: Pos): Pos => ({
  ...p,
  x: Math.max(0, Math.min(window.innerWidth - 120, p.x)),
  y: Math.max(0, Math.min(window.innerHeight - 40, p.y)),
})

/** Plovoucí panel nástrojů (jako ve Photoshopu): táhne se za hlavičku, jde sbalit, pamatuje si polohu. */
export function FloatingTools({ onBody }: { onBody: (el: HTMLElement | null) => void }) {
  const [pos, setPos] = useState(() => clamp(loadPos()))
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)

  useEffect(() => {
    onBody(body)
    if (!body) return
    // tlačítka v panelu nekradou fokus – psaná poznámka zůstane rozbalená a klik nemine (panel se nezúží pod myší).
    // Nativní posluchač: obsah panelu je portál, React události z něj sem nebublají.
    const keepFocus = (e: MouseEvent) => (e.target as HTMLElement).closest('button') && e.preventDefault()
    body.addEventListener('mousedown', keepFocus)
    return () => body.removeEventListener('mousedown', keepFocus)
  }, [body, onBody])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(pos))
    } catch {
      // nevadí
    }
  }, [pos])

  return (
    <div
      className={'floating-tools' + (pos.collapsed ? ' collapsed' : '')}
      style={{ left: pos.x, top: pos.y, width: pos.collapsed ? undefined : WIDTH }}
    >
      <div
        className="floating-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag({ dx: e.clientX - pos.x, dy: e.clientY - pos.y })
        }}
        onPointerMove={(e) => drag && setPos((p) => clamp({ ...p, x: e.clientX - drag.dx, y: e.clientY - drag.dy }))}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        title="Táhni pro přesun panelu"
      >
        <span className="grip">⋮⋮</span>
        <strong>Nástroje</strong>
        <button onClick={() => setPos((p) => ({ ...p, collapsed: !p.collapsed }))} title={pos.collapsed ? 'Rozbalit' : 'Sbalit'}>
          {pos.collapsed ? '▸' : '▾'}
        </button>
      </div>
      {/* tělo zůstává i sbalené (jen skryté), aby lišty nepřišly o stav */}
      <div className="floating-body" ref={setBody} hidden={pos.collapsed} />
    </div>
  )
}
