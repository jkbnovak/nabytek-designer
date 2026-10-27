import { useEffect, useState } from 'react'

const KEY = 'nabytek-designer:split'

function load(): number {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw === null ? NaN : Number(raw)
    return v >= 0 && v <= 100 ? v : 50
  } catch {
    return 50
  }
}

/** Poměr rozdělení editor / 3D v procentech; pamatuje se v prohlížeči. */
export function useSplit() {
  const [split, setSplit] = useState(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(split))
    } catch {
      // nevadí
    }
  }, [split])
  return [split, setSplit] as const
}
