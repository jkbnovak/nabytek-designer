import type { Cabinet } from './schema'

type Rotation = Cabinet['rotation']
const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v)
export interface Footprint {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Lokální bod korpusu (lx podél šířky, lz do hloubky) → půdorys (x, z). Stejně jako rotace v three.js. */
export function toWorld(cab: Pick<Cabinet, 'x' | 'z' | 'rotation'>, lx: number, lz: number): [number, number] {
  const a = (cab.rotation * Math.PI) / 180
  const c = clean(Math.cos(a))
  const s = clean(Math.sin(a))
  return [cab.x + lx * c + lz * s, cab.z - lx * s + lz * c]
}

export function footprintCorners(cab: Cabinet): [number, number][] {
  return [
    toWorld(cab, 0, 0),
    toWorld(cab, cab.width, 0),
    toWorld(cab, cab.width, cab.depth),
    toWorld(cab, 0, cab.depth),
  ]
}

export function footprint(cab: Cabinet): Footprint {
  const pts = footprintCorners(cab)
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) }
}

/**
 * Z nakresleného obdélníku v půdorysu odvodí korpus. Delší strana = šířka (podél stěny).
 * Úzký obdélník vlevo od středu místnosti stojí u levé stěny (90°), vpravo u pravé (270°).
 */
export function placeFromRect(f: Footprint, roomCenterX: number): Pick<Cabinet, 'x' | 'z' | 'rotation' | 'width' | 'depth'> {
  const w = f.maxX - f.minX
  const d = f.maxZ - f.minZ
  if (w >= d) return { x: f.minX, z: f.minZ, rotation: 0, width: w, depth: d }
  const rotation: Rotation = (f.minX + f.maxX) / 2 < roomCenterX ? 90 : 270
  return rotation === 90
    ? { x: f.minX, z: f.maxZ, rotation, width: d, depth: w }
    : { x: f.maxX, z: f.minZ, rotation, width: d, depth: w }
}

/** Po změně rozměrů zachová obdélník půdorysu ukotvený na stejném min. rohu. */
export function reanchor(cab: Cabinet, f: Footprint): Pick<Cabinet, 'x' | 'z'> {
  const cur = footprint(cab)
  return { x: cab.x + f.minX - cur.minX, z: cab.z + f.minZ - cur.minZ }
}

/** Přichytí hodnotu k nejbližšímu kandidátovi v toleranci, jinak k mřížce. */
export function snap(v: number, candidates: number[], tol: number, grid = 10): number {
  let best = v
  let bestD = tol
  for (const c of candidates) {
    const d = Math.abs(c - v)
    if (d < bestD) {
      best = c
      bestD = d
    }
  }
  return bestD < tol ? best : Math.round(v / grid) * grid
}
