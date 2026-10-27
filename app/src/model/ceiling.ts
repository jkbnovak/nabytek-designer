import type { Cabinet, Room } from './schema'
import { toWorld } from './placement'
import { pointInPolygon, wallSegments, type P2 } from './room'
import { inSlopeBand, slopeHeight, stairsCorners, stairsUnderside } from './slopes'

// Strop nad korpusem v lokálních souřadnicích korpusu: y = a + bx·x + bz·z (mm od spodku korpusu).
// Šikmina i podhled schodiště jsou roviny, takže zkosení je přesné.

export interface CeilingPlane {
  a: number
  bx: number
  bz: number
}

export const CEILING_CLEARANCE = 10 // montážní vůle pod šikminou

export const planeAt = (p: CeilingPlane, x: number, z: number) => p.a + p.bx * x + p.bz * z

/** Rovina v lokálních souřadnicích korpusu z lineární funkce v půdoryse. */
function localPlane(cab: Cabinet, height: (p: P2) => number): CeilingPlane {
  const h0 = height(toWorld(cab, 0, 0))
  const hx = height(toWorld(cab, 1000, 0))
  const hz = height(toWorld(cab, 0, 1000))
  return { a: h0 - cab.elevation - CEILING_CLEARANCE, bx: (hx - h0) / 1000, bz: (hz - h0) / 1000 }
}

const footprintSamples = (cab: Cabinet): [number, number][] =>
  [0, 0.25, 0.5, 0.75, 1].flatMap((u) => [0, 0.5, 1].map((v): [number, number] => [u * cab.width, v * cab.depth]))

/** Stav korpusu vůči šikmině: zkosený, kolize (zkosení vypnuté) nebo bez vlivu. */
export function ceilingStatus(cab: Cabinet, room: Room | null): 'cut' | 'conflict' | null {
  if (!cabinetCeiling(cab, room)) return null
  return cab.fitCeiling === false ? 'conflict' : 'cut'
}

/** Rovina pro zkosení – jen když je u korpusu zapnuté. */
export const cabinetCut = (cab: Cabinet, room: Room | null) => (cab.fitCeiling === false ? null : cabinetCeiling(cab, room))

/**
 * Rovina stropu, která korpus seřízne – ze šikmin a schodišť nad ním vybere tu, která ho omezuje nejvíc.
 * null = korpus pod šikminu ani schody nezasahuje.
 */
export function cabinetCeiling(cab: Cabinet, room: Room | null): CeilingPlane | null {
  if (!room) return null
  const samples = footprintSamples(cab)
  const world = samples.map(([x, z]) => toWorld(cab, x, z))
  const segs = wallSegments(room)
  const candidates: CeilingPlane[] = []
  for (const s of room.slopes) {
    const seg = segs[s.wall]
    if (seg && world.some((p) => inSlopeBand(seg, s, p))) candidates.push(localPlane(cab, (p) => slopeHeight(seg, s, room.height, p)))
  }
  for (const st of room.stairs) {
    const corners = stairsCorners(st)
    if (world.some((p) => pointInPolygon(p, corners))) candidates.push(localPlane(cab, (p) => stairsUnderside(st, p)))
  }
  let best: { plane: CeilingPlane; low: number } | null = null
  for (const plane of candidates) {
    const low = Math.min(...samples.map(([x, z]) => planeAt(plane, x, z)))
    if (!best || low < best.low) best = { plane, low }
  }
  return best && best.low < cab.height ? best.plane : null
}
