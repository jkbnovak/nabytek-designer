// Knihovna materiálů. Kódy dekorů a barvy jsou orientační – ověřit podle aktuálního vzorníku výrobce.

export type MaterialKind = 'uni' | 'wood' | 'lacquer' | 'solid' | 'metal'

export interface Material {
  id: string
  name: string
  brand?: string
  code?: string
  kind: MaterialKind
  color: string
  grain?: string // barva kresby u dřeva
  roughness: number
  metalness?: number
}

export const MATERIAL_GROUPS: { kind: MaterialKind; label: string }[] = [
  { kind: 'uni', label: 'Lamino – jednobarevné' },
  { kind: 'wood', label: 'Lamino – dřevodekor' },
  { kind: 'lacquer', label: 'Lak' },
  { kind: 'solid', label: 'Masiv' },
  { kind: 'metal', label: 'Kov' },
]

export const MATERIALS: Material[] = [
  { id: 'egger-W1000', name: 'Premium bílá', brand: 'Egger', code: 'W1000 ST9', kind: 'uni', color: '#f3f2ee', roughness: 0.7 },
  { id: 'egger-W1100', name: 'Alpská bílá', brand: 'Egger', code: 'W1100 ST9', kind: 'uni', color: '#eceeea', roughness: 0.7 },
  { id: 'egger-W980', name: 'Platinově bílá', brand: 'Egger', code: 'W980 ST2', kind: 'uni', color: '#eae8e2', roughness: 0.6 },
  { id: 'egger-U702', name: 'Kašmírová šedá', brand: 'Egger', code: 'U702 ST9', kind: 'uni', color: '#c9bfb2', roughness: 0.7 },
  { id: 'egger-U708', name: 'Světle šedá', brand: 'Egger', code: 'U708 ST9', kind: 'uni', color: '#c7c8c5', roughness: 0.7 },
  { id: 'egger-U732', name: 'Prachová šedá', brand: 'Egger', code: 'U732 ST9', kind: 'uni', color: '#8f8c85', roughness: 0.7 },
  { id: 'egger-U961', name: 'Grafitově černá', brand: 'Egger', code: 'U961 ST2', kind: 'uni', color: '#3b3c3e', roughness: 0.6 },
  { id: 'egger-U999', name: 'Černá', brand: 'Egger', code: 'U999 ST2', kind: 'uni', color: '#1f1f20', roughness: 0.6 },
  { id: 'egger-H1145', name: 'Dub Bardolino přírodní', brand: 'Egger', code: 'H1145 ST10', kind: 'wood', color: '#b98f5e', grain: '#8e6a40', roughness: 0.75 },
  { id: 'egger-H3303', name: 'Dub Hamilton přírodní', brand: 'Egger', code: 'H3303 ST10', kind: 'wood', color: '#b48a5b', grain: '#87643d', roughness: 0.75 },
  { id: 'egger-H1180', name: 'Dub Halifax přírodní', brand: 'Egger', code: 'H1180 ST37', kind: 'wood', color: '#a57a4c', grain: '#74522f', roughness: 0.8 },
  { id: 'egger-H3309', name: 'Dub Gladstone pískový', brand: 'Egger', code: 'H3309 ST28', kind: 'wood', color: '#b9a07c', grain: '#8f7656', roughness: 0.8 },
  { id: 'egger-H3170', name: 'Dub Kendal přírodní', brand: 'Egger', code: 'H3170 ST12', kind: 'wood', color: '#b8925f', grain: '#8b6a40', roughness: 0.75 },
  { id: 'egger-H1137', name: 'Dub Sorano černohnědý', brand: 'Egger', code: 'H1137 ST12', kind: 'wood', color: '#4f3b2d', grain: '#33251b', roughness: 0.75 },
  { id: 'lak-9003', name: 'Lak bílý mat', code: 'RAL 9003', kind: 'lacquer', color: '#f2f1ec', roughness: 0.5 },
  { id: 'lak-7016', name: 'Lak antracit mat', code: 'RAL 7016', kind: 'lacquer', color: '#383e42', roughness: 0.5 },
  { id: 'lak-6021', name: 'Lak bledě zelený mat', code: 'RAL 6021', kind: 'lacquer', color: '#89ac76', roughness: 0.5 },
  { id: 'masiv-dub', name: 'Dub masiv, olej', kind: 'solid', color: '#b8864f', grain: '#8a5e30', roughness: 0.65 },
  { id: 'masiv-orech', name: 'Ořech masiv, olej', kind: 'solid', color: '#6b4a32', grain: '#46301f', roughness: 0.65 },
  { id: 'kov-cerny', name: 'Kov černý mat', kind: 'metal', color: '#262626', roughness: 0.45, metalness: 0.6 },
  { id: 'kov-nerez', name: 'Nerez broušená', kind: 'metal', color: '#b9babb', roughness: 0.35, metalness: 0.9 },
]

export const DEFAULT_MATERIALS = { carcass: 'egger-W1000', fronts: 'egger-W1000' }
const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]))

/** Materiál podle id; neznámé id (smazaný / starší) → výchozí bílá. */
export const material = (id: string | null | undefined): Material => BY_ID.get(id ?? '') ?? BY_ID.get(DEFAULT_MATERIALS.carcass)!

/** Popis pro lidi i pro AI: „Egger H1145 ST10 Dub Bardolino přírodní“. */
export const materialLabel = (m: Material) => [m.brand, m.code, m.name].filter(Boolean).join(' ')
