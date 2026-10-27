import type { Assembly } from '../model/schema'
import type { InkStroke } from '../model/planInk'
import { footprintCorners } from '../model/placement'
import { wallMiters, wallQuad, wallSegments, type P2 } from '../model/room'
import { inkSize, outlinePath } from './StrokeCanvas'

export interface PlanLabel {
  text: string
  at: P2
  start?: P2 // u úseku stěny: kroužek na začátku
}

const MAX_PX = 1600
const PAD = 60

/**
 * Vykreslí výřez půdorysu pro Clauda: šedý kontext (existující stěny / korpusy), černý inkoust
 * a modré štítky rozpoznaných tvarů. Vrací PNG v base64.
 */
export function renderPlanImage(
  ink: InkStroke[],
  context: Pick<Assembly, 'room' | 'cabinets'>,
  labels: PlanLabel[],
): { data: string; mediaType: 'image/png' } {
  const segs = context.room ? wallSegments(context.room) : []
  const t = context.room?.wallThickness ?? 0
  const miters = context.room ? wallMiters(segs, context.room.closed, t) : []
  const pts: P2[] = [
    ...ink.flatMap((s) => s.points),
    ...labels.map((l) => l.at),
    ...segs.flatMap((s) => wallQuad(s, t, miters[s.index])),
    ...context.cabinets.flatMap((c) => footprintCorners(c)),
  ]
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const [minX, minZ] = [Math.min(...xs), Math.min(...zs)]
  const [w, h] = [Math.max(...xs) - minX || 1, Math.max(...zs) - minZ || 1]
  const scale = (MAX_PX - 2 * PAD) / Math.max(w, h)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale + 2 * PAD)
  canvas.height = Math.round(h * scale + 2 * PAD)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(scale, 0, 0, scale, PAD - minX * scale, PAD - minZ * scale)

  const fillPoly = (poly: P2[], color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    poly.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
    ctx.closePath()
    ctx.fill()
  }
  segs.forEach((s) => fillPoly(wallQuad(s, t, miters[s.index]), '#c8c8c8'))
  context.cabinets.forEach((c) => fillPoly(footprintCorners(c), '#e4e4e4'))

  ctx.fillStyle = '#111'
  for (const s of ink) ctx.fill(new Path2D(outlinePath(s.points, inkSize(s.viewWidth))))

  // štítky v pixelech, ať mají stálou velikost
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const px = ([x, z]: P2): P2 => [PAD + (x - minX) * scale, PAD + (z - minZ) * scale]
  ctx.font = 'bold 30px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const l of labels) {
    ctx.fillStyle = '#1f5fd0'
    if (l.start) {
      const [sx, sz] = px(l.start)
      ctx.beginPath()
      ctx.arc(sx, sz, 9, 0, Math.PI * 2)
      ctx.fill()
    }
    const [x, z] = px(l.at)
    const tw = ctx.measureText(l.text).width + 14
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(x - tw / 2, z - 19, tw, 38)
    ctx.fillStyle = '#1f5fd0'
    ctx.fillText(l.text, x, z)
  }
  return { data: canvas.toDataURL('image/png').split(',')[1], mediaType: 'image/png' }
}
