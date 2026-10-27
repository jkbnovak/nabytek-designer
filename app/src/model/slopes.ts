import type { Room, Slope, Stairs } from './schema'
import { toWorld } from './placement'
import { pointInPolygon, pointOnWall, wallCoords, wallSegments, type P2, type WallSeg } from './room'

// Šikmé stropy: krov u stěny a podhled schodiště. Výšky v mm od podlahy.

const deg = (rad: number) => (rad * 180) / Math.PI

/** Sklon šikminy ve stupních od vodorovné. */
export const slopeAngle = (s: Pick<Slope, 'kneeHeight' | 'depth'>, roomHeight: number) =>
  deg(Math.atan2(Math.max(0, roomHeight - s.kneeHeight), s.depth))

/** Hloubka šikminy pro zadaný sklon (kde šikmina dosáhne výšky stropu). */
export const slopeDepthFor = (kneeHeight: number, angleDeg: number, roomHeight: number) =>
  Math.round((roomHeight - kneeHeight) / Math.tan((Math.max(1, Math.min(89, angleDeg)) * Math.PI) / 180) / 10) * 10

/** Půdorys šikminy: pás podél stěny od jejího líce do hloubky depth (poslední dva body = linie zlomu). */
export const slopeQuad = (seg: WallSeg, s: Slope): P2[] => [
  seg.a,
  seg.b,
  pointOnWall(seg, seg.length, s.depth),
  pointOnWall(seg, 0, s.depth),
]

/** Rohy schodiště v pořadí: začátek vlevo, konec vlevo, konec vpravo, začátek vpravo (stoupá od začátku ke konci). */
export function stairsCorners(st: Stairs): P2[] {
  const [l, w] = [st.length / 2, st.width / 2]
  return [
    [-l, -w],
    [l, -w],
    [l, w],
    [-l, w],
  ].map(([lx, lz]) => toWorld(st, lx, lz))
}

const EPS = 1 // mm – body přesně na líci stěny / hraně schodiště počítat dovnitř

/** Výška podhledu schodiště jako lineární funkce (bez omezení na rameno). */
export function stairsUnderside(st: Stairs, p: P2): number {
  const [sx, sz] = toWorld(st, -st.length / 2, 0)
  const a = (st.rotation * Math.PI) / 180
  const along = (p[0] - sx) * Math.cos(a) - (p[1] - sz) * Math.sin(a) // lokální x od začátku ramene
  return st.bottomStart + ((st.bottomEnd - st.bottomStart) * along) / st.length
}

/** Výška podhledu schodiště v místě p (null = mimo schodiště). */
export function stairsUndersideAt(st: Stairs, p: P2): number | null {
  if (!pointInPolygon(p, stairsCorners(st))) return null
  const u = stairsUnderside(st, p)
  return Math.max(Math.min(st.bottomStart, st.bottomEnd), Math.min(Math.max(st.bottomStart, st.bottomEnd), u))
}

/** Výška šikminy jako lineární funkce (bez omezení na pás šikminy). */
export const slopeHeight = (seg: WallSeg, s: Slope, roomHeight: number, p: P2) =>
  s.kneeHeight + ((roomHeight - s.kneeHeight) * wallCoords(seg, p).dist) / s.depth

/** Leží bod pod šikminou (mezi stěnou a linií zlomu)? */
export function inSlopeBand(seg: WallSeg, s: Slope, p: P2): boolean {
  const { along, dist } = wallCoords(seg, p)
  return along >= -EPS && along <= seg.length + EPS && dist >= -EPS && dist < s.depth
}

/** Světlá výška v bodě půdorysu: strop, snížený šikminami a podhledem schodiště. */
export function ceilingAt(room: Room, p: P2): number {
  const segs = wallSegments(room)
  let h = room.height
  for (const s of room.slopes) {
    const seg = segs[s.wall]
    if (seg && inSlopeBand(seg, s, p)) h = Math.min(h, slopeHeight(seg, s, room.height, p))
  }
  for (const st of room.stairs) {
    const u = stairsUndersideAt(st, p)
    if (u !== null) h = Math.min(h, u)
  }
  return h
}
