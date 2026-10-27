import type { Assembly, Camera } from '../model/schema'
import { material, materialLabel, type Material } from '../materials/library'
import { slopeAngle } from '../model/slopes'

// Zadání pro volitelný AI průchod: render 3D → fotorealistická vizualizace se zachovanou geometrií.
// Anglicky – obrazové modely mu rozumí nejlépe; názvy dekorů zůstávají, jak je zná výrobce.

const KIND_EN: Record<Material['kind'], string> = {
  uni: 'smooth matte solid-color melamine laminate',
  wood: 'wood-grain decor laminate with realistic grain',
  lacquer: 'smooth matte lacquered MDF',
  solid: 'solid wood with oiled finish and natural grain',
  metal: 'metal',
}

const describeMaterial = (m: Material) => `${materialLabel(m)} – ${KIND_EN[m.kind]}, base color ${m.color}`

/** Popis scény pro obrazový model (obrázek renderu se posílá zvlášť). */
export function renderPrompt(a: Assembly, camera: Camera | null, wish: string): string {
  const lines: string[] = [
    'Turn the attached image into a photorealistic interior visualization of custom-made built-in furniture.',
    'The attached image is a 3D render of the exact design from a fixed camera – treat it as a strict reference:',
    '- keep the camera position, angle, lens and framing exactly as in the image;',
    '- keep every piece of furniture exactly where it is, with the same dimensions and proportions;',
    '- keep all door, drawer and shelf divisions exactly as drawn (thin lines are gaps between fronts);',
    '- do not add, remove or move furniture, doors, drawers, shelves, windows or walls;',
    '- no handles unless the brief asks for them (handleless fronts by default);',
    '- ignore construction aids if any are visible: grid lines on the ground and orange highlight edges.',
    '',
    'Furniture materials:',
    `- carcass (sides, tops, shelves) by default: ${describeMaterial(material(a.materials.carcass))}`,
    `- fronts (doors, drawer fronts) by default: ${describeMaterial(material(a.materials.fronts))}`,
  ]
  for (const c of a.cabinets) {
    const own = [
      c.carcassMaterial && `carcass ${describeMaterial(material(c.carcassMaterial))}`,
      c.frontsMaterial && `fronts ${describeMaterial(material(c.frontsMaterial))}`,
    ].filter(Boolean)
    if (own.length) lines.push(`- "${c.label || c.id}": ${own.join('; ')}`)
  }

  lines.push('', 'Furniture (width × depth × height in mm):')
  for (const c of a.cabinets) {
    const hung = c.elevation > 0 ? `, wall-hung ${c.elevation} mm above the floor` : ''
    lines.push(`- ${c.label || c.id}: ${c.width}×${c.depth}×${c.height}${hung}`)
  }

  const r = a.room
  if (r) {
    lines.push('', `Room: ceiling height ${r.height} mm, walls in warm white paint, floor as in the image (wooden floor) unless the wishes say otherwise.`)
    const windows = r.openings.filter((o) => o.kind === 'window').length
    if (windows) lines.push(`- ${windows} window(s) with soft natural daylight coming in.`)
    for (const s of r.slopes) lines.push(`- sloped attic ceiling: knee wall ${s.kneeHeight} mm, slope about ${Math.round(slopeAngle(s, r.height))}°.`)
    if (r.stairs.length) lines.push('- a staircase with wooden steps as drawn.')
    if (r.obstacles.length) lines.push('- columns / chimney boxes as drawn, plastered like the walls.')
  }
  if (camera) lines.push('', `Camera: "${camera.label}", eye height ${camera.position[1]} mm.`)
  if (a.brief.trim()) lines.push('', `Project brief from the designer (Czech): ${a.brief.trim()}`)
  if (wish.trim()) lines.push('', `Designer's wishes for this image (Czech; they decide mood, lighting, decor and accessories): ${wish.trim()}`)
  lines.push('', 'Style: realistic interior photography, natural soft light, accurate material textures, subtle reflections, sharp details, no text or watermarks.')
  return lines.join('\n')
}

const RATIOS = ['1:1', '5:4', '4:3', '3:2', '16:9', '21:9', '4:5', '3:4', '2:3', '9:16'] as const

/** Nejbližší poměr stran, který obrazový model umí. */
export function nearestRatio(width: number, height: number): string {
  const value = (r: string) => {
    const [w, h] = r.split(':').map(Number)
    return w / h
  }
  const diff = (r: string) => Math.abs(Math.log(value(r) / (width / height)))
  return RATIOS.reduce((best, r) => (diff(r) < diff(best) ? r : best))
}
