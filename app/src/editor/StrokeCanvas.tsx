import { useRef, useState, type ReactNode } from 'react'
import { getStroke } from 'perfect-freehand'
import type { Pt } from './recognize'

interface Props {
  viewBox: [number, number, number, number]
  onStroke: (points: Pt[]) => void
  onTap: (pt: Pt) => void
  children: ReactNode
  inkColor?: string
}

const TAP_PX = 10

/** Tloušťka tahu vůči šířce plátna – stejná pro živý tah, uložené tahy i export. */
export const inkSize = (viewBoxWidth: number) => viewBoxWidth / 250

// Jakmile se v relaci objeví pero, prst už nekreslí (opření dlaně).
let penSeen = false

export function outlinePath(points: Pt[], size: number): string {
  const outline = getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.4 })
  if (!outline.length) return ''
  return 'M' + outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z'
}

/** SVG plátno: tahy perem/myší v souřadnicích viewBoxu (mm), ťuknutí = výběr. */
export function StrokeCanvas({ viewBox, onStroke, onTap, children, inkColor = '#d4572a' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [points, setPoints] = useState<Pt[]>([])
  const active = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null)

  const toUser = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!
    const m = svg.getScreenCTM()!.inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    return [p.x, p.y]
  }

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'pen') penSeen = true
    if (e.pointerType === 'touch' && penSeen) return
    if (active.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false }
    setPoints([toUser(e)])
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    if (Math.hypot(e.clientX - a.startX, e.clientY - a.startY) > TAP_PX) a.moved = true
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    const svg = svgRef.current!
    const m = svg.getScreenCTM()!.inverse()
    const pts = events.map((ev) => {
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m)
      return [p.x, p.y] as Pt
    })
    setPoints((cur) => [...cur, ...pts])
  }

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    active.current = null
    const pts = [...points, toUser(e)]
    setPoints([])
    if (a.moved) onStroke(pts)
    else onTap(pts[0])
  }

  const onCancel = () => {
    active.current = null
    setPoints([])
  }

  const strokeSize = inkSize(viewBox[2])

  return (
    <svg
      ref={svgRef}
      className="stroke-canvas"
      viewBox={viewBox.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      {children}
      {points.length > 1 && <path d={outlinePath(points, strokeSize)} fill={inkColor} opacity={0.8} />}
    </svg>
  )
}
