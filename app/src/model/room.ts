import type { Cabinet, Opening, Room } from './schema'

// Geometrie místnosti v půdorysu: body [x, z] v mm, z roste od zadní stěny do místnosti.
export type P2 = [number, number]

export interface WallSeg {
  index: number
  a: P2
  b: P2
  length: number
  u: P2 // jednotkový směr a → b
  n: P2 // jednotková normála dovnitř místnosti
}

const sub = (p: P2, q: P2): P2 => [p[0] - q[0], p[1] - q[1]]
const add = (p: P2, q: P2): P2 => [p[0] + q[0], p[1] + q[1]]
const mul = (p: P2, k: number): P2 => [p[0] * k, p[1] * k]
const dot = (p: P2, q: P2) => p[0] * q[0] + p[1] * q[1]
const len = (p: P2) => Math.hypot(p[0], p[1])

export function signedArea(pts: P2[]): number {
  let s = 0
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    s += p[0] * q[1] - q[0] * p[1]
  })
  return s / 2
}

type Walls = Pick<Room, 'vertices'> & { closed?: boolean }

/** Textový popis existujících stěn pro Clauda (indexy = wallIndex korpusů). */
export function describeWalls(room: Room): string {
  const pt = (p: P2) => `[${Math.round(p[0])}, ${Math.round(p[1])}]`
  return wallSegments(room)
    .map((s) => {
      const ops = room.openings
        .filter((o) => o.wall === s.index)
        .map((o) => `${o.kind === 'window' ? 'okno' : 'dveře'} ${o.offset}–${o.offset + o.width}`)
      return `stěna ${s.index}: délka ${Math.round(s.length)} mm, z ${pt(s.a)} do ${pt(s.b)}${ops.length ? ` (${ops.join(', ')})` : ''}`
    })
    .join('\n')
}

export function wallSegments(room: Walls): WallSeg[] {
  const v = room.vertices
  const closed = room.closed ?? true
  // u uzavřeného obrysu normála dovnitř; u otevřené řady stěn vpravo ve směru vrcholů
  const sign = !closed || signedArea(v) >= 0 ? 1 : -1
  return (closed ? v : v.slice(0, -1)).map((a, i) => {
    const b = v[(i + 1) % v.length]
    const d = sub(b, a)
    const length = len(d)
    const u: P2 = length ? mul(d, 1 / length) : [1, 0]
    return { index: i, a, b, length, u, n: [-u[1] * sign, u[0] * sign] }
  })
}

export function pointInPolygon([x, z]: P2, pts: P2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Poloha bodu vůči stěně: along = podél stěny od začátku, dist = vzdálenost dovnitř (záporná = za stěnou). */
export function wallCoords(seg: WallSeg, p: P2) {
  const d = sub(p, seg.a)
  return { along: dot(d, seg.u), dist: dot(d, seg.n) }
}

export function nearestWall(room: Walls, p: P2): { seg: WallSeg; distance: number; along: number } | null {
  let best: { seg: WallSeg; distance: number; along: number } | null = null
  for (const seg of wallSegments(room)) {
    const { along } = wallCoords(seg, p)
    const t = Math.max(0, Math.min(seg.length, along))
    const distance = len(sub(p, add(seg.a, mul(seg.u, t))))
    if (!best || distance < best.distance) best = { seg, distance, along: t }
  }
  return best
}

const deg = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360
const round = (v: number, step = 0.01) => Math.round(v / step) / Math.round(1 / step)

/**
 * Korpus zády ke stěně: lokální osa z = normála dovnitř, lokální x podél stěny.
 * from/to = rozsah podél směru seg.u (mm od začátku stěny).
 */
export function placeOnWall(
  seg: WallSeg,
  from: number,
  to: number,
  depth: number,
): Pick<Cabinet, 'x' | 'z' | 'rotation' | 'width' | 'depth'> {
  const [nx, nz] = seg.n
  const L: P2 = [nz, -nx] // lokální x korpusu ve světě
  const rotation = round(deg(Math.atan2(nx, nz)))
  // levý zadní roh = nejmenší souřadnice ve směru L
  const sameDir = dot(L, seg.u) > 0
  const start = add(seg.a, mul(seg.u, sameDir ? Math.min(from, to) : Math.max(from, to)))
  return { x: round(start[0], 0.1), z: round(start[1], 0.1), rotation, width: Math.abs(to - from), depth }
}

/** Úhel ve stupních přichycený k násobkům 90° (tolerance 10°) nebo 45° (tolerance 6°). */
export function snapAngle(a: number): number {
  const near = (step: number, tol: number) => {
    const r = Math.round(a / step) * step
    return Math.abs(r - a) <= tol ? r : null
  }
  return near(90, 10) ?? near(45, 6) ?? a
}

/**
 * Obrys z délek a směrů stěn. Poslední dvě délky se dopočítají, aby se obrys uzavřel
 * (pokud poslední dvě stěny nejsou rovnoběžné), jinak se poslední stěna jen dotáhne.
 */
export function closePolygon(start: P2, anglesDeg: number[], lengths: number[]): P2[] {
  const n = anglesDeg.length
  const dirs = anglesDeg.map((a): P2 => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)])
  const pts: P2[] = [start]
  let p = start
  for (let i = 0; i < n - 2; i++) {
    p = add(p, mul(dirs[i], lengths[i]))
    pts.push(p)
  }
  // p + l1*d1 + l2*d2 = start
  const [d1, d2] = [dirs[n - 2], dirs[n - 1]]
  const r = sub(start, p)
  const det = d1[0] * d2[1] - d1[1] * d2[0]
  const l1 = Math.abs(det) > 1e-6 ? (r[0] * d2[1] - r[1] * d2[0]) / det : -1
  if (l1 > 1) pts.push(add(p, mul(d1, l1)))
  else pts.push(add(p, mul(dirs[n - 2], lengths[n - 2])))
  return pts.map(([x, z]) => [round(x, 0.1), round(z, 0.1)])
}

