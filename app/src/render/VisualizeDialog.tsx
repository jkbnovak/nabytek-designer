import { useState } from 'react'
import type { Assembly } from '../model/schema'
import { visualize } from '../api'
import { nearestRatio } from './prompt'

export interface Shot {
  dataUrl: string // PNG z 3D
  width: number
  height: number
  cameraId: string | null
  isRender: boolean // pořízeno v režimu 🎨 Render
}

interface Props {
  shot: Shot
  assembly: Assembly
  priceUsd: number
  onClose: () => void
}

const CZK_PER_USD = 23 // orientačně, jen pro odhad ceny

/** AI průchod: náhled renderu, přání, cena předem; výsledek ke stažení. Výsledky se drží jen do zavření. */
export function VisualizeDialog({ shot, assembly, priceUsd, onClose }: Props) {
  const [wish, setWish] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<string[]>([])
  const camera = assembly.cameras.find((c) => c.id === shot.cameraId)
  const name = `${assembly.name} – ${camera?.label || '3D'} – AI`.replace(/[\\/:*?"<>|]+/g, '')

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await visualize({
        image: shot.dataUrl.split(',')[1],
        aspect: nearestRatio(shot.width, shot.height),
        assembly,
        cameraId: shot.cameraId,
        wish,
      })
      setResults((r) => [`data:${res.mediaType};base64,${res.image}`, ...r])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog visualize-dialog" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <h3>✨ AI vizualizace{camera ? ` – ${camera.label}` : ''}</h3>
        <div className="visualize-images">
          <figure>
            <img src={shot.dataUrl} alt="Render z aplikace" />
            <figcaption>Podklad z 3D{shot.isRender ? '' : ' – tip: zapni 🎨 Render, výsledek bude věrnější'}</figcaption>
          </figure>
          {results.map((src, i) => (
            <figure key={src.slice(-40) + i}>
              <img src={src} alt="AI vizualizace" />
              <figcaption>
                <a href={src} download={`${name} ${results.length - i}.png`}>
                  ⬇ Stáhnout
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
        <label className="stack">
          <span>Přání k tomuto obrázku (nálada, světlo, doplňky)</span>
          <textarea
            rows={3}
            value={wish}
            placeholder="např. večerní světlo, betonová stěrka na podlaze, pár knih a rostlina na komodě"
            onChange={(e) => setWish(e.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="dialog-buttons">
          <span className="price">
            Placené přes Google Gemini: cca {priceUsd.toLocaleString('cs-CZ')} USD (~{(Math.ceil(priceUsd * CZK_PER_USD * 10) / 10).toLocaleString('cs-CZ')} Kč) za obrázek
          </span>
          <button onClick={onClose} disabled={busy}>
            Zavřít
          </button>
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? 'Generuji… (10–60 s)' : results.length ? 'Vytvořit další variantu' : 'Vytvořit vizualizaci'}
          </button>
        </div>
      </div>
    </div>
  )
}
