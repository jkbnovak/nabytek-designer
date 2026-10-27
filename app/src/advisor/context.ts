import type { Assembly, Cabinet, Zone } from '../model/schema'
import { material, materialLabel } from '../materials/library'
import { wallSegments } from '../model/room'
import { slopeAngle } from '../model/slopes'
import { ceilingStatus } from '../model/ceiling'

// Textový popis projektu pro poradce (Claude): zadání, místnost, korpusy včetně členění a materiály.

const FRONT: Record<string, string> = { 'door-left': 'dvířka panty vlevo', 'door-right': 'dvířka panty vpravo', none: '' }

function zoneText(z: Zone): string {
  if (z.kind === 'leaf') {
    const fill =
      z.fill.type === 'rod'
        ? 'šatní tyč'
        : z.fill.type === 'drawers'
          ? `${z.fill.count} šuplíky`
          : z.fill.shelves
            ? `${z.fill.shelves} police`
            : 'otevřené'
    return [fill, FRONT[z.front]].filter(Boolean).join(', ')
  }
  const axis = z.axis === 'x' ? 'příčky zleva doprava' : 'police zdola nahoru'
  return `${axis}: [${z.parts.map((p) => `${p.size ? `${p.size} mm` : 'zbytek'} – ${zoneText(p.zone)}`).join(' | ')}]`
}

function cabinetText(c: Cabinet, a: Assembly): string {
  const carcass = materialLabel(material(c.carcassMaterial ?? a.materials.carcass))
  const fronts = materialLabel(material(c.frontsMaterial ?? a.materials.fronts))
  return [
    `- ${c.label || c.id}: š ${c.width} × h ${c.depth} × v ${c.height} mm, deska ${c.thickness} mm, sokl ${c.plinth}`,
    c.elevation > 0 ? `, zavěšeno ${c.elevation} mm nad podlahou` : '',
    `\n  členění: ${zoneText(c.interior)}`,
    `\n  korpus: ${carcass}; fronty: ${fronts}`,
    CEILING_TEXT[ceilingStatus(c, a.room) ?? 'none'],
  ].join('')
}

const CEILING_TEXT = {
  cut: '\n  pod šikminou / schody – automaticky zkosený (vůle 10 mm)',
  conflict: '\n  ZASAHUJE do šikminy / schodů (zkosení vypnuté)',
  none: '',
}

export function describeProject(a: Assembly): string {
  const out: string[] = [`Projekt: ${a.name}`]
  out.push(a.brief.trim() ? `Zadání od designéra:\n${a.brief.trim()}` : 'Zadání: (nevyplněno)')
  out.push(
    `Výchozí materiály: korpusy ${materialLabel(material(a.materials.carcass))}, fronty ${materialLabel(material(a.materials.fronts))}`,
  )

  const r = a.room
  if (r) {
    const segs = wallSegments(r)
    out.push(
      `Místnost: ${r.closed ? 'uzavřená' : 'samostatná stěna / řada stěn'}, výška stropu ${r.height} mm, zdi ${r.wallThickness} mm.`,
      `Stěny (délky): ${segs.map((s) => `${s.index + 1}: ${Math.round(s.length)}`).join(', ')}`,
    )
    for (const o of r.openings)
      out.push(
        `- ${o.kind === 'window' ? 'okno' : 'dveře'} ve stěně ${o.wall + 1}: od rohu ${o.offset}, š ${o.width} × v ${o.height}${o.kind === 'window' ? `, parapet ${o.sill}` : ''}`,
      )
    for (const s of r.slopes)
      out.push(
        `- šikmina u stěny ${s.wall + 1}: nadezdívka ${s.kneeHeight}, sklon ${Math.round(slopeAngle(s, r.height))}°, zlom ${s.depth} od stěny`,
      )
    for (const s of r.stairs) out.push(`- schodiště: rameno ${s.length} × ${s.width}, podhled ${s.bottomStart} → ${s.bottomEnd}`)
    for (const o of r.obstacles) out.push(`- ${o.label || 'sloup'}: ${o.width} × ${o.depth}, v ${o.height}`)
  } else out.push('Místnost: zatím nezakreslena.')

  out.push(a.cabinets.length ? 'Korpusy:' : 'Korpusy: zatím žádné.')
  for (const c of a.cabinets) out.push(cabinetText(c, a))
  return out.join('\n')
}
