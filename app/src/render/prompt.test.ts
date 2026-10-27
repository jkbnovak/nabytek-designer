import { describe, expect, it } from 'vitest'
import { loznice } from '../model/samples/loznice'
import { nearestRatio, renderPrompt } from './prompt'

describe('renderPrompt', () => {
  it('obsahuje materiály s kódy, rozměry, zadání a přání', () => {
    const p = renderPrompt(loznice, loznice.cameras[0], 'večerní světlo')
    expect(p).toContain('Egger W1000 ST9 Premium bílá')
    expect(p).toContain('Egger H1145 ST10 Dub Bardolino přírodní')
    expect(p).toContain('1600×613×2320')
    expect(p).toContain(loznice.brief)
    expect(p).toContain('večerní světlo')
    expect(p).toContain(`Camera: "${loznice.cameras[0].label}"`)
  })
  it('vlastní materiál korpusu se uvede zvlášť', () => {
    const a = { ...loznice, cabinets: loznice.cabinets.map((c, i) => (i === 0 ? { ...c, frontsMaterial: 'lak-7016' } : c)) }
    expect(renderPrompt(a, null, '')).toContain('fronts RAL 7016 Lak antracit mat')
  })
})

describe('nearestRatio', () => {
  it('vybere nejbližší podporovaný poměr', () => {
    expect(nearestRatio(1400, 1580)).toBe('4:5')
    expect(nearestRatio(1000, 1000)).toBe('1:1')
    expect(nearestRatio(1920, 1080)).toBe('16:9')
    expect(nearestRatio(1200, 900)).toBe('4:3')
    expect(nearestRatio(800, 1200)).toBe('2:3')
  })
})
