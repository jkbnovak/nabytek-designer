import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import type { z } from 'zod/v4'
import { ImportFurnitureSchema, ImportSpaceSchema, toAssembly } from '../src/model/importFormat.ts'
import { AssemblySchema, RoomSchema } from '../src/model/schema.ts'
import { describeProject } from '../src/advisor/context.ts'
import { streamText } from 'hono/streaming'
import { describeWalls } from '../src/model/room.ts'
import { FurnitureReadSchema, WallsReadSchema } from '../src/model/planRead.ts'
import { aiRenderAvailable, PRICE_PER_IMAGE_USD, visualize, VisualizeError, type VisualizeRequest } from './visualize.ts'
import { ADVISOR_PROMPT, FURNITURE_READ_PROMPT, SKETCH_SYSTEM_PROMPT, WALLS_READ_PROMPT } from './prompt.ts'

const PORT = 8787
const MODEL = 'claude-opus-5-5'
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const client = new Anthropic()
const app = new Hono()

class UserError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 500 | 502,
  ) {
    super(message)
  }
}

interface ImageRequest {
  image?: string
  mediaType?: string
  note?: string // volný text od autora – doplňuje obrázek
  brief?: string // zadání projektu – obecný kontext
}

/** Pošle obrázek (+ text a poznámku autora) Claudovi a vrátí výstup podle schématu. */
async function readImage<S extends z.ZodType>(
  tag: string,
  schema: S,
  system: string,
  body: ImageRequest,
  text: string,
): Promise<z.infer<S>> {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new UserError('Chybí ANTHROPIC_API_KEY v souboru app/.env – doplň klíč a restartuj npm run dev.', 500)
  if (!body.image || !MEDIA_TYPES.includes(body.mediaType as MediaType)) throw new UserError('Chybí obrázek.', 400)
  const note = body.note?.trim()
  const brief = body.brief?.trim()

  const started = Date.now()
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort: 'high', format: betaZodOutputFormat(schema) },
    messages: [
      {
        role: 'user',
        content: [
          ...(brief ? [{ type: 'text' as const, text: `Zadání projektu (kontext pro výklad skici):\n${brief}` }] : []),
          { type: 'image', source: { type: 'base64', media_type: body.mediaType as MediaType, data: body.image } },
          { type: 'text', text },
          ...(note ? [{ type: 'text' as const, text: `Poznámka autora (má přednost před odhadem z obrázku):\n${note}` }] : []),
        ],
      },
    ],
  })
  console.log(
    `[${tag}] ${((Date.now() - started) / 1000).toFixed(1)} s, tokeny in/out ${response.usage.input_tokens}/${response.usage.output_tokens}`,
  )

  if (response.stop_reason === 'refusal') throw new UserError('Claude odmítl obrázek zpracovat.', 422)
  if (response.stop_reason === 'max_tokens' || !response.parsed_output)
    throw new UserError('Odpověď se nepodařilo přečíst – zkus to znovu.', 502)
  return response.parsed_output as z.infer<S>
}

/** Srozumitelná česká hláška k chybě API (null = neznámá chyba). */
function apiErrorMessage(err: unknown): string | null {
  if (err instanceof UserError) return err.message
  if (err instanceof Anthropic.AuthenticationError) return 'Neplatný API klíč.'
  if (err instanceof Anthropic.RateLimitError) return 'Příliš mnoho požadavků – chvíli počkej.'
  if (err instanceof Anthropic.APIConnectionError) return 'Claude API je nedostupné – zkontroluj připojení k internetu.'
  if (err instanceof Anthropic.APIError) return `Chyba Claude API (${err.status}): ${err.message.slice(0, 300)}`
  return null
}

function fail(c: Context, tag: string, err: unknown) {
  console.error(`[${tag}]`, err)
  const status =
    err instanceof UserError
      ? err.status
      : err instanceof Anthropic.AuthenticationError
        ? 401
        : err instanceof Anthropic.RateLimitError
          ? 429
          : err instanceof Anthropic.APIError
            ? 502
            : 500
  return c.json({ error: apiErrorMessage(err) ?? 'Převod se nepodařil – výstup neodpovídá modelu.' }, status)
}

// Skica po vrstvách: layer "space" převádí jen místnost, "furniture" jen korpusy do existující místnosti (room).
app.post('/api/import-sketch', async (c) => {
  try {
    const body = await c.req.json<ImageRequest & { layer?: string; room?: unknown }>()
    if (body.layer !== 'space' && body.layer !== 'furniture') throw new UserError('Neznámá vrstva skici.', 400)
    const room = body.layer === 'furniture' ? RoomSchema.nullable().parse(body.room ?? null) : null
    const text =
      body.layer === 'space'
        ? 'Převeď tuto skicu PROSTORU: vyplň jen room (stěny, okna, dveře, sloupy). Nábytek ignoruj, cabinets = [].'
        : room
          ? `Převeď tuto skicu NÁBYTKU. Prostor už v projektu existuje (ve skice může být šedě jako podklad), room = null.\n` +
            `Existující stěny – jejich indexy použij jako wallIndex, offset měř od začátku stěny:\n${describeWalls(room)}`
          : 'Převeď tuto skicu NÁBYTKU. Místnost v projektu zatím není: room = null, wallIndex = null.'
    if (body.layer === 'space') {
      const result = await readImage('sketch-space', ImportSpaceSchema, SKETCH_SYSTEM_PROMPT, body, text)
      const assembly = toAssembly({ ...result, roomWidth: null, cabinets: [] })
      if (!assembly.room) throw new UserError('Ve skice jsem nenašel žádné stěny.', 422)
      return c.json({ assembly, uncertain: result.uncertain, notes: result.notes })
    }
    const result = await readImage('sketch-furniture', ImportFurnitureSchema, SKETCH_SYSTEM_PROMPT, body, text)
    const assembly = toAssembly({ ...result, room: null }, room)
    return c.json({ assembly, uncertain: result.uncertain, notes: result.notes })
  } catch (err) {
    return fail(c, 'import-sketch', err)
  }
})

