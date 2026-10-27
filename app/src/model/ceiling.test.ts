import { describe, expect, it } from 'vitest'
import type { Cabinet, Room } from './schema'
import { cabinetCeiling, planeAt } from './ceiling'
import { cabinetParts } from './geometry'

// místnost 4000 × 3000, strop 2500; krov u zadní stěny: nadezdívka 1000, 45° (zlom 1500 od stěny)
const room: Room = {
  vertices: [
    [0, 0],
    [4000, 0],
    [4000, 3000],
    [0, 3000],
  ],
  closed: true,
  height: 2500,
  wallThickness: 150,
  openings: [],
  obstacles: [],
  slopes: [{ id: 'k', wall: 0, kneeHeight: 1000, depth: 1500 }],
  stairs: [],
}

const cab = (p: Partial<Cabinet>): Cabinet => ({
  id: 'c',
  label: '',
  x: 500,
  z: 0,
  rotation: 0,
  width: 1200,
  height: 2000,
  depth: 600,
  elevation: 0,
  plinth: 80,
  thickness: 18,
  interior: { kind: 'leaf', fill: { type: 'rod' }, front: 'door-left' },
  ...p,
})

const maxY = (pts: number[][]) => Math.max(...pts.map((p) => p[1]))

describe('cabinetCeiling', () => {
  it('korpus zády ke krovu: strop stoupá od nadezdívky dopředu (s vůlí 10 mm)', () => {
    const c = cabinetCeiling(cab({}), room)!
    expect(planeAt(c, 0, 0)).toBeCloseTo(990)
    expect(planeAt(c, 600, 600)).toBeCloseTo(1590)
    expect(c.bx).toBeCloseTo(0)
  })
  it('korpus mimo šikminu nebo nižší než strop nad ním se neseřezává', () => {
    expect(cabinetCeiling(cab({ z: 2000 }), room)).toBeNull()
    expect(cabinetCeiling(cab({ height: 900 }), room)).toBeNull()
  })
  it('visící korpus: rovina je měřená od jeho spodku', () => {
    const c = cabinetCeiling(cab({ elevation: 500, height: 1500 }), room)!
    expect(planeAt(c, 0, 0)).toBeCloseTo(490)
  })
  it('pod schody: rovina podhledu', () => {
    const r = { ...room, slopes: [], stairs: [{ id: 's', x: 1100, z: 300, length: 2000, width: 600, rotation: 0, bottomStart: 300, bottomEnd: 2300 }] }
    // korpus pod ramenem: od x = 500 (začátek ramene při 100) – podhled stoupá zleva doprava
    const c = cabinetCeiling(cab({}), r)!
    expect(c.bx).toBeCloseTo(1)
    expect(planeAt(c, 0, 0)).toBeCloseTo(300 + 400 - 10)
  })
})

describe('cabinetParts pod šikminou', () => {
  const c = cab({})
  const parts = cabinetParts(c, cabinetCeiling(c, room))
  it('boky jsou seříznuté do lichoběžníku, nic nepřesahuje strop', () => {
    const sides = parts.filter((p) => p.role === 'side')
    expect(sides).toHaveLength(2)
    expect(sides.every((p) => p.shape === 'hull')).toBe(true)
    for (const p of parts.filter((p) => p.points)) {
      for (const [x, y, z] of p.points!) expect(y).toBeLessThanOrEqual(planeAt(cabinetCeiling(c, room)!, x, z) + 0.001)
    }
    expect(maxY(sides[0].points!)).toBeCloseTo(1590 + (1600 - 1590) * 0) // vpředu u fronty
  })
  it('má šikmou horní desku, tyč se nevejde a dvířka jsou zkrácená', () => {
    expect(parts.filter((p) => p.role === 'top').length).toBeGreaterThan(0)
    expect(parts.some((p) => p.role === 'rod')).toBe(false)
    const door = parts.find((p) => p.role === 'door')!
    expect(door.shape).toBe('hull')
    expect(door.center[1] + door.size[1] / 2).toBeLessThan(1650)
  })
  it('bez šikminy zůstávají kvádry', () => {
    expect(cabinetParts(c).every((p) => p.shape !== 'hull')).toBe(true)
  })
})
