import { z } from 'zod'

// Všechny rozměry v mm. Souřadnice: x = podél stěny, y = nahoru, z = od stěny do místnosti.

// Obsah jedné „buňky“ korpusu (list stromu členění).
export const FillSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), shelves: z.number().int().min(0) }),
  z.object({ type: z.literal('rod') }),
  z.object({ type: z.literal('drawers'), count: z.number().int().min(1) }),
])
export type Fill = z.infer<typeof FillSchema>

export const FrontSchema = z.enum(['none', 'door-left', 'door-right'])
export type Front = z.infer<typeof FrontSchema>

export type Zone =
  | { kind: 'leaf'; fill: Fill; front: Front }
  // Rozdělení příčkami (axis 'x') nebo policemi (axis 'y').
  // size = pevný světlý rozměr v mm, null = zbytek rozdělit rovnoměrně.
  | { kind: 'split'; axis: 'x' | 'y'; parts: { size: number | null; zone: Zone }[] }

export const ZoneSchema: z.ZodType<Zone, z.ZodTypeDef, Zone> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('leaf'), fill: FillSchema, front: FrontSchema }),
    z.object({
      kind: z.literal('split'),
      axis: z.enum(['x', 'y']),
      parts: z.array(z.object({ size: z.number().positive().nullable(), zone: ZoneSchema })).min(1),
    }),
  ]),
)

export const CabinetSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  x: z.number(),
  z: z.number().default(0),
  // Otočení kolem svislé osy ve stupních (proti směru hodin při pohledu shora); x/z = levý zadní roh.
  rotation: z.number().default(0),
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  // výška spodní hrany nad podlahou – 0 stojí na zemi, > 0 visící (horní skříňky, police nad TV)
  elevation: z.number().min(0).default(0),
  plinth: z.number().min(0).default(0),
  thickness: z.number().positive().default(18),
  interior: ZoneSchema,
  // pod šikminou / schody se korpus automaticky zkosí; false = nechat celý (aplikace upozorní na kolizi)
  fitCeiling: z.boolean().optional(),
  // materiál (id z knihovny); bez hodnoty platí materiál projektu
  carcassMaterial: z.string().optional(),
  frontsMaterial: z.string().optional(),
})
export type Cabinet = z.infer<typeof CabinetSchema>

// Kamera („očičko“): oko a bod, kam se dívá, v mm (x, výška, z); fov = svislý zorný úhel ve stupních.
export const CameraSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
  fov: z.number().min(10).max(120).default(50),
})
export type Camera = z.infer<typeof CameraSchema>

// Otvor ve stěně: offset = vzdálenost levé hrany od začátku stěny (vrchol `wall`).
export const OpeningSchema = z.object({
  id: z.string(),
  kind: z.enum(['window', 'door']),
  wall: z.number().int().min(0),
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  sill: z.number().min(0),
})
export type Opening = z.infer<typeof OpeningSchema>

// Sloup, komín, stoupačka – kvádr v půdorysu (střed x/z, otočení jako u korpusu).
export const ObstacleSchema = z.object({
  id: z.string(),
  label: z.string().default(''),
  x: z.number(),
  z: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
})
export type Obstacle = z.infer<typeof ObstacleSchema>

// Šikmina (krov) u stěny `wall`: u stěny ve výšce nadezdívky, stoupá do vzdálenosti depth od stěny,
// kde začíná rovný strop (výška místnosti).
export const SlopeSchema = z.object({
  id: z.string(),
  wall: z.number().int().min(0),
  kneeHeight: z.number().min(0),
  depth: z.number().positive(),
})
export type Slope = z.infer<typeof SlopeSchema>

// Schodiště: obdélník v půdorysu (střed x/z, otočení jako u korpusu), stoupá ve směru lokální osy x.
// length = délka ramene (ve směru stoupání), width = šířka ramene; podhled = výška spodní hrany na začátku a na konci.
export const StairsSchema = z.object({
  id: z.string(),
  x: z.number(),
  z: z.number(),
  length: z.number().positive(),
  width: z.number().positive(),
  rotation: z.number().default(0),
  bottomStart: z.number().min(0),
  bottomEnd: z.number().min(0),
})
export type Stairs = z.infer<typeof StairsSchema>

// Místnost: vnitřní obrys stěn v půdorysu, stěna i vede z vrcholu i do i+1.
// closed = false: jen samostatná stěna / lomená řada stěn; nábytek stojí po pravé ruce ve směru vrcholů.
export const RoomSchema = z.object({
  vertices: z.array(z.tuple([z.number(), z.number()])).min(2),
  closed: z.boolean().default(true),
  height: z.number().positive(),
  wallThickness: z.number().positive().default(150),
  openings: z.array(OpeningSchema).default([]),
  obstacles: z.array(ObstacleSchema).default([]),
  slopes: z.array(SlopeSchema).default([]),
  stairs: z.array(StairsSchema).default([]),
})
export type Room = z.infer<typeof RoomSchema>

export const AssemblySchema = z.object({
  name: z.string(),
  // zadání projektu od designéra – Claude ho dostává jako kontext ke každému převodu
  brief: z.string().default(''),
  // výchozí materiály projektu (id z knihovny materiálů)
  materials: z.object({ carcass: z.string(), fronts: z.string() }).default({ carcass: 'egger-W1000', fronts: 'egger-W1000' }),
  room: RoomSchema.nullable().default(null),
  cabinets: z.array(CabinetSchema),
  cameras: z.array(CameraSchema).default([]),
})
export type Assembly = z.infer<typeof AssemblySchema>
