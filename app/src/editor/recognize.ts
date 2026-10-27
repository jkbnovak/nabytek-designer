export type Pt = [number, number]

export type Shape =
  | { kind: 'line'; axis: 'h' | 'v' | null; a: Pt; b: Pt; mid: Pt }
  | { kind: 'rect'; minX: number; minY: number; maxX: number; maxY: number }
  | { kind: 'unknown' }

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Rozpozná tah jako čáru nebo obdélník. Nezávislé na měřítku. */
export function recognize(points: Pt[]): Shape {
  if (points.length < 2) return { kind: 'unknown' }
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag === 0) return { kind: 'unknown' }

  const a = points[0]
  const b = points[points.length - 1]
  const chord = dist(a, b)
  let pathLen = 0
  for (let i = 1; i < points.length; i++) pathLen += dist(points[i - 1], points[i])

  if (chord > 0.8 * diag && pathLen < 1.25 * chord) {
    const angle = (Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0])) * 180) / Math.PI
    const fromH = Math.min(angle, 180 - angle)
    const axis = fromH < 15 ? 'h' : fromH > 75 ? 'v' : null
    const mid: Pt = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length]
    return { kind: 'line', axis, a, b, mid }
  }

  const perimeter = 2 * (w + h)
  const closed = chord < 0.3 * Math.max(w, h)
  const notThin = Math.min(w, h) > 0.12 * Math.max(w, h)
  if (closed && notThin && pathLen > 0.75 * perimeter && pathLen < 1.6 * perimeter) {
    return { kind: 'rect', minX, minY, maxX, maxY }
  }
  return { kind: 'unknown' }
}

/** Uzavřený tah (i pootočený obdélník) – konce u sebe a nejde o tečku či čáru. */
export function isClosedStroke(points: Pt[]): boolean {
  if (points.length < 4) return false
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  let pathLen = 0
  for (let i = 1; i < points.length; i++) pathLen += dist(points[i - 1], points[i])
  return diag > 0 && dist(points[0], points[points.length - 1]) < 0.3 * diag && pathLen > 1.8 * diag
}
