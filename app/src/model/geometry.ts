import type { Cabinet, Zone } from './schema'
import { planeAt, type CeilingPlane } from './ceiling'

export type PartRole = 'side' | 'top' | 'bottom' | 'back' | 'plinth' | 'divider' | 'shelf' | 'door' | 'drawer' | 'rod'

export type V3 = [number, number, number]

// Díl v lokálních souřadnicích korpusu: počátek = levý zadní dolní roh, rozměry v mm.
// hull = konvexní těleso z bodů `points` (díl seříznutý šikminou); size/center pak popisují jeho obálku.
export interface Part {
  role: PartRole
  shape: 'box' | 'cylinder' | 'hull'
  size: V3
  center: V3
  points?: V3[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const BACK = 8 // tloušťka zad (HDF/DTD)
const GAP = 3 // spára mezi frontami
const PLINTH_SETBACK = 50
const ROD_DIAMETER = 25

const box = (role: PartRole, x0: number, y0: number, z0: number, w: number, h: number, d: number): Part => ({
  role,
  shape: 'box',
  size: [w, h, d],
  center: [x0 + w / 2, y0 + h / 2, z0 + d / 2],
})

/** Rozdělí délku `total` na části s příčkami tloušťky t mezi nimi. Vrací světlé rozměry. */
export function splitSizes(total: number, sizes: (number | null)[], t: number): number[] {
  const free = total - t * (sizes.length - 1)
  const fixed = sizes.reduce<number>((s, v) => s + (v ?? 0), 0)
  const flexCount = sizes.filter((v) => v === null).length
  const flex = flexCount ? (free - fixed) / flexCount : 0
  return sizes.map((v) => v ?? flex)
}

export type Leaf = Extract<Zone, { kind: 'leaf' }>

// Světlé pole korpusu (list stromu členění) – pro 2D pohled a výběr.
export interface Cell {
  path: number[]
  rect: Rect
  zone: Leaf
}

export function cabinetCells(cab: Cabinet): Cell[] {
  const cells: Cell[] = []
  layoutZone(cab.interior, innerRect(cab), cab, [], [], cells)
  return cells
}

const innerRect = (cab: Cabinet): Rect => ({
  x: cab.thickness,
  y: cab.plinth + cab.thickness,
  w: cab.width - 2 * cab.thickness,
  h: cab.height - cab.plinth - 2 * cab.thickness,
})

/** Díly korpusu; s `ceiling` seříznuté šikminou / podhledem schodiště (horní deska jde šikmo pod ní). */
export function cabinetParts(cab: Cabinet, ceiling: CeilingPlane | null = null): Part[] {
  const { width: w, height: h, depth: d, thickness: t, plinth } = cab
  const parts: Part[] = [
    box('side', 0, 0, 0, t, h, d),
    box('side', w - t, 0, 0, t, h, d),
    box('top', t, h - t, 0, w - 2 * t, t, d),
    box('bottom', t, plinth, 0, w - 2 * t, t, d),
    box('back', t, plinth + t, 0, w - 2 * t, h - plinth - 2 * t, BACK),
  ]
  if (plinth > 0) parts.push(box('plinth', t, 0, d - PLINTH_SETBACK - t, w - 2 * t, plinth, t))

  layoutZone(cab.interior, innerRect(cab), cab, [], parts, [])
  return ceiling ? fitUnderCeiling(parts, cab, ceiling) : parts
}

const MIN_CUT_PART = 20 // menší zbytek dílu po seříznutí se vynechá

function boxCorners(p: Part): V3[] {
  const [cx, cy, cz] = p.center
  const [w, h, d] = p.size.map((v) => v / 2)
  return [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz): V3 => [cx + sx * w, cy + sy * h, cz + sz * d])))
}

/**
 * Ořízne konvexní těleso (dané body) poloprostorem f(p) ≤ 0. Nové vrcholy leží na úsečkách mezi body
 * z opačných stran – u konvexního tělesa to zahrnuje všechny hrany, ostatní průsečíky leží uvnitř.
 */
function clipHull(points: V3[], f: (p: V3) => number): V3[] {
  const vals = points.map(f)
  if (vals.every((v) => v <= 0)) return points
  const out = points.filter((_, i) => vals[i] <= 0)
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const [a, b] = [vals[i], vals[j]]
      if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
        const t = a / (a - b)
        out.push(points[i].map((v, k) => v + (points[j][k] - v) * t) as V3)
      }
    }
  return out
}

