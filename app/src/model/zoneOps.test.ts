import { describe, expect, it } from 'vitest'
import type { Zone } from './schema'
import { getZone, mergeWithNeighbour, setPartSize, splitCell } from './zoneOps'
import { footprint, placeFromRect } from './placement'

const leaf: Zone = { kind: 'leaf', fill: { type: 'open', shelves: 0 }, front: 'none' }

describe('zoneOps', () => {
  it('rozdělí list na dvě části', () => {
    const { root, path } = splitCell(leaf, [], 'x', 400, 18)
    expect(root).toMatchObject({ kind: 'split', axis: 'x', parts: [{ size: 400 }, { size: null }] })
    expect(path).toEqual([0])
  })

  it('ve stejné ose vkládá do rodiče místo vnořování', () => {
    const a = splitCell(leaf, [], 'x', 400, 18).root
    const b = splitCell(a, [1], 'x', 300, 18).root
    expect(b.kind === 'split' && b.parts.map((p) => p.size)).toEqual([400, 300, null])
  })

  it('pevná část se dělí s dopočtem zbytku', () => {
    const a = splitCell(leaf, [], 'y', 1000, 18).root
    const b = splitCell(a, [0], 'y', 400, 18).root
    expect(b.kind === 'split' && b.parts.map((p) => p.size)).toEqual([400, 582, null])
  })

  it('kolmé dělení se vnoří', () => {
    const a = splitCell(leaf, [], 'x', 400, 18).root
    const b = splitCell(a, [1], 'y', 300, 18).root
    expect(getZone(b, [1])).toMatchObject({ kind: 'split', axis: 'y' })
  })

  it('sloučení dvou částí vrátí list', () => {
    const a = splitCell(leaf, [], 'x', 400, 18).root
    expect(mergeWithNeighbour(a, [0], 18)).toEqual(leaf)
  })

  it('nastaví rozměr části', () => {
    const a = splitCell(leaf, [], 'x', 400, 18).root
    expect(setPartSize(a, [1], 250)).toMatchObject({ parts: [{ size: 400 }, { size: 250 }] })
  })
})

describe('placement', () => {
  it('široký obdélník = korpus u zadní stěny', () => {
    expect(placeFromRect({ minX: 600, minZ: 0, maxX: 2200, maxZ: 600 }, 1500)).toEqual({ x: 600, z: 0, rotation: 0, width: 1600, depth: 600 })
  })

  it('úzký obdélník vlevo = u levé stěny, půdorys sedí', () => {
    const f = { minX: 0, minZ: 700, maxX: 650, maxZ: 1550 }
    const p = placeFromRect(f, 1500)
    expect(p.rotation).toBe(90)
    const cab = { ...p, id: 'a', label: '', height: 1000, elevation: 0, plinth: 0, thickness: 18, interior: leaf }
    expect(footprint(cab)).toEqual(f)
  })

  it('úzký obdélník vpravo = u pravé stěny, půdorys sedí', () => {
    const f = { minX: 2400, minZ: 700, maxX: 3000, maxZ: 1500 }
    const p = placeFromRect(f, 1500)
    expect(p.rotation).toBe(270)
    const cab = { ...p, id: 'a', label: '', height: 1000, elevation: 0, plinth: 0, thickness: 18, interior: leaf }
    expect(footprint(cab)).toEqual(f)
  })
})
