import type { Assembly, Cabinet, Opening, Room } from '../model/schema'
import { cabinetFromStroke, isTextStroke, wallsFromInk, type InkStroke } from '../model/planInk'
import { buildPolyline, closePolygon, edgesOf, pointOnWall, wallSegments, type P2 } from '../model/room'
import type { FurnitureRead, WallsRead } from '../model/planRead'
import { readPlan } from '../api'
import { isClosedStroke, recognize } from './recognize'
import { renderPlanImage } from './planImage'

export interface ConvertInfo {
  notes: string
  uncertain: { cabinet: string; what: string }[]
}

const round10 = (v: number) => Math.round(v / 10) * 10
const DEFAULT_ROOM_HEIGHT = 2600
const DEFAULT_CABINET_HEIGHT = 2000

/** Zavolá Clauda; při chybě vrátí null a důvod, aby převod mohl pokračovat s rozměry z kresby. */
async function tryRead<T>(read: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await read(), error: null }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) }
  }
}

function info(tag: string, notes: string | undefined, uncertain: string[], error: string | null): ConvertInfo {
  return {
    notes: error ? `Psané údaje se nepodařilo přečíst (${error}) – použity rozměry z kresby.` : (notes ?? ''),
    uncertain: uncertain.map((what) => ({ cabinet: tag, what })),
  }
}

/** Stěny z inkoustu: tvar z kresby, délky / výška / otvory z ručně psaných údajů (Claude). */
export async function convertWalls(ink: InkStroke[], assembly: Assembly, note: string): Promise<{ room: Room; info: ConvertInfo }> {
  const walls = wallsFromInk(ink)
  if (!walls) throw new Error('Nenašel jsem žádné stěny – nakresli je delšími tahy (čísla mohou být vedle).')
  const segs = wallSegments(walls)

  const labels = segs.map((s, i) => ({ text: `S${i + 1}`, at: pointOnWall(s, s.length * 0.3), start: s.a }))
  const shapes =
    segs.map((s, i) => `S${i + 1}: přibližně ${round10(s.length)} mm`).join('\n') +
    (walls.closed ? '\n(uzavřená místnost)' : '\n(samostatná stěna / řada stěn)')
  const image = renderPlanImage(
    ink.filter((s) => s.kind === 'walls'),
    { room: null, cabinets: assembly.cabinets },
    labels,
  )
  const { value: read, error } = await tryRead<WallsRead>(() => readPlan('walls', image, shapes, note, assembly.brief))

  const { angles } = edgesOf(walls.vertices, walls.closed)
  const lengths = segs.map((s, i) => read?.segments.find((r) => r.index === i + 1)?.length ?? round10(s.length))
  const vertices = walls.closed ? closePolygon(walls.vertices[0], angles, lengths) : buildPolyline(walls.vertices[0], angles, lengths)
  const finalSegs = wallSegments({ vertices, closed: walls.closed })

  const openings: Opening[] = (read?.openings ?? [])
    .filter((o) => finalSegs[o.segment - 1] && o.width > 0)
    .map((o, i) => {
      const len = finalSegs[o.segment - 1].length
      return {
        id: `o${Date.now().toString(36)}${i}`,
        kind: o.kind,
        wall: o.segment - 1,
        offset: Math.max(0, Math.min(len - o.width, round10(o.at * len - o.width / 2))),
        width: o.width,
        height: o.height ?? (o.kind === 'window' ? 1400 : 1970),
        sill: o.kind === 'door' ? 0 : (o.sill ?? 900),
      }
    })

  const uncertain = [...(read?.uncertain ?? [])]
  if (walls.ignored) uncertain.push(`${walls.ignored} tah(y) nenavazují na hlavní stěny a nepoužily se.`)
  if (walls.closed && read) {
    // u uzavřené místnosti se poslední dvě stěny dopočítají – upozornit, pokud psaná délka nesedí
    finalSegs.slice(-2).forEach((s, k) => {
      const i = finalSegs.length - 2 + k
      const written = read.segments.find((r) => r.index === i + 1)?.length
      if (written && Math.abs(written - s.length) > 20)
        uncertain.push(`S${i + 1}: napsáno ${written}, aby se místnost uzavřela, vychází ${Math.round(s.length)}.`)
    })
  }

  return {
    room: {
      vertices,
      closed: walls.closed,
      height: read?.height ?? assembly.room?.height ?? DEFAULT_ROOM_HEIGHT,
      wallThickness: read?.thickness ?? assembly.room?.wallThickness ?? 150,
      openings,
      obstacles: assembly.room?.obstacles ?? [],
      // šikminy jsou vázané na pořadí stěn – zachovat jen při stejném počtu stěn
      slopes: assembly.room && wallSegments(assembly.room).length === finalSegs.length ? assembly.room.slopes : [],
      stairs: assembly.room?.stairs ?? [],
    },
    info: info('Stěny', read?.notes, uncertain, error),
  }
}

/** Korpusy z inkoustu: obdélníky z kresby (přichycené ke stěnám), rozměry a názvy z psaných údajů. */
export async function convertFurniture(
  ink: InkStroke[],
  assembly: Assembly,
  note: string,
): Promise<{ cabinets: Cabinet[]; info: ConvertInfo }> {
  const shapes = ink.filter(
    (s) => s.kind === 'furniture' && !isTextStroke(s) && (recognize(s.points).kind === 'rect' || isClosedStroke(s.points)),
  )
  if (!shapes.length) throw new Error('Nenašel jsem žádný korpus – nakresli obdélník (čísla mohou být vedle nebo uvnitř).')
  const drafts = shapes.map((s) => cabinetFromStroke(assembly.room, assembly.cabinets, s.points))
  const centers = shapes.map((s): P2 => [
    s.points.reduce((a, p) => a + p[0], 0) / s.points.length,
    s.points.reduce((a, p) => a + p[1], 0) / s.points.length,
  ])

  const labels = drafts.map((_, i) => ({ text: `K${i + 1}`, at: centers[i] }))
  const list = drafts
    .map(
      (d, i) =>
        `K${i + 1}: přibližně ${round10(d.width)} × ${round10(d.depth)} mm${d.wall !== null ? ` (u stěny ${d.wall + 1}${d.behind ? ', z druhé strany' : ''})` : ''}`,
    )
    .join('\n')
  const image = renderPlanImage(
    ink.filter((s) => s.kind === 'furniture'),
    assembly,
    labels,
  )
  const { value: read, error } = await tryRead<FurnitureRead>(() => readPlan('furniture', image, list, note, assembly.brief))

  const maxHeight = assembly.room?.height ?? Infinity
  const cabinets = drafts.map((d, i): Cabinet => {
    const r = read?.cabinets.find((c) => c.index === i + 1)
    const width = r?.width ?? round10(d.width)
    const depth = r?.depth ?? round10(d.depth)
    return {
      id: `k${Date.now().toString(36)}${i}`,
      label: r?.label ?? `Korpus ${assembly.cabinets.length + i + 1}`,
      ...d.place(width, depth),
      height: r?.height ?? Math.min(DEFAULT_CABINET_HEIGHT, maxHeight),
      elevation: r?.elevation ?? 0,
      plinth: r?.elevation ? 0 : 80,
      thickness: 18,
      interior: { kind: 'leaf', fill: { type: 'open', shelves: 0 }, front: 'none' },
    }
  })
  return { cabinets, info: info('Nábytek', read?.notes, read?.uncertain ?? [], error) }
}