function hullPart(role: PartRole, points: V3[]): Part | null {
  if (points.length < 4) return null
  const min = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])))
  const max = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])))
  const size = max.map((v, k) => v - min[k]) as V3
  if (size.some((v) => v < 1) || size[1] < MIN_CUT_PART) return null
  return { role, shape: 'hull', size, center: min.map((v, k) => v + size[k] / 2) as V3, points }
}

/** Seřízne díly rovinou stropu; horní deska se nahradí šikmou deskou těsně pod ní. */
function fitUnderCeiling(parts: Part[], cab: Cabinet, ceiling: CeilingPlane): Part[] {
  const under = (p: V3) => p[1] - planeAt(ceiling, p[0], p[2])
  const out: Part[] = []
  for (const part of parts) {
    if (part.shape === 'cylinder') {
      // tyč: zůstane, jen když se pod šikminu celá vejde
      const [cx, cy, cz] = part.center
      const top = cy + part.size[1] / 2
      if (top <= Math.min(planeAt(ceiling, cx - part.size[0] / 2, cz), planeAt(ceiling, cx + part.size[0] / 2, cz))) out.push(part)
      continue
    }
    const corners = boxCorners(part)
    if (corners.every((c) => under(c) <= 0)) {
      out.push(part)
      continue
    }
    const clipped = hullPart(part.role, clipHull(corners, under))
    if (clipped) out.push(clipped)
    if (part.role === 'top') {
      // šikmá horní deska: pás tloušťky t pod rovinou stropu, mezi boky, do výšky korpusu
      const t = cab.thickness
      const low = Math.min(...corners.map((c) => planeAt(ceiling, c[0], c[2]))) - t
      const slab = boxCorners(box('top', t, Math.max(0, low), 0, cab.width - 2 * t, cab.height - Math.max(0, low), cab.depth))
      const sloped = hullPart('top', clipHull(clipHull(slab, under), (p) => planeAt(ceiling, p[0], p[2]) - t - p[1]))
      if (sloped) out.push(sloped)
    }
  }
  return out
}

function layoutZone(zone: Zone, r: Rect, cab: Cabinet, path: number[], out: Part[], cells: Cell[]): void {
  const t = cab.thickness
  const z0 = BACK
  const innerDepth = cab.depth - BACK

  if (zone.kind === 'split') {
    const horizontal = zone.axis === 'x'
    const sizes = splitSizes(horizontal ? r.w : r.h, zone.parts.map((p) => p.size), t)
    let pos = horizontal ? r.x : r.y
    zone.parts.forEach((p, i) => {
      const sub: Rect = horizontal ? { x: pos, y: r.y, w: sizes[i], h: r.h } : { x: r.x, y: pos, w: r.w, h: sizes[i] }
      layoutZone(p.zone, sub, cab, [...path, i], out, cells)
      pos += sizes[i]
      if (i < zone.parts.length - 1) {
        out.push(
          horizontal
            ? box('divider', pos, r.y, z0, t, r.h, innerDepth)
            : box('shelf', r.x, pos, z0, r.w, t, innerDepth),
        )
        pos += t
      }
    })
    return
  }

  cells.push({ path, rect: r, zone })
  const { fill, front } = zone
  if (fill.type === 'open' && fill.shelves > 0) {
    const step = (r.h - fill.shelves * t) / (fill.shelves + 1)
    for (let i = 1; i <= fill.shelves; i++) {
      out.push(box('shelf', r.x, r.y + i * step + (i - 1) * t, z0, r.w, t, innerDepth - 20))
    }
  } else if (fill.type === 'rod') {
    out.push({
      role: 'rod',
      shape: 'cylinder',
      size: [r.w, ROD_DIAMETER, ROD_DIAMETER],
      center: [r.x + r.w / 2, r.y + r.h - 60, z0 + innerDepth / 2],
    })
  }

  // Fronty: na polovinu tloušťky okolních desek (polonaložené), se spárou.
  const fx = r.x - t / 2 + GAP / 2
  const fw = r.w + t - GAP
  const fy = r.y - t / 2 + GAP / 2
  const fh = r.h + t - GAP
  if (fill.type === 'drawers') {
    const each = (fh - GAP * (fill.count - 1)) / fill.count
    for (let i = 0; i < fill.count; i++) {
      out.push(box('drawer', fx, fy + i * (each + GAP), cab.depth, fw, each, t))
    }
  } else if (front !== 'none') {
    out.push(box('door', fx, fy, cab.depth, fw, fh, t))
  }
}
