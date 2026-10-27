import * as THREE from 'three'
import type { Material } from '../materials/library'

// Procedurální kresba dřeva (svislá léta) – jedna textura na materiál, sdílená všemi díly.
const cache = new Map<string, THREE.Texture>()

/** Jednoduchý deterministický generátor, ať kresba při každém načtení vypadá stejně. */
function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

let floor: THREE.Texture | null = null

/** Dřevěná podlaha (prkna 1 m × 190 mm s vystřídanými spoji); textura = 1 m × 1 m, UV podlahy jsou v metrech. */
export function floorTexture(): THREE.Texture {
  if (floor) return floor
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rnd = random(42)
  const rows = 5 // ~200 mm na prkno
  const h = size / rows
  for (let r = 0; r < rows; r++) {
    const offset = (r * 0.37 * size) % size
    for (const start of [offset - size, offset]) {
      const tone = 0.9 + rnd() * 0.15
      ctx.fillStyle = `rgb(${Math.round(196 * tone)}, ${Math.round(160 * tone)}, ${Math.round(118 * tone)})`
      ctx.fillRect(start, r * h, size, h)
      ctx.strokeStyle = '#8a6a45'
      for (let i = 0; i < 24; i++) {
        const y = r * h + rnd() * h
        ctx.globalAlpha = 0.06 + rnd() * 0.12
        ctx.lineWidth = 0.5 + rnd() * 1.5
        ctx.beginPath()
        ctx.moveTo(start, y)
        ctx.bezierCurveTo(start + size * 0.3, y + (rnd() - 0.5) * 8, start + size * 0.6, y + (rnd() - 0.5) * 8, start + size, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#6e5236'
      ctx.fillRect(start + size - 1, r * h, 2, h) // spoj na konci prkna
    }
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#6e5236'
    ctx.fillRect(0, r * h, size, 2) // podélná spára
    ctx.globalAlpha = 1
  }
  floor = new THREE.CanvasTexture(canvas)
  floor.colorSpace = THREE.SRGBColorSpace
  floor.wrapS = floor.wrapT = THREE.RepeatWrapping
  floor.anisotropy = 8
  return floor
}

export function grainTexture(m: Material): THREE.Texture | null {
  if (!m.grain) return null
  const hit = cache.get(m.id)
  if (hit) return hit
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = m.color
  ctx.fillRect(0, 0, size, size)
  const rnd = random([...m.id].reduce((s, c) => s + c.charCodeAt(0), 7))
  ctx.strokeStyle = m.grain
  for (let i = 0; i < 140; i++) {
    const x = rnd() * size
    const wave = 2 + rnd() * 6
    const phase = rnd() * Math.PI * 2
    ctx.globalAlpha = 0.08 + rnd() * 0.25
    ctx.lineWidth = 0.5 + rnd() * 2.5
    ctx.beginPath()
    for (let y = 0; y <= size; y += 8) {
      const px = x + Math.sin(y / 60 + phase) * wave
      if (y === 0) ctx.moveTo(px, y)
      else ctx.lineTo(px, y)
    }
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  cache.set(m.id, tex)
  return tex
}