export function edgesOf(pts: P2[], closed = true): { angles: number[]; lengths: number[] } {
  const angles: number[] = []
  const lengths: number[] = []
  ;(closed ? pts : pts.slice(0, -1)).forEach((p, i) => {
    const d = sub(pts[(i + 1) % pts.length], p)
    angles.push((Math.atan2(d[1], d[0]) * 180) / Math.PI)
    lengths.push(len(d))
  })
  return { angles, lengths }
}

function perpDist(p: P2, a: P2, b: P2): number {
  const d = sub(b, a)
  const l = len(d)
  if (!l) return len(sub(p, a))
  return Math.abs(d[0] * (a[1] - p[1]) - d[1] * (a[0] - p[0])) / l
}

function rdp(pts: P2[], eps: number): P2[] {
  if (pts.length < 3) return pts
  let idx = 0
  let max = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > max) [max, idx] = [d, i]
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

/** Otevřená řada stěn z délek a směrů. */
export function buildPolyline(start: P2, anglesDeg: number[], lengths: number[]): P2[] {
  const pts: P2[] = [start]
  anglesDeg.forEach((a, i) => {
    const r = (a * Math.PI) / 180
    pts.push(add(pts[i], [Math.cos(r) * lengths[i], Math.sin(r) * lengths[i]]))
  })
  return pts.map(([x, z]) => [round(x, 0.1), round(z, 0.1)])
}

/** Tah ve stěnách: uzavřený = obrys místnosti, otevřený = samostatná stěna / řada stěn. */
export function strokeToWalls(points: P2[], gridStep = 10): { vertices: P2[]; closed: boolean } | null {
  const poly = strokeToPolygon(points, gridStep)
  if (poly) return { vertices: poly, closed: true }
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  if (diag === 0) return null
  let v = rdp(points, diag * 0.04)
  v = v.filter((p, i) => i === v.length - 1 || len(sub(v[i + 1], p)) > diag * 0.05)
  if (v.length < 2) return null
  const { angles, lengths } = edgesOf(v, false)
  const start: P2 = [Math.round(v[0][0] / gridStep) * gridStep, Math.round(v[0][1] / gridStep) * gridStep]
  return {
    vertices: buildPolyline(
      start,
      angles.map(snapAngle),
      lengths.map((l) => Math.round(l / gridStep) * gridStep),
    ),
    closed: false,
  }
}

/** Otevřená řada stěn: přehodí stranu, na které stojí nábytek (obrácené pořadí, otvory přepočítané). */
export function flipWalls(room: Room): Room {
  if (room.closed) return room
  const segs = wallSegments(room)
  const m = segs.length
  return {
    ...room,
    vertices: [...room.vertices].reverse(),
    openings: room.openings.map((o) => ({ ...o, wall: m - 1 - o.wall, offset: segs[o.wall].length - o.offset - o.width })),
    slopes: room.slopes.map((sl) => ({ ...sl, wall: m - 1 - sl.wall })),
  }
}

