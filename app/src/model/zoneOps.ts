import type { Zone } from './schema'

// Cesta k poli ve stromu členění = indexy částí od kořene.
export type Path = number[]

export function getZone(root: Zone, path: Path): Zone {
  return path.reduce<Zone>((z, i) => {
    if (z.kind !== 'split') throw new Error('Neplatná cesta')
    return z.parts[i].zone
  }, root)
}

export function updateZone(root: Zone, path: Path, fn: (z: Zone) => Zone): Zone {
  if (path.length === 0) return fn(root)
  if (root.kind !== 'split') throw new Error('Neplatná cesta')
  const [i, ...rest] = path
  return {
    ...root,
    parts: root.parts.map((p, j) => (j === i ? { ...p, zone: updateZone(p.zone, rest, fn) } : p)),
  }
}

/**
 * Rozdělí pole na `path` příčkou (axis 'x') nebo policí (axis 'y').
 * `first` = světlý rozměr levé/spodní části. Pokud je rodič dělený ve stejné ose,
 * vloží novou část do něj (žádné zbytečné vnořování). Vrací nový kořen a cestu k první části.
 */
export function splitCell(root: Zone, path: Path, axis: 'x' | 'y', first: number, t: number): { root: Zone; path: Path } {
  const cell = getZone(root, path)
  const parentPath = path.slice(0, -1)
  const parent = path.length ? getZone(root, parentPath) : null

  if (parent?.kind === 'split' && parent.axis === axis) {
    const i = path[path.length - 1]
    const old = parent.parts[i]
    const second = old.size === null ? null : old.size - first - t
    const parts = [...parent.parts.slice(0, i), { size: first, zone: cell }, { size: second, zone: cell }, ...parent.parts.slice(i + 1)]
    return { root: updateZone(root, parentPath, () => ({ ...parent, parts })), path }
  }

  const split: Zone = { kind: 'split', axis, parts: [{ size: first, zone: cell }, { size: null, zone: cell }] }
  return { root: updateZone(root, path, () => split), path: [...path, 0] }
}

/** Nastaví pevný rozměr části (null = dopočítat). */
export function setPartSize(root: Zone, path: Path, size: number | null): Zone {
  if (!path.length) return root
  const i = path[path.length - 1]
  return updateZone(root, path.slice(0, -1), (z) =>
    z.kind === 'split' ? { ...z, parts: z.parts.map((p, j) => (j === i ? { ...p, size } : p)) } : z,
  )
}

/** Odstraní příčku/polici za polem (u posledního před ním) – pole se sloučí se sousedem. */
export function mergeWithNeighbour(root: Zone, path: Path, t: number): Zone {
  if (!path.length) return root
  const i = path[path.length - 1]
  return updateZone(root, path.slice(0, -1), (z) => {
    if (z.kind !== 'split') return z
    const j = i < z.parts.length - 1 ? i + 1 : i - 1
    const [a, b] = [z.parts[i], z.parts[j]]
    const size = a.size !== null && b.size !== null ? a.size + b.size + t : null
    const merged = { size, zone: a.zone }
    const lo = Math.min(i, j)
    const parts = [...z.parts.slice(0, lo), merged, ...z.parts.slice(lo + 2)]
    return parts.length === 1 ? parts[0].zone : { ...z, parts }
  })
}
