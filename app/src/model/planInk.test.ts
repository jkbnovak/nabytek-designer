import { describe, expect, it } from 'vitest'
import { cabinetFromStroke, isTextStroke, joinStrokes, wallsFromInk, type InkStroke } from './planInk'
import type { P2 } from './room'
import type { Room } from './schema'

const line = (a: P2, b: P2, n = 20): P2[] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
const ink = (points: P2[]): InkStroke => ({ kind: 'walls', points, viewWidth: 5000 })

describe('joinStrokes', () => {
  it('spojí tahy navazující v libovolném směru', () => {
    const chains = joinStrokes([line([0, 0], [3000, 0]), line([3000, 2000], [3010, 30]), line([5000, 5000], [6000, 5000])], 200)
    expect(chains).toHaveLength(2)
    expect(chains[0][0]).toEqual([0, 0])
    expect(chains[0][chains[0].length - 1]).toEqual([3000, 2000])
  })
})

describe('wallsFromInk', () => {
  it('místnost nakreslená čtyřmi tahy + psaná čísla', () => {
    const strokes = [
      ink(line([0, 0], [4000, 0])),
      ink(line([4000, 20], [4000, 3000])),
      ink(line([3990, 3000], [0, 3000])),
      ink(line([0, 3000], [10, 40])),
      ink(line([1800, -300], [1900, -200], 3)), // „4000“ napsané nad stěnou
    ]
    expect(isTextStroke(strokes[4])).toBe(true)
    const w = wallsFromInk(strokes)
    expect(w).toMatchObject({ closed: true, ignored: 0 })
    expect(w!.vertices).toHaveLength(4)
  })

  it('samostatná stěna do L', () => {
    const w = wallsFromInk([ink(line([0, 0], [3000, 0])), ink(line([3000, 0], [3000, 1500]))])
    expect(w).toMatchObject({ closed: false, vertices: [[0, 0], [3000, 0], [3000, 1500]] })
  })
})

describe('cabinetFromStroke', () => {
  const room: Room = { vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], closed: true, height: 2600, wallThickness: 150, openings: [], obstacles: [], slopes: [], stairs: [] }

  it('u stěny: změna šířky zachová začátek', () => {
    const d = cabinetFromStroke(room, [], [[510, 20], [1790, 10], [1800, 590], [500, 600], [505, 30]])
    expect(d).toMatchObject({ width: 1300, depth: 600, wall: 0, behind: false })
    expect(d.place(1800, 600)).toEqual({ x: 500, z: 0, rotation: 0, width: 1800, depth: 600 })
  })

  it('bez místnosti: výchozí zadní stěna', () => {
    const d = cabinetFromStroke(null, [], [[0, 0], [1600, 0], [1600, 600], [0, 600], [0, 10]])
    expect(d.place(1600, 600)).toMatchObject({ x: 0, z: 0, rotation: 0 })
  })
})
