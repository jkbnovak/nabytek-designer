import { z } from 'zod/v4'

// Čtení ručně psaných údajů u inkoustu v půdorysu. Tvar (stěny, obdélníky) rozpozná aplikace sama,
// Claude jen přiřadí čísla a popisky k očíslovaným úsekům S1… / korpusům K1….

export const WallsReadSchema = z.object({
  segments: z.array(z.object({ index: z.number(), length: z.number().nullable() })),
  height: z.number().nullable(),
  thickness: z.number().nullable(),
  openings: z.array(
    z.object({
      segment: z.number(),
      at: z.number(), // poloha středu otvoru jako zlomek délky úseku od jeho začátku (0–1)
      kind: z.enum(['window', 'door']),
      width: z.number(),
      height: z.number().nullable(),
      sill: z.number().nullable(),
    }),
  ),
  uncertain: z.array(z.string()),
  notes: z.string(),
})
export type WallsRead = z.infer<typeof WallsReadSchema>

export const FurnitureReadSchema = z.object({
  cabinets: z.array(
    z.object({
      index: z.number(),
      label: z.string().nullable(),
      width: z.number().nullable(),
      depth: z.number().nullable(),
      height: z.number().nullable(),
      elevation: z.number().nullable(), // výška spodní hrany nad podlahou u visících korpusů
    }),
  ),
  uncertain: z.array(z.string()),
  notes: z.string(),
})
export type FurnitureRead = z.infer<typeof FurnitureReadSchema>

export type PlanReadMode = 'walls' | 'furniture'
