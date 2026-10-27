import { describe, expect, it } from 'vitest'
import { EMPTY_ASSEMBLY } from '../projects'
import { loznice } from '../model/samples/loznice'
import { guideSteps } from './steps'

const doneIds = (steps: ReturnType<typeof guideSteps>) => steps.filter((s) => s.done).map((s) => s.id)

describe('guideSteps', () => {
  it('prázdný projekt: nic hotového, členění nejde otevřít', () => {
    const steps = guideSteps(EMPTY_ASSEMBLY, 0)
    expect(doneIds(steps)).toEqual([])
    expect(steps.find((s) => s.id === 'interior')!.actions[0].disabled).toBe(true)
  })
  it('vzorová ložnice: zadání, prostor, okna, nábytek, členění, materiály i pohledy', () => {
    expect(doneIds(guideSteps(loznice, 0))).toEqual(['brief', 'space', 'details', 'furniture', 'interior', 'materials', 'views'])
    expect(doneIds(guideSteps(loznice, 2))).toContain('advisor')
  })
})
