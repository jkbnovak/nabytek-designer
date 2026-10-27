import { describe, expect, it } from 'vitest'
import { toAssembly, zonesToTree, type ImportResult } from './importFormat'
import { footprint } from './placement'

const z = (id: string, parentId: string | null, extra: Partial<Parameters<typeof zonesToTree>[0][number]> = {}) => ({
  id,
  parentId,
  kind: 'leaf' as const,
  axis: null,
  size: null,
  fill: 'open' as const,
  shelves: 0,
  drawers: null,
  front: 'none' as const,
  ...extra,
})

describe('zonesToTree', () => {
  it('plochý seznam → strom ve správném pořadí', () => {
    const tree = zonesToTree([
      z('r', null, { kind: 'split', axis: 'x' }),
      z('a', 'r', { size: 600, fill: 'drawers', drawers: 4, front: 'door-left' }),
      z('b', 'r', { fill: 'rod', front: 'door-right' }),
    ])
    expect(tree).toEqual({
      kind: 'split',
      axis: 'x',
      parts: [
        { size: 600, zone: { kind: 'leaf', fill: { type: 'drawers', count: 4 }, front: 'none' } },
        { size: null, zone: { kind: 'leaf', fill: { type: 'rod' }, front: 'door-right' } },
      ],
    })
  })

  it('prázdný seznam = prázdný korpus', () => {
    expect(zonesToTree([])).toMatchObject({ kind: 'leaf' })
  })

  it('dělení bez dětí a nedosažitelná pole nevadí', () => {
    expect(() => zonesToTree([z('r', null, { kind: 'split', axis: 'x' }), z('a', 'r', { kind: 'split' }), z('b', 'r'), z('c', 'd'), z('d', 'c')])).not.toThrow()
  })
})

describe('toAssembly', () => {
  const base = { height: 2000, depth: 600, elevation: 0, plinth: 80, thickness: 18, zones: [], wallIndex: null }
  const r: ImportResult = {
    name: 'Test',
    roomWidth: null,
    room: null,
    cabinets: [
      { ...base, label: 'zadní', wall: 'back', offset: 650, width: 1600 },
      { ...base, label: 'levá', wall: 'left', offset: 640, width: 850, depth: 650 },
      { ...base, label: 'pravá', wall: 'right', offset: 600, width: 900 },
    ],
    uncertain: [],
    notes: '',
  }

  it('korpusy stojí u správných stěn', () => {
    const [back, left, right] = toAssembly(r).cabinets.map(footprint)
    expect(back).toEqual({ minX: 650, minZ: 0, maxX: 2250, maxZ: 600 })
    expect(left).toEqual({ minX: 0, minZ: 640, maxX: 650, maxZ: 1490 })
    expect(right).toEqual({ minX: 2400, minZ: 600, maxX: 3000, maxZ: 1500 })
  })
})

describe('toAssembly s místností', () => {
  it('korpus na šikmé stěně a okno se převezmou', () => {
    const r: ImportResult = {
      name: 'Podkroví',
      roomWidth: null,
      room: {
        height: 2500,
        closed: true,
        vertices: [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 2000 }, { x: 1000, z: 3000 }, { x: 0, z: 3000 }],
        openings: [{ kind: 'window', wall: 1, offset: 500, width: 900, height: 1200, sill: 850 }, { kind: 'door', wall: 9, offset: 0, width: 800, height: 1970, sill: 0 }],
        obstacles: [{ label: 'komín', x: 2700, z: 300, width: 400, depth: 400, height: 2500 }],
        slopes: [{ wall: 0, kneeHeight: 1100, depth: 1400 }, { wall: 7, kneeHeight: 1000, depth: 1000 }],
        stairs: [{ x: 1500, z: 2500, length: 2000, width: 900, direction: '-x', bottomStart: 200, bottomEnd: 2200 }],
      },
      cabinets: [{ label: 'skříň', wall: 'back', wallIndex: 2, offset: 300, width: 1200, height: 2000, depth: 600, elevation: 0, plinth: 0, thickness: 18, zones: [] }],
      uncertain: [],
      notes: '',
    }
    const a = toAssembly(r)
    expect(a.room?.openings).toHaveLength(1) // dveře na neexistující stěně 9 vypadnou
    expect(a.room?.obstacles[0]).toMatchObject({ label: 'komín', rotation: 0 })
    expect(a.cabinets[0].rotation).not.toBe(0) // stojí na šikmé stěně
    expect(a.room?.slopes).toEqual([{ id: 'k1', wall: 0, kneeHeight: 1100, depth: 1400 }]) // stěna 7 neexistuje
    expect(a.room?.stairs[0]).toMatchObject({ rotation: 180, length: 2000 })
  })
})
