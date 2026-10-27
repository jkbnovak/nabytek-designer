import { AssemblySchema } from '../src/model/schema.ts'
import { renderPrompt } from '../src/render/prompt.ts'

// Volitelný AI průchod přes Google Gemini. Bez GEMINI_API_KEY je vypnutý a aplikace funguje dál bez něj.

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1'
// orientační cena za obrázek 2K (ceník Google, 10/2026) – ukazuje se v aplikaci před spuštěním
export const PRICE_PER_IMAGE_USD = 0.05

export const aiRenderAvailable = () => !!process.env.GEMINI_API_KEY

export class VisualizeError extends Error {}

export interface VisualizeRequest {
  image?: string // PNG renderu v base64
  aspect?: string
  assembly?: unknown
  cameraId?: string | null
  wish?: string
}

export async function visualize(body: VisualizeRequest): Promise<{ image: string; mediaType: string; prompt: string }> {
  if (!aiRenderAvailable()) throw new VisualizeError('AI vizualizace je vypnutá – chybí GEMINI_API_KEY v app/.env.')
  if (!body.image) throw new VisualizeError('Chybí obrázek renderu.')
  const assembly = AssemblySchema.parse(body.assembly)
  const camera = assembly.cameras.find((c) => c.id === body.cameraId) ?? null
  const prompt = renderPrompt(assembly, camera, body.wish ?? '')

  // knihovnu načíst až při použití – bez klíče se vůbec nenačítá
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const started = Date.now()
  let interaction
  try {
    interaction = await ai.interactions.create({
      model: MODEL,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', mime_type: 'image/png', data: body.image },
      ],
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: body.aspect ?? '4:3', image_size: '2K' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(msg)) throw new VisualizeError('Google API je nedostupné – zkontroluj připojení k internetu.')
    throw new VisualizeError(`Chyba Google API: ${msg.slice(0, 300)}`)
  }
  console.log(`[visualize] ${MODEL} ${((Date.now() - started) / 1000).toFixed(1)} s`)
  const out = interaction.output_image
  if (!out?.data) throw new VisualizeError('Model nevrátil obrázek – zkus to znovu nebo uprav přání.')
  return { image: out.data, mediaType: out.mime_type ?? 'image/png', prompt }
}
