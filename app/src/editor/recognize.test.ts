import { describe, expect, it } from 'vitest'
import { recognize, type Pt } from './recognize'

// Ruční „roztřesený“ tah mezi body.
function stroke(corners: Pt[], steps = 20, jitter = 3): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i < corners.length; i++) {
    const [a, b] = [corners[i - 1], corners[i]]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push([a[0] + (b[0] - a[0]) * t + Math.sin(s * 7) * jitter, a[1] + (b[1] - a[1]) * t + Math.cos(s * 5) * jitter])
    }
  }
  out.push(corners[corners.length - 1])
  return out
}

describe('recognize', () => {
  it('svislá čára', () => {
    const s = recognize(stroke([[100, 0], [104, 400]]))
    expect(s).toMatchObject({ kind: 'line', axis: 'v' })
  })

  it('vodorovná čára', () => {
    const s = recognize(stroke([[0, 200], [500, 210]]))
    expect(s).toMatchObject({ kind: 'line', axis: 'h' })
  })

  it('šikmá čára nemá osu', () => {
    const s = recognize(stroke([[0, 0], [300, 300]]))
    expect(s).toMatchObject({ kind: 'line', axis: null })
  })

  it('nedotažený obdélník', () => {
    const s = recognize(stroke([[0, 0], [600, 0], [600, 300], [0, 300], [10, 40]]))
    expect(s.kind).toBe('rect')
  })

  it('čmáranice není nic', () => {
    const s = recognize(stroke([[0, 0], [300, 20], [10, 40], [290, 60], [0, 80], [300, 100]]))
    expect(s.kind).toBe('unknown')
  })
})
