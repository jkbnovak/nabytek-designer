import type { Pt } from '../editor/recognize'
import { inkSize, outlinePath } from '../editor/StrokeCanvas'

export interface Stroke {
  color: string
  points: Pt[]
}

/** Očíslovaný bod ve skice s napsaným textem (kóta, popis) – čte se spolehlivěji než písmo perem. */
export interface Pin {
  at: Pt
  text: string
}

export interface Sketch {
  strokes: Stroke[]
  photo: string | null // data URL fotky papíru, kreslí se pod tahy
  pins: Pin[]
}

// „Papír“: pevná šířka w (souřadnice tahů jsou v těchto jednotkách), výška se řídí oknem.
// h = rámeček pro fotku papírové skici (A4 na šířku).
export const PAPER = { w: 1600, h: 1131 }
export const EMPTY_SKETCH: Sketch = { strokes: [], photo: null, pins: [] }

/** Skica z úložiště nebo souboru (starší skici nemají body). */
export function parseSketch(raw: unknown): Sketch {
  const s = raw as Sketch
  if (!Array.isArray(s?.strokes)) throw new Error('neplatná skica')
  return { strokes: s.strokes, photo: typeof s.photo === 'string' ? s.photo : null, pins: Array.isArray(s.pins) ? s.pins : [] }
}
export const PIN = { r: 17, font: 22, color: '#1f5fd0' }

/** Texty bodů jako seznam pro Clauda; čísla odpovídají kroužkům ve skice. */
export function pinsText(pins: Pin[]): string {
  const lines = pins.map((p, i) => (p.text.trim() ? `${i + 1}: ${p.text.trim()}` : '')).filter(Boolean)
  return lines.length
    ? `Očíslované body ve skice (modré kroužky s číslem) – napsané na klávesnici, proto mají přednost před ručně psaným textem:\n${lines.join('\n')}`
    : ''
}
const MAX_PHOTO_PX = 1600

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Obrázek se nepodařilo načíst.'))
    img.src = src
  })
}

/** Umístění obrázku na papír (contain, na střed). */
export function fitPhoto(w: number, h: number) {
  const s = Math.min(PAPER.w / w, PAPER.h / h)
  return { x: (PAPER.w - w * s) / 2, y: (PAPER.h - h * s) / 2, w: w * s, h: h * s }
}

/** Načte fotku ze souboru a zmenší ji, aby se vešla do úložiště i do požadavku. */
export async function readPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const s = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * s)
    canvas.height = Math.round(img.height * s)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const UNDERLAY_OPACITY = 0.3

const EXPORT_MARGIN = 40
const MIN_EXPORT_H = 300

/**
 * Výška popsané části papíru. Papír má pevnou šířku PAPER.w a výšku podle okna, proto se pro Clauda
 * posílá jen pruh od horního okraje po nejnižší tah / bod (fotka zabírá rámeček PAPER).
 */
export function contentHeight(...sketches: (Sketch | undefined | null)[]): number {
  let max = 0
  for (const sk of sketches) {
    if (!sk) continue
    if (sk.photo) max = Math.max(max, PAPER.h)
    for (const s of sk.strokes) for (const p of s.points) max = Math.max(max, p[1])
    for (const p of sk.pins) max = Math.max(max, p.at[1] + PIN.r)
  }
  return Math.max(MIN_EXPORT_H, Math.ceil(max + EXPORT_MARGIN))
}

/** Vykreslí skicu (fotka + tahy) do PNG pro Clauda; underlay = druhá vrstva šedě pod ní. Vrací base64 bez prefixu. */
export async function exportSketch(sketch: Sketch, underlay?: Sketch): Promise<{ data: string; mediaType: 'image/png' }> {
  const canvas = document.createElement('canvas')
  canvas.width = PAPER.w
  canvas.height = contentHeight(sketch, underlay)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const size = inkSize(PAPER.w)
  const draw = async (sk: Sketch, color?: string) => {
    if (sk.photo) {
      const img = await loadImage(sk.photo)
      const f = fitPhoto(img.width, img.height)
      ctx.drawImage(img, f.x, f.y, f.w, f.h)
    }
    for (const s of sk.strokes) {
      ctx.fillStyle = color ?? s.color
      ctx.fill(new Path2D(outlinePath(s.points, size)))
    }
  }
  if (underlay) {
    ctx.globalAlpha = UNDERLAY_OPACITY
    await draw(underlay, '#888')
    ctx.globalAlpha = 1
  }
  await draw(sketch)
  ctx.font = `bold ${PIN.font}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  sketch.pins.forEach((p, i) => {
    ctx.fillStyle = PIN.color
    ctx.beginPath()
    ctx.arc(p.at[0], p.at[1], PIN.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillText(String(i + 1), p.at[0], p.at[1] + 1)
  })
  return { data: canvas.toDataURL('image/png').split(',')[1], mediaType: 'image/png' }
}

/** Tahy, které guma (body `eraser`) zasáhla. */
export function hitStrokes(strokes: Stroke[], eraser: Pt[], radius: number): Set<number> {
  const hit = new Set<number>()
  strokes.forEach((s, i) => {
    if (s.points.some(([x, y]) => eraser.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < radius))) hit.add(i)
  })
  return hit
}
