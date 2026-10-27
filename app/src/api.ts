import { AssemblySchema, type Assembly, type Room } from './model/schema'
import type { FurnitureRead, PlanReadMode, WallsRead } from './model/planRead'

export interface ImportResponse {
  assembly: Assembly
  uncertain: { cabinet: string; what: string }[]
  notes: string
}

export interface ImageData {
  data: string
  mediaType: string
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  } catch {
    throw new Error('Server neodpovídá – běží npm run dev?')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? (res.status >= 500 ? 'API server neodpovídá – běží npm run dev?' : `Chyba serveru (${res.status}).`))
  return body as T
}

/** Pošle obrázek skici jedné vrstvy (a volitelnou poznámku) na server, který ho nechá přečíst Claudem. */
export async function importSketch(
  layer: 'space' | 'furniture',
  image: ImageData,
  note: string,
  room: Room | null,
  brief: string,
): Promise<ImportResponse> {
  const body = await post<ImportResponse>('/api/import-sketch', { layer, image: image.data, mediaType: image.mediaType, note, room, brief })
  return { ...body, assembly: AssemblySchema.parse(body.assembly) }
}

/** Přečte ručně psané údaje u inkoustu v půdorysu (stěny nebo nábytek). */
export function readPlan(mode: 'walls', image: ImageData, shapes: string, note: string, brief: string): Promise<WallsRead>
export function readPlan(mode: 'furniture', image: ImageData, shapes: string, note: string, brief: string): Promise<FurnitureRead>
export function readPlan(mode: PlanReadMode, image: ImageData, shapes: string, note: string, brief: string) {
  return post('/api/read-plan', { mode, image: image.data, mediaType: image.mediaType, shapes, note, brief })
}

export interface Capabilities {
  aiRender: boolean
  aiRenderPriceUsd: number
}

/** Co server umí (volitelné placené funkce). Když server neodpovídá, nic volitelného se neukáže. */
export async function getCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch('/api/capabilities')
    if (res.ok) return (await res.json()) as Capabilities
  } catch {
    // server neběží – volitelné funkce vypnout
  }
  return { aiRender: false, aiRenderPriceUsd: 0 }
}

/** AI průchod renderu – placený, volá se jen na výslovné kliknutí. */
export function visualize(payload: { image: string; aspect: string; assembly: Assembly; cameraId: string | null; wish: string }) {
  return post<{ image: string; mediaType: string; prompt: string }>('/api/visualize', payload)
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Otázka poradci; odpověď chodí po kouscích přes onText. Vrací celou odpověď. */
export async function askAdvisor(
  messages: ChatMessage[],
  assembly: Assembly,
  image: string | null,
  onText: (soFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, assembly, image }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new Error('Server neodpovídá – běží npm run dev?')
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Chyba serveru (${res.status}).`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  return text
}
