import { AssemblySchema, type Assembly } from './model/schema'
import { EMPTY_SKETCH, parseSketch, type Sketch } from './sketch/sketch'
import { DEFAULT_MATERIALS } from './materials/library'

// Projekty v localStorage: seznam (název, poslední změna) + data každého projektu pod vlastními klíči.

export const EMPTY_ASSEMBLY: Assembly = {
  name: 'Nový projekt',
  brief: '',
  materials: { ...DEFAULT_MATERIALS },
  room: null,
  cabinets: [],
  cameras: [],
}

export interface ProjectMeta {
  id: string
  name: string
  updated: number
}

export type ProjectPart = 'assembly' | 'sketch-space' | 'sketch-furniture' | 'advisor'

const INDEX_KEY = 'nabytek-designer:projects'
const CURRENT_KEY = 'nabytek-designer:current'
const PARTS: ProjectPart[] = ['assembly', 'sketch-space', 'sketch-furniture', 'advisor']
// klíče z doby, kdy aplikace držela jediný projekt
const LEGACY: Record<ProjectPart, string> = {
  assembly: 'nabytek-designer:assembly',
  'sketch-space': 'nabytek-designer:sketch-space',
  'sketch-furniture': 'nabytek-designer:sketch',
  advisor: 'nabytek-designer:advisor', // ve starších verzích neexistoval
}

export const projectKey = (id: string, part: ProjectPart) => `nabytek-designer:p:${id}:${part}`
const newProjectId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Zápis; false = úložiště je plné nebo nedostupné. */
function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function saveIndex(list: ProjectMeta[]) {
  write(INDEX_KEY, JSON.stringify(list))
}

/** Seznam projektů; při prvním spuštění převezme jediný projekt ze starších verzí. */
export function loadIndex(): ProjectMeta[] {
  try {
    const raw = read(INDEX_KEY)
    if (raw) return JSON.parse(raw) as ProjectMeta[]
  } catch {
    // poškozený seznam – sestavit znovu
  }
  const legacy = read(LEGACY.assembly)
  if (!legacy) return []
  const id = newProjectId()
  for (const part of PARTS) {
    const v = read(LEGACY[part])
    if (v !== null) write(projectKey(id, part), v)
  }
  let name = 'Projekt'
  try {
    name = AssemblySchema.parse(JSON.parse(legacy)).name
  } catch {
    // název nevadí
  }
  const list = [{ id, name, updated: Date.now() }]
  saveIndex(list)
  for (const part of PARTS) localStorage.removeItem(LEGACY[part])
  return list
}

export const loadCurrent = () => read(CURRENT_KEY)
export const saveCurrent = (id: string) => write(CURRENT_KEY, id)

/** Založí projekt (model + skici) a vrátí jeho záznam do seznamu. */
export function createProject(
  assembly: Assembly,
  sketches: Partial<Record<'space' | 'furniture', Sketch>> = {},
  advisor: unknown[] = [],
): ProjectMeta {
  const id = newProjectId()
  if (advisor.length) write(projectKey(id, 'advisor'), JSON.stringify(advisor))
  write(projectKey(id, 'assembly'), JSON.stringify(assembly))
  write(projectKey(id, 'sketch-space'), JSON.stringify(sketches.space ?? EMPTY_SKETCH))
  write(projectKey(id, 'sketch-furniture'), JSON.stringify(sketches.furniture ?? EMPTY_SKETCH))
  return { id, name: assembly.name, updated: Date.now() }
}

export function deleteProjectData(id: string) {
  for (const part of PARTS) localStorage.removeItem(projectKey(id, part))
}

// Soubor projektu: model i obě skici v jednom JSON.
const FILE_APP = 'nabytek-designer'

export function exportProject(id: string): { filename: string; content: string } {
  const parse = (part: ProjectPart) => {
    const raw = read(projectKey(id, part))
    return raw ? JSON.parse(raw) : null
  }
  const assembly = AssemblySchema.parse(parse('assembly'))
  const content = JSON.stringify({
    app: FILE_APP,
    version: 1,
    assembly,
    sketches: { space: parse('sketch-space') ?? EMPTY_SKETCH, furniture: parse('sketch-furniture') ?? EMPTY_SKETCH },
    advisor: parse('advisor') ?? [],
  })
  const safe = assembly.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'projekt'
  return { filename: `${safe}.nabytek.json`, content }
}

export function parseProjectFile(text: string): {
  assembly: Assembly
  sketches: Record<'space' | 'furniture', Sketch>
  advisor: unknown[]
} {
  let data: { app?: string; assembly?: unknown; sketches?: { space?: unknown; furniture?: unknown }; advisor?: unknown }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Soubor není platný projekt (není to JSON).')
  }
  if (data.app !== FILE_APP) throw new Error('Soubor není projekt Nábytek Designeru.')
  const assembly = AssemblySchema.parse(data.assembly)
  const sketch = (raw: unknown) => {
    try {
      return parseSketch(raw)
    } catch {
      return EMPTY_SKETCH
    }
  }
  return {
    assembly,
    sketches: { space: sketch(data.sketches?.space), furniture: sketch(data.sketches?.furniture) },
    advisor: Array.isArray(data.advisor) ? data.advisor : [],
  }
}

export function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
