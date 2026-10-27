import { z } from 'zod/v4'
import { AssemblySchema, type Assembly, type Cabinet, type Fill, type Room, type Zone } from './schema'
import { placeOnWall, wallSegments, type P2 } from './room'

// Plochý formát pro čtení skici Claudem. Strukturovaný výstup API neumí rekurzivní
// schéma, proto je členění seznam polí s odkazem na rodiče; na strom ho převede toAssembly().

export const ImportZoneSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(['leaf', 'split']),
  axis: z.enum(['x', 'y']).nullable(),
  size: z.number().nullable(),
  fill: z.enum(['open', 'rod', 'drawers']).nullable(),
  shelves: z.number().nullable(),
  drawers: z.number().nullable(),
  front: z.enum(['none', 'door-left', 'door-right']),
})

export const ImportRoomSchema = z.object({
  height: z.number(),
  closed: z.boolean(),
  vertices: z.array(z.object({ x: z.number(), z: z.number() })),
  openings: z.array(
    z.object({
      kind: z.enum(['window', 'door']),
      wall: z.number(),
      offset: z.number(),
      width: z.number(),
      height: z.number(),
      sill: z.number(),
    }),
  ),
  obstacles: z.array(z.object({ label: z.string(), x: z.number(), z: z.number(), width: z.number(), depth: z.number(), height: z.number() })),
  slopes: z.array(z.object({ wall: z.number(), kneeHeight: z.number(), depth: z.number() })),
  stairs: z.array(
    z.object({
      x: z.number(),
      z: z.number(),
      length: z.number(),
      width: z.number(),
      direction: z.enum(['+x', '-x', '+z', '-z']),
      bottomStart: z.number(),
      bottomEnd: z.number(),
    }),
  ),
})

// směr stoupání → otočení (lokální osa x schodiště míří ve směru stoupání, viz toWorld)
const STAIRS_ROTATION = { '+x': 0, '-x': 180, '+z': 270, '-z': 90 } as const

export const ImportCabinetSchema = z.object({
  label: z.string(),
  wall: z.enum(['back', 'left', 'right']),
  wallIndex: z.number().nullable(),
  offset: z.number(),
  width: z.number(),
  height: z.number(),
  depth: z.number(),
  elevation: z.number(),
  plinth: z.number(),
  thickness: z.number(),
  zones: z.array(ImportZoneSchema),
})

export const ImportResultSchema = z.object({
  name: z.string(),
  roomWidth: z.number().nullable(),
  room: ImportRoomSchema.nullable(),
  cabinets: z.array(ImportCabinetSchema),
  uncertain: z.array(z.object({ cabinet: z.string(), what: z.string() })),
  notes: z.string(),
})

// Skica se převádí po vrstvách; menší schéma pro každou vrstvu (celé by bylo pro strukturovaný výstup příliš velké).
export const ImportSpaceSchema = ImportResultSchema.pick({ name: true, uncertain: true, notes: true }).extend({ room: ImportRoomSchema })
export const ImportFurnitureSchema = ImportResultSchema.omit({ room: true })

export type ImportResult = z.infer<typeof ImportResultSchema>
type ImportZone = z.infer<typeof ImportZoneSchema>
type ImportCabinet = z.infer<typeof ImportCabinetSchema>

const DEFAULT_LEAF: Zone = { kind: 'leaf', fill: { type: 'open', shelves: 0 }, front: 'none' }
const MAX_DEPTH = 12

function toFill(z: ImportZone): Fill {
  if (z.fill === 'rod') return { type: 'rod' }
  if (z.fill === 'drawers') return { type: 'drawers', count: Math.max(1, Math.round(z.drawers ?? 1)) }
  return { type: 'open', shelves: Math.max(0, Math.round(z.shelves ?? 0)) }
}

