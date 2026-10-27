import { describe, expect, it } from 'vitest'
import type { Room } from './schema'
import { ceilingAt, slopeAngle, slopeDepthFor, stairsCorners, stairsUndersideAt } from './slopes'

const room: Room = {
  vertices: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]],
  closed: true,
  height: 2500,
  wallThickness: 150,
  openings: [],
  obstacles: [],
  // krov u zadní stěny: nadezdívka 1000, rovný strop od 1500 mm
  slopes: [{ id: 'k', wall: 0, kneeHeight: 1000, depth: 1500 }],
  stairs: [],
}

describe('šikmina', () => {
  it('výška stoupá od nadezdívky k rovnému stropu', () => {
    expect(ceilingAt(room, [2000, 0])).toBe(1000)
    expect(ceilingAt(room, [2000, 750])).toBe(1750)
    expect(ceilingAt(room, [2000, 1500])).toBe(2500)
    expect(ceilingAt(room, [2000, 2500])).toBe(2500)
  })
  it('sklon a hloubka jsou navzájem převoditelné', () => {
    expect(slopeAngle({ kneeHeight: 1000, depth: 1500 }, 2500)).toBeCloseTo(45)
    expect(slopeDepthFor(1000, 45, 2500)).toBe(1500)
  })
})

describe('schodiště', () => {
  // rameno stoupá ve směru −x (zprava doleva), podhled 200 → 2200
  const st = { id: 's', x: 2000, z: 2500, length: 2000, width: 900, rotation: 180, bottomStart: 200, bottomEnd: 2200 }
  it('začátek ramene je na straně, odkud stoupá', () => {
    const [startLeft] = stairsCorners(st)
    expect(startLeft[0]).toBeCloseTo(3000)
  })
  it('podhled roste ve směru stoupání, mimo schodiště null', () => {
    expect(stairsUndersideAt(st, [2900, 2500])).toBeCloseTo(300)
    expect(stairsUndersideAt(st, [2000, 2500])).toBeCloseTo(1200)
    expect(stairsUndersideAt(st, [2000, 1000])).toBeNull()
    expect(ceilingAt({ ...room, stairs: [st] }, [1100, 2500])).toBeCloseTo(2100)
  })
})
