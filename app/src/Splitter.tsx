import { useState, type RefObject } from 'react'

const SNAP = 4 // % od okraje – panel se úplně schová

/** Posuvná dělicí čára mezi editorem a 3D. Tažení u okraje panel schová, dvojklik vrátí půl na půl. */
export function Splitter({ container, split, onSplit }: { container: RefObject<HTMLElement | null>; split: number; onSplit: (v: number) => void }) {
  const [dragging, setDragging] = useState(false)

  const move = (e: React.PointerEvent) => {
    if (!dragging || !container.current) return
    const r = container.current.getBoundingClientRect()
    // na úzké obrazovce jsou panely pod sebou
    const vertical = window.matchMedia('(max-width: 800px)').matches
    let v = vertical ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100
    if (v < SNAP) v = 0
    if (v > 100 - SNAP) v = 100
    onSplit(Math.round(v * 10) / 10)
  }

  return (
    <div
      className={'splitter' + (dragging ? ' dragging' : '')}
      role="separator"
      aria-label="Posunout dělicí čáru"
      title="Táhni pro změnu velikosti · dvojklik = půl na půl"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return // tlačítko „zobrazit panel“ se netáhne
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={move}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onSplit(50)}
    >
      <span className="grip" />
      {split === 0 && (
        <button className="splitter-restore" onClick={() => onSplit(50)} title="Zobrazit editor">
          ›
        </button>
      )}
      {split === 100 && (
        <button className="splitter-restore" onClick={() => onSplit(50)} title="Zobrazit 3D">
          ‹
        </button>
      )}
    </div>
  )
}
