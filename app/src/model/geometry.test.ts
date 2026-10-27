import { describe, expect, it } from 'vitest'
import { cabinetParts, splitSizes } from './geometry'
import { AssemblySchema } from './schema'
import { loznice } from './samples/loznice'

describe('splitSizes', () => {
  it('rozdělí zbytek rovnoměrně mezi volné části', () => {
    expect(splitSizes(1000, [null, null], 18)).toEqual([491, 491])
  })
  it('respektuje pevné rozměry', () => {
    expect(splitSizes(1000, [400, null], 18)).toEqual([400, 582])
  })
})

describe('cabinetParts', () => {
  const [komoda, skrin] = loznice.cabinets

  it('vzorová sestava projde schématem', () => {
    expect(() => AssemblySchema.parse(loznice)).not.toThrow()
  })

  it('komoda má 4 šuplíky a vejde se do rozměrů', () => {
    const parts = cabinetParts(komoda)
    const drawers = parts.filter((p) => p.role === 'drawer')
    expect(drawers).toHaveLength(4)
    for (const p of parts) {
      expect(p.center[0] + p.size[0] / 2).toBeLessThanOrEqual(komoda.width)
      expect(p.center[1] + p.size[1] / 2).toBeLessThanOrEqual(komoda.height)
    }
  })

  it('skříň má boky přes celou výšku a jednu příčku', () => {
    const parts = cabinetParts(skrin)
    const sides = parts.filter((p) => p.role === 'side')
    expect(sides.map((s) => s.size[1])).toEqual([2320, 2320])
    expect(parts.filter((p) => p.role === 'divider')).toHaveLength(1)
    expect(parts.filter((p) => p.role === 'rod')).toHaveLength(2)
  })
})
