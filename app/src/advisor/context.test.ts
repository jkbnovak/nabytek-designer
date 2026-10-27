import { describe, expect, it } from 'vitest'
import { loznice } from '../model/samples/loznice'
import { describeProject } from './context'

describe('describeProject', () => {
  it('popíše zadání, místnost, korpusy s členěním a materiály', () => {
    const t = describeProject(loznice)
    expect(t).toContain(loznice.brief)
    expect(t).toContain('výška stropu 2600')
    expect(t).toContain('okno ve stěně 2')
    expect(t).toContain('③ šatní skříň: š 1600 × h 613 × v 2320')
    expect(t).toContain('šatní tyč')
    expect(t).toContain('4 šuplíky')
    expect(t).toContain('fronty: Egger H1145 ST10 Dub Bardolino přírodní')
  })
})