export function zonesToTree(zones: ImportZone[]): Zone {
  const children = (id: string | null) => zones.filter((z) => z.parentId === id)
  const build = (z: ImportZone, depth: number): Zone => {
    const kids = children(z.id)
    if (z.kind === 'split' && kids.length > 1 && depth < MAX_DEPTH) {
      return {
        kind: 'split',
        axis: z.axis ?? 'x',
        parts: kids.map((k) => ({ size: k.size !== null && k.size > 0 ? k.size : null, zone: build(k, depth + 1) })),
      }
    }
    if (z.kind === 'split' && kids.length === 1) return build(kids[0], depth + 1)
    return { kind: 'leaf', fill: toFill(z), front: z.fill === 'drawers' ? 'none' : z.front }
  }
  const root = children(null)[0]
  return root ? build(root, 0) : DEFAULT_LEAF
}

/** Umístění podle stěny: x/z = levý zadní roh korpusu, viz placement.ts. */
function place(c: ImportCabinet, rightWallX: number): Pick<Cabinet, 'x' | 'z' | 'rotation'> {
  if (c.wall === 'left') return { x: 0, z: c.offset + c.width, rotation: 90 }
  if (c.wall === 'right') return { x: rightWallX, z: c.offset, rotation: 270 }
  return { x: c.offset, z: 0, rotation: 0 }
}

function toRoom(r: NonNullable<ImportResult['room']>): Room | null {
  if (r.vertices.length < (r.closed ? 3 : 2)) return null
  const n = r.closed ? r.vertices.length : r.vertices.length - 1 // počet stěn
  return {
    vertices: r.vertices.map((v): P2 => [v.x, v.z]),
    closed: r.closed,
    height: r.height > 0 ? r.height : 2600,
    wallThickness: 150,
    openings: r.openings
      .filter((o) => o.wall >= 0 && o.wall < n && o.width > 0 && o.height > 0)
      .map((o, i) => ({ id: `o${i + 1}`, ...o, wall: Math.round(o.wall), sill: o.kind === 'door' ? 0 : Math.max(0, o.sill) })),
    obstacles: r.obstacles
      .filter((o) => o.width > 0 && o.depth > 0 && o.height > 0)
      .map((o, i) => ({ id: `s${i + 1}`, ...o, rotation: 0 })),
    slopes: r.slopes
      .filter((s) => s.wall >= 0 && s.wall < n && s.depth > 0 && s.kneeHeight >= 0)
      .map((s, i) => ({ id: `k${i + 1}`, ...s, wall: Math.round(s.wall) })),
    stairs: r.stairs
      .filter((s) => s.length > 0 && s.width > 0)
      .map(({ direction, ...s }, i) => ({
        id: `st${i + 1}`,
        ...s,
        rotation: STAIRS_ROTATION[direction],
        bottomStart: Math.max(0, s.bottomStart),
        bottomEnd: Math.max(0, s.bottomEnd),
      })),
  }
}

/** existingRoom: převod jen nábytku do už existující místnosti (korpusy se umístí k jejím stěnám). */
export function toAssembly(r: ImportResult, existingRoom?: Room | null): Assembly {
  const room = existingRoom !== undefined ? existingRoom : r.room ? toRoom(r.room) : null
  const segs = room ? wallSegments(room) : []
  const backEnd = Math.max(0, ...r.cabinets.filter((c) => c.wall === 'back').map((c) => c.offset + c.width))
  const rightWallX = r.roomWidth ?? Math.max(3000, backEnd)
  const cabinets = r.cabinets.map((c, i) => ({
    id: `k${i + 1}`,
    label: c.label,
    // s místností: zády ke stěně wallIndex, offset podél ní; jinak zadní/levá/pravá stěna
    ...(c.wallIndex !== null && segs[c.wallIndex] ? placeOnWall(segs[c.wallIndex], c.offset, c.offset + c.width, c.depth) : place(c, rightWallX)),
    width: c.width,
    height: c.height,
    depth: c.depth,
    elevation: Math.max(0, c.elevation),
    plinth: c.elevation > 0 ? 0 : Math.max(0, c.plinth),
    thickness: c.thickness > 0 ? c.thickness : 18,
    interior: zonesToTree(c.zones),
  }))
  return AssemblySchema.parse({ name: r.name, room, cabinets, cameras: [] })
}