/** Z ručně obtaženého obrysu udělá mnohoúhelník se srovnanými úhly. Null = nejde o uzavřený obrys. */
export function strokeToPolygon(points: P2[], gridStep = 10): P2[] | null {
  const xs = points.map((p) => p[0])
  const zs = points.map((p) => p[1])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  if (diag === 0 || len(sub(points[0], points[points.length - 1])) > 0.25 * diag) return null

  let v = rdp([...points, points[0]], diag * 0.04).slice(0, -1)
  // sloučit téměř shodné body
  v = v.filter((p, i) => len(sub(p, v[(i + 1) % v.length])) > diag * 0.05)
  if (v.length < 3) return null

  const { angles, lengths } = edgesOf(v)
  const snapped = angles.map(snapAngle)
  const start: P2 = [Math.round(v[0][0] / gridStep) * gridStep, Math.round(v[0][1] / gridStep) * gridStep]
  const rounded = lengths.map((l) => Math.round(l / gridStep) * gridStep)
  return closePolygon(start, snapped, rounded)
}

/** Kde podél stěny končí její vnější líc (0 / délka = rovný konec, jinak šikmý spoj se sousední stěnou). */
export interface WallMiter {
  start: number
  end: number
}

/** Šikmé spoje: vnější líc stěny končí v průsečíku s vnějším lícem navazující stěny, takže rohy nepřečnívají. */
export function wallMiters(segs: WallSeg[], closed: boolean, thickness: number): WallMiter[] {
  const m = segs.map((s) => ({ start: 0, end: s.length }))
  const joints = closed ? segs.length : segs.length - 1
  for (let i = 0; i < joints; i++) {
    const [p, q] = [segs[i], segs[(i + 1) % segs.length]]
    const cross = p.u[0] * q.u[1] - p.u[1] * q.u[0]
    if (Math.abs(cross) < 1e-6) continue // stěny navazují v přímce
    // p.a − p.n·t + p.u·s = q.a − q.n·t + q.u·r
    const d = sub(add(q.a, mul(q.n, -thickness)), add(p.a, mul(p.n, -thickness)))
    const s = (d[0] * q.u[1] - d[1] * q.u[0]) / cross
    const r = (d[0] * p.u[1] - d[1] * p.u[0]) / cross
    // velmi ostrý úhel by dal dlouhý hrot – nechat rovné konce
    if (Math.abs(s - p.length) > 4 * thickness || Math.abs(r) > 4 * thickness) continue
    m[i].end = s
    m[(i + 1) % segs.length].start = r
  }
  return m
}

/** Půdorys stěny: vnitřní líc a vnější líc posunutý o tloušťku (se šikmými konci podle miter). */
export function wallQuad(seg: WallSeg, thickness: number, miter: WallMiter = { start: 0, end: seg.length }): P2[] {
  return [seg.a, seg.b, pointOnWall(seg, miter.end, -thickness), pointOnWall(seg, miter.start, -thickness)]
}

export const pointOnWall = (seg: WallSeg, along: number, dist = 0): P2 => add(add(seg.a, mul(seg.u, along)), mul(seg.n, dist))

export interface WallPiece {
  from: number // podél stěny
  to: number
  bottom: number
  top: number
}

/** Rozdělí stěnu na plné kusy kolem otvorů (pod parapetem, nad nadpražím, mezi otvory). */
export function wallPieces(length: number, height: number, openings: Pick<Opening, 'offset' | 'width' | 'height' | 'sill'>[]): WallPiece[] {
  const sorted = [...openings]
    .map((o) => ({
      from: Math.max(0, o.offset),
      to: Math.min(length, o.offset + o.width),
      sill: o.sill,
      top: Math.min(height, o.sill + o.height),
    }))
    .filter((o) => o.to > o.from)
    .sort((a, b) => a.from - b.from)
  const pieces: WallPiece[] = []
  let pos = 0
  for (const o of sorted) {
    if (o.from > pos) pieces.push({ from: pos, to: o.from, bottom: 0, top: height })
    if (o.sill > 0) pieces.push({ from: o.from, to: o.to, bottom: 0, top: o.sill })
    if (o.top < height) pieces.push({ from: o.from, to: o.to, bottom: o.top, top: height })
    pos = Math.max(pos, o.to)
  }
  if (pos < length) pieces.push({ from: pos, to: length, bottom: 0, top: height })
  return pieces
}

/** Zadní líc stěny jako samostatná „stěna“ (pro nábytek z druhé strany): obrácený směr, normála ven. */
export function backFace(seg: WallSeg, thickness: number): WallSeg {
  const off = mul(seg.n, -thickness)
  return { index: seg.index, a: add(seg.b, off), b: add(seg.a, off), length: seg.length, u: mul(seg.u, -1), n: mul(seg.n, -1) }
}
