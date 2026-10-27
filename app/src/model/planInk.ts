import type { Cabinet, Room } from './schema'
import { footprint, footprintCorners, placeFromRect, reanchor, snap } from './placement'
import { backFace, nearestWall, placeOnWall, strokeToWalls, wallCoords, type P2, type WallSeg } from './room'

// Inkoust v půdorysu: tahy se sbírají a převádějí najednou (stěny zvlášť, nábytek zvlášť).

export interface InkStroke {
  kind: 'walls' | 'furniture'
  points: P2[]
  viewWidth: number // šířka zobrazení v mm při kreslení – podle ní se pozná psané číslo od čáry
}

/** Vrstvy půdorysu: prostor (stěny, otvory, sloupy), nábytek (korpusy) a pohledy (kamery). */
export type Layer = 'space' | 'furniture' | 'views'
/** Vrstvy, které mají skicu a inkoust. */
export type DrawLayer = Exclude<Layer, 'views'>
export type LayerVisibility = Record<Layer, boolean>
export const inkLayer = (kind: InkStroke['kind']): Layer => (kind === 'walls' ? 'space' : 'furniture')

const TEXT_RATIO = 0.08 // tah menší než 8 % šířky zobrazení = písmo
const WALL_SNAP_DIST = 1500
const SNAP_TOL = 80

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function strokeDiag(points: P2[]): number {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
}

export const isTextStroke = (s: InkStroke) => strokeDiag(s.points) < s.viewWidth * TEXT_RATIO

/** Spojí tahy, jejichž konce jsou u sebe, do souvislých řetězců (stěna nakreslená na víc tahů). */
export function joinStrokes(strokes: P2[][], tol: number): P2[][] {
  const chains = strokes.map((s) => [...s])
  let merged = true
  while (merged) {
    merged = false
    outer: for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const [a, b] = [chains[i], chains[j]]
        const options: [number, () => P2[]][] = [
          [dist(a[a.length - 1], b[0]), () => [...a, ...b]],
          [dist(a[a.length - 1], b[b.length - 1]), () => [...a, ...[...b].reverse()]],
          [dist(a[0], b[b.length - 1]), () => [...b, ...a]],
          [dist(a[0], b[0]), () => [...[...a].reverse(), ...b]],
        ]
        const [d, join] = options.reduce((best, o) => (o[0] < best[0] ? o : best))
        if (d < tol) {
          chains[i] = join()
          chains.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  return chains
}

/** Stěny z inkoustu: největší souvislý řetězec tahů. Vrací i počet tahů, které se nepoužily. */
export function wallsFromInk(strokes: InkStroke[]): { vertices: P2[]; closed: boolean; ignored: number } | null {
  const geom = strokes.filter((s) => s.kind === 'walls' && !isTextStroke(s))
  if (!geom.length) return null
  const tol = Math.max(...geom.map((s) => s.viewWidth)) * 0.04
  const chains = joinStrokes(
    geom.map((s) => s.points),
    tol,
  ).sort((a, b) => strokeDiag(b) - strokeDiag(a))
  const walls = strokeToWalls(chains[0])
  return walls ? { ...walls, ignored: chains.length - 1 } : null
}

export interface CabinetDraft {
  width: number
  depth: number
  /** Umístění pro (případně upravené) rozměry – zachová stranu a začátek u stěny. */
  place: (width: number, depth: number) => Pick<Cabinet, 'x' | 'z' | 'rotation' | 'width' | 'depth'>
  wall: number | null
  behind: boolean
}

const center = (pts: P2[]): P2 => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]

/**
 * Korpus z uzavřeného tahu: u stěny se tah promítne do jejích souřadnic (korpus zády ke stěně,
 * z druhé strany k zadní líci), jinak osově orientovaný obdélník u výchozí zadní/levé stěny.
 */
export function cabinetFromStroke(room: Room | null, cabinets: Cabinet[], pts: P2[]): CabinetDraft {
  const hit = room ? nearestWall(room, center(pts)) : null
  if (room && hit && hit.distance <= WALL_SNAP_DIST) {
    const behind = wallCoords(hit.seg, center(pts)).dist < -room.wallThickness / 2
    const seg: WallSeg = behind ? backFace(hit.seg, room.wallThickness) : hit.seg
    const coords = pts.map((p) => wallCoords(seg, p))
    const cands = [
      0,
      seg.length,
      ...cabinets.flatMap((c) =>
        footprintCorners(c)
          .map((p) => wallCoords(seg, p))
          .filter((w) => w.dist > -20 && w.dist < 1500)
          .map((w) => w.along),
      ),
      ...room.openings
        .filter((o) => o.wall === hit.seg.index)
        .flatMap((o) => (behind ? [seg.length - o.offset - o.width, seg.length - o.offset] : [o.offset, o.offset + o.width])),
    ]
    const from = Math.max(0, snap(Math.min(...coords.map((c) => c.along)), cands, SNAP_TOL))
    const to = Math.min(seg.length, snap(Math.max(...coords.map((c) => c.along)), cands, SNAP_TOL))
    const depth = Math.max(100, Math.round(Math.max(...coords.map((c) => c.dist)) / 10) * 10)
    return { width: to - from, depth, place: (w, d) => placeOnWall(seg, from, from + w, d), wall: hit.seg.index, behind }
  }

  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const sx = [0, ...cabinets.flatMap((c) => [footprint(c).minX, footprint(c).maxX])]
  const sz = [0, ...cabinets.flatMap((c) => [footprint(c).minZ, footprint(c).maxZ])]
  const f = {
    minX: snap(Math.min(...xs), sx, SNAP_TOL),
    maxX: snap(Math.max(...xs), sx, SNAP_TOL),
    minZ: snap(Math.min(...zs), sz, SNAP_TOL),
    maxZ: snap(Math.max(...zs), sz, SNAP_TOL),
  }
  const roomCenterX = Math.max(3000, ...cabinets.map((c) => footprint(c).maxX)) / 2
  const p = placeFromRect(f, roomCenterX)
  return {
    width: p.width,
    depth: p.depth,
    place: (width, depth) => {
      const sized = { ...p, width, depth }
      // ukotvit na nakreslený roh, i když se rozměry změní
      const draft = {
        ...sized,
        id: '',
        label: '',
        height: 0,
        elevation: 0, plinth: 0,
        thickness: 18,
        interior: { kind: 'leaf' as const, fill: { type: 'rod' as const }, front: 'none' as const },
      }
      return { ...sized, ...reanchor(draft, f) }
    },
    wall: null,
    behind: false,
  }
}
