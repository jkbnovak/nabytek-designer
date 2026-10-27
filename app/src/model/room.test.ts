import { describe, expect, it } from 'vitest'
import { closePolygon, nearestWall, placeOnWall, pointInPolygon, snapAngle, strokeToPolygon, wallSegments, type P2 } from './room'
import { footprintCorners } from './placement'

const rect: P2[] = [[0, 0], [3200, 0], [3200, 3500], [0, 3500]]

// Roztřesený ruční tah po obrysu.
function trace(corners: P2[], steps = 25, jitter = 15): P2[] {
  const out: P2[] = []
  const all = [...corners, corners[0]]
  for (let i = 1; i < all.length; i++) {
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push([all[i - 1][0] + (all[i][0] - all[i - 1][0]) * t + Math.sin(s * 3) * jitter, all[i - 1][1] + (all[i][1] - all[i - 1][1]) * t + Math.cos(s * 2) * jitter])
    }
  }
  out.push([corners[0][0] + 40, corners[0][1] + 30])
  return out
}

const close = (a: P2[], b: P2[], tol: number) => a.length === b.length && a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) <= tol)

describe('wallSegments', () => {
  it('normály míří dovnitř bez ohledu na směr obtažení', () => {
    for (const pts of [rect, [...rect].reverse()]) {
      for (const seg of wallSegments({ vertices: pts })) {
        const mid: P2 = [(seg.a[0] + seg.b[0]) / 2 + seg.n[0] * 10, (seg.a[1] + seg.b[1]) / 2 + seg.n[1] * 10]
        expect(pointInPolygon(mid, pts)).toBe(true)
      }
    }
  })
})

describe('placeOnWall', () => {
  it('korpus na zadní stěně = otočení 0', () => {
    const seg = wallSegments({ vertices: rect })[0]
    expect(placeOnWall(seg, 650, 2250, 600)).toEqual({ x: 650, z: 0, rotation: 0, width: 1600, depth: 600 })
  })

  it('korpus na šikmé stěně stojí zády ke stěně uvnitř místnosti', () => {
    const room: P2[] = [[0, 0], [3000, 0], [3000, 2000], [1000, 3000], [0, 3000]]
    const seg = wallSegments({ vertices: room })[2] // šikmá stěna
    const cab = { ...placeOnWall(seg, 400, 1400, 600), id: 'a', label: '', height: 2000, elevation: 0, plinth: 0, thickness: 18, interior: { kind: 'leaf' as const, fill: { type: 'rod' as const }, front: 'none' as const } }
    const [lb, rb, rf, lf] = footprintCorners(cab)
    // zadní rohy leží na stěně, přední uvnitř místnosti
    for (const p of [lb, rb]) expect(nearestWall({ vertices: room }, p)!.distance).toBeLessThan(0.5)
    for (const p of [rf, lf]) expect(pointInPolygon(p, room)).toBe(true)
  })
})

describe('strokeToPolygon', () => {
  it('roztřesený obdélník → přesný pravoúhlý obrys', () => {
    const poly = strokeToPolygon(trace(rect))
    expect(poly).not.toBeNull()
    expect(close(poly!, rect, 80)).toBe(true)
    const segs = wallSegments({ vertices: poly! })
    for (const s of segs) expect(Math.abs(s.u[0] * s.u[1])).toBeLessThan(1e-9) // jen vodorovné/svislé
  })

  it('obrys s nikou (tvar L)', () => {
    const L: P2[] = [[0, 0], [3000, 0], [3000, 1500], [2000, 1500], [2000, 3000], [0, 3000]]
    const poly = strokeToPolygon(trace(L, 30, 10))
    expect(poly).toHaveLength(6)
  })

  it('otevřený tah není místnost', () => {
    expect(strokeToPolygon([[0, 0], [1000, 0], [1000, 1000]])).toBeNull()
  })
})

describe('closePolygon / snapAngle', () => {
  it('dopočítá poslední dvě stěny', () => {
    expect(closePolygon([0, 0], [0, 90, 180, 270], [4000, 3000, 1, 1])).toEqual([[0, 0], [4000, 0], [4000, 3000], [0, 3000]])
  })
  it('úhly', () => {
    expect(snapAngle(87)).toBe(90)
    expect(snapAngle(-48)).toBe(-45)
    expect(snapAngle(30)).toBe(30)
  })
})