// Půdorys s inkoustem: shapes = textový seznam rozpoznaných úseků / korpusů s přibližnými rozměry.
app.post('/api/read-plan', async (c) => {
  try {
    const body = await c.req.json<ImageRequest & { mode?: string; shapes?: string }>()
    const text = `Rozpoznané tvary (přibližné rozměry z kresby):\n${body.shapes ?? ''}`
    if (body.mode === 'walls') return c.json(await readImage('read-walls', WallsReadSchema, WALLS_READ_PROMPT, body, text))
    if (body.mode === 'furniture') return c.json(await readImage('read-furniture', FurnitureReadSchema, FURNITURE_READ_PROMPT, body, text))
    throw new UserError('Neznámý režim převodu.', 400)
  } catch (err) {
    return fail(c, 'read-plan', err)
  }
})

interface AdvisorRequest {
  messages?: { role: string; content: string }[]
  assembly?: unknown
  image?: string // aktuální 3D pohled (PNG base64), přiloží se k poslední otázce
}

const MAX_ADVISOR_TURNS = 40

// Poradce – chat s nábytkářem nad projektem. Odpověď se streamuje jako prostý text.
app.post('/api/advisor', async (c) => {
  let params: Anthropic.MessageStreamParams
  try {
    if (!process.env.ANTHROPIC_API_KEY) throw new UserError('Chybí ANTHROPIC_API_KEY v souboru app/.env.', 500)
    const body = await c.req.json<AdvisorRequest>()
    const assembly = AssemblySchema.parse(body.assembly)
    const turns = (body.messages ?? [])
      .filter(
        (m): m is { role: 'user' | 'assistant'; content: string } => (m.role === 'user' || m.role === 'assistant') && !!m.content?.trim(),
      )
      .slice(-MAX_ADVISOR_TURNS)
    while (turns.length && turns[0].role !== 'user') turns.shift()
    if (!turns.length || turns[turns.length - 1].role !== 'user') throw new UserError('Chybí otázka.', 400)
    const last = turns.length - 1
    params = {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: ADVISOR_PROMPT },
        { type: 'text', text: `Aktuální popis projektu z aplikace:\n${describeProject(assembly)}` },
      ],
      messages: turns.map((m, i) =>
        i === last && body.image
          ? {
              role: 'user' as const,
              content: [
                { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: body.image } },
                { type: 'text' as const, text: m.content },
              ],
            }
          : { role: m.role, content: m.content },
      ),
    }
  } catch (err) {
    return fail(c, 'advisor', err)
  }

  return streamText(
    c,
    async (out) => {
      const started = Date.now()
      const stream = client.messages.stream(params)
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') await out.write(event.delta.text)
      }
      const final = await stream.finalMessage()
      console.log(
        `[advisor] ${((Date.now() - started) / 1000).toFixed(1)} s, tokeny in/out ${final.usage.input_tokens}/${final.usage.output_tokens}`,
      )
      if (final.stop_reason === 'refusal') await out.write('\n\n⚠ Na tohle poradce neodpoví.')
      if (final.stop_reason === 'max_tokens') await out.write('\n\n⚠ Odpověď byla příliš dlouhá a je zkrácená.')
    },
    async (err, out) => {
      console.error('[advisor]', err)
      await out.write(`\n\n⚠ ${apiErrorMessage(err) ?? 'Odpověď se nepodařila.'}`)
    },
  )
})

// Co server umí – aplikace podle toho ukáže volitelné funkce.
app.get('/api/capabilities', (c) => c.json({ aiRender: aiRenderAvailable(), aiRenderPriceUsd: PRICE_PER_IMAGE_USD }))

// Volitelný AI průchod renderu (Google Gemini); jen na výslovné kliknutí, za cenu jednoho obrázku.
app.post('/api/visualize', async (c) => {
  try {
    return c.json(await visualize(await c.req.json<VisualizeRequest>()))
  } catch (err) {
    console.error('[visualize]', err)
    return c.json(
      { error: err instanceof VisualizeError ? err.message : 'Vizualizace se nepodařila.' },
      err instanceof VisualizeError ? 502 : 500,
    )
  }
})

serve({ fetch: app.fetch, port: PORT }, () => console.log(`API server běží na http://localhost:${PORT}`))
