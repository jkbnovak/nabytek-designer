import { useCallback, useEffect, useState } from 'react'

interface State<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 200

/** Stav s historií zpět/vpřed; aktuální hodnota se průběžně ukládá do localStorage. */
export function useHistory<T>(storageKey: string, initial: () => T, validate: (raw: unknown) => T) {
  const [state, setState] = useState<State<T>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return { past: [], present: validate(JSON.parse(raw)), future: [] }
    } catch {
      // poškozená nebo nedostupná data – začneme od výchozího stavu
    }
    return { past: [], present: initial(), future: [] }
  })

  // false = poslední zápis selhal (plné úložiště) – volající to má ukázat
  const [saved, setSaved] = useState(true)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.present))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }, [storageKey, state.present])

  const set = useCallback((next: T | ((cur: T) => T)) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (cur: T) => T)(s.present) : next
      if (value === s.present) return s
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s))
  }, [])

  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s))
  }, [])

  return { value: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0, saved }
}