describe('wallPieces', () => {
  it('okno uprostřed stěny = 4 kusy, dveře v rohu = 2 kusy', async () => {
    const { wallPieces } = await import('./room')
    expect(wallPieces(3000, 2600, [{ offset: 1000, width: 1200, height: 1400, sill: 900 }])).toEqual([
      { from: 0, to: 1000, bottom: 0, top: 2600 },
      { from: 1000, to: 2200, bottom: 0, top: 900 },
      { from: 1000, to: 2200, bottom: 2300, top: 2600 },
      { from: 2200, to: 3000, bottom: 0, top: 2600 },
    ])
    expect(wallPieces(3000, 2600, [{ offset: 0, width: 800, height: 1970, sill: 0 }])).toHaveLength(2)
  })
})

describe('samostatné stěny', () => {
  it('otevřený tah = řada stěn, nábytek vpravo ve směru kreslení', async () => {
    const { strokeToWalls } = await import('./room')
    const w = strokeToWalls(trace([[0, 0], [3000, 0]], 30, 10).slice(0, 25))
    expect(w?.closed).toBe(false)
    const segs = wallSegments({ vertices: w!.vertices, closed: false })
    expect(segs).toHaveLength(1)
    expect(segs[0].n[1]).toBeCloseTo(1) // kresleno doprava → nábytek pod stěnou (+z)
  })

  it('otočení strany zachová polohu otvoru', async () => {
    const { flipWalls } = await import('./room')
    const room = {
      vertices: [[0, 0], [3000, 0], [3000, 2000]] as P2[],
      closed: false,
      height: 2600,
      wallThickness: 150,
      openings: [{ id: 'o', kind: 'window' as const, wall: 0, offset: 500, width: 1000, height: 1200, sill: 900 }],
      obstacles: [],
      slopes: [],
      stairs: [],
    }
    const flipped = flipWalls(room)
    expect(flipped.vertices[0]).toEqual([3000, 2000])
    expect(flipped.openings[0]).toMatchObject({ wall: 1, offset: 1500 }) // stejné místo, měřeno z druhého konce
    expect(flipWalls(flipped)).toEqual(room)
  })
})

describe('backFace', () => {
  it('korpus za stěnou stojí zády k její zadní líci', async () => {
    const { backFace } = await import('./room')
    const seg = wallSegments({ vertices: [[0, 1000], [3000, 1000]], closed: false })[0]
    const back = backFace(seg, 150)
    // zadní líc leží na z = 850, nábytek míří k menšímu z
    expect(back.a).toEqual([3000, 850])
    expect(placeOnWall(back, 0, 1000, 600)).toMatchObject({ x: 3000, z: 850, rotation: 180, width: 1000 })
  })
})

describe('wallMiters', () => {
  it('pravoúhlá místnost: vnější líc se na každém rohu prodlouží o tloušťku', async () => {
    const { wallMiters, wallSegments } = await import('./room')
    const segs = wallSegments({ vertices: [[0, 0], [3000, 0], [3000, 2000], [0, 2000]], closed: true })
    for (const [i, m] of wallMiters(segs, true, 150).entries()) {
      expect(m.start).toBeCloseTo(-150)
      expect(m.end).toBeCloseTo(segs[i].length + 150)
    }
  })
  it('otevřená řada s lomem ven: volné konce rovné, roh se zkrátí', async () => {
    const { wallMiters, wallSegments } = await import('./room')
    // zadní stěna doprava, pak dolů a znovu doprava (výstupek) – druhý roh se láme ven
    const segs = wallSegments({ vertices: [[0, 0], [2000, 0], [2000, 500], [2500, 500]], closed: false })
    const m = wallMiters(segs, false, 150)
    expect(m[0].start).toBe(0)
    expect(m[2].end).toBeCloseTo(500)
    expect(m[1].end).toBeCloseTo(500 - 150)
    expect(m[2].start).toBeCloseTo(150)
  })
})
