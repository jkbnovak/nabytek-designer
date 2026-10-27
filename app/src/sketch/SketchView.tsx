import { useEffect, useRef, useState } from 'react'
import { StrokeCanvas, inkSize, outlinePath } from '../editor/StrokeCanvas'
import type { Pt } from '../editor/recognize'
import { ToolbarSlot } from '../editor/FloatingTools'
import { PAPER, PIN, UNDERLAY_OPACITY, contentHeight, hitStrokes, readPhoto, type Sketch } from './sketch'
import type { DrawLayer } from '../model/planInk'

type Tool = 'ink' | 'note' | 'pin' | 'eraser'

const INK = '#222'
const NOTE = '#e8742c'
const ERASER_RADIUS = 18

interface Props {
  sketch: Sketch
  setSketch: (fn: (s: Sketch) => Sketch) => void
  undo: () => void
  canUndo: boolean
  busy: boolean
  error: string | null
  onConvert: () => void
  note: string
  onNote: (note: string) => void
  layer: DrawLayer
  underlay: Sketch | null // druhá vrstva, jen pro orientaci
}

const TEXTS: Record<DrawLayer, { convert: string; note: string; empty: string }> = {
  space: {
    convert: 'Převést prostor →',
    note: 'Poznámka k převodu – např. výška stropu 2650, okno parapet 900, zdi 300…',
    empty: 'Nakresli prostor – stěny, okna, dveře, sloupy i s kótami – nebo nahraj fotku',
  },
  furniture: {
    convert: 'Převést nábytek →',
    note: 'Poznámka k převodu – co ve skice není (např. dvířka bez úchytek, BOK = výška)…',
    empty: 'Nakresli nábytek i s kótami, nebo nahraj fotku papírové skici',
  },
}

/** Volné kreslení celé skicy včetně ručně psaných kót; „Převést“ ji pošle Claudovi. */
export function SketchView({ sketch, setSketch, undo, canUndo, busy, error, onConvert, note, onNote, layer, underlay }: Props) {
  const texts = TEXTS[layer]
  const [tool, setTool] = useState<Tool>('ink')
  const fileRef = useRef<HTMLInputElement>(null)
  const pinInputs = useRef<(HTMLInputElement | null)[]>([])
  const [focusPin, setFocusPin] = useState<number | null>(null)
  const [pinsOpen, setPinsOpen] = useState(true)

  useEffect(() => {
    if (focusPin === null) return
    pinInputs.current[focusPin]?.focus()
    setFocusPin(null)
  }, [focusPin])

  const addPin = (at: Pt) => {
    setPinsOpen(true) // bod se hned popisuje – panel musí být otevřený
    const hit = sketch.pins.findIndex((p) => Math.hypot(p.at[0] - at[0], p.at[1] - at[1]) < PIN.r * 1.6)
    if (hit >= 0) return setFocusPin(hit) // ťuknutí na bod = upravit jeho text
    const last = sketch.pins.length - 1
    if (last >= 0 && !sketch.pins[last].text.trim()) {
      // poslední bod je ještě prázdný – jen ho přesunout, ať nevznikají prázdné body
      setFocusPin(last)
      return setSketch((s) => ({ ...s, pins: s.pins.map((p, k) => (k === last ? { ...p, at } : p)) }))
    }
    setFocusPin(sketch.pins.length)
    setSketch((s) => ({ ...s, pins: [...s.pins, { at, text: '' }] }))
  }
  const setPinText = (i: number, text: string) => setSketch((s) => ({ ...s, pins: s.pins.map((p, k) => (k === i ? { ...p, text } : p)) }))
  const removePin = (i: number) => setSketch((s) => ({ ...s, pins: s.pins.filter((_, k) => k !== i) }))
  // papír přes celou plochu: šířka PAPER.w, výška podle poměru stran okna (a vždy aspoň po nakreslený obsah)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(PAPER.h / PAPER.w)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => el.clientWidth && setAspect(el.clientHeight / el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const paperH = Math.max(PAPER.w * aspect, contentHeight(sketch, underlay) - 40)
  const viewBox: [number, number, number, number] = [0, 0, PAPER.w, paperH]
  const size = inkSize(PAPER.w)

  const erase = (pts: Pt[]) =>
    setSketch((s) => {
      const hit = hitStrokes(s.strokes, pts, ERASER_RADIUS)
      return hit.size ? { ...s, strokes: s.strokes.filter((_, i) => !hit.has(i)) } : s
    })

  const add = (points: Pt[]) =>
    tool === 'pin'
      ? addPin(points[0])
      : tool === 'eraser'
        ? erase(points)
        : setSketch((s) => ({ ...s, strokes: [...s.strokes, { color: tool === 'note' ? NOTE : INK, points }] }))

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const photo = await readPhoto(file)
    setSketch((s) => ({ ...s, photo }))
  }

  const empty = !sketch.strokes.length && !sketch.photo && !sketch.pins.length

  return (
    <div className="sketch">
      <ToolbarSlot order={4}>
        <div className="sketch-tools">
          <div className="seg">
            <button className={tool === 'ink' ? 'on' : ''} onClick={() => setTool('ink')}>
              ✎ Pero
            </button>
            <button className={tool === 'note' ? 'on' : ''} onClick={() => setTool('note')}>
              <span style={{ color: NOTE }}>●</span> Poznámky
            </button>
            <button className={tool === 'pin' ? 'on' : ''} onClick={() => setTool('pin')} title="Ťukni do skici a napiš text (kóta, popis)">
              <span style={{ color: PIN.color }}>①</span> Bod
            </button>
            <button className={tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')}>
              ⌫ Guma
            </button>
          </div>
          <button onClick={undo} disabled={!canUndo}>
            ↶
          </button>
          <button onClick={() => fileRef.current?.click()}>📷 Fotka</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {sketch.photo && <button onClick={() => setSketch((s) => ({ ...s, photo: null }))}>Bez fotky</button>}
          <button className="danger" disabled={empty} onClick={() => setSketch(() => ({ strokes: [], photo: null, pins: [] }))}>
            Smazat vše
          </button>
          <button className="primary convert" disabled={empty || busy} onClick={onConvert}>
            {busy ? 'Claude čte skicu…' : texts.convert}
          </button>
        </div>
      </ToolbarSlot>
      <ToolbarSlot order={5}>
        <div className="ink-bar">
          <input className="note" value={note} placeholder={texts.note} onChange={(e) => onNote(e.target.value)} />
        </div>
      </ToolbarSlot>
      <div className="canvas-wrap" ref={wrapRef}>
        <StrokeCanvas
          viewBox={viewBox}
          onStroke={add}
          onTap={(p) => (tool === 'pin' ? addPin(p) : add([p, [p[0] + 0.5, p[1] + 0.5]]))}
          inkColor={tool === 'note' ? NOTE : tool === 'eraser' ? '#bbb' : INK}
        >
          <rect x={0} y={0} width={PAPER.w} height={paperH} fill="#fff" />
          {underlay && (
            <g opacity={UNDERLAY_OPACITY}>
              {underlay.photo && (
                <image href={underlay.photo} x={0} y={0} width={PAPER.w} height={PAPER.h} preserveAspectRatio="xMidYMid meet" />
              )}
              {underlay.strokes.map((s, i) => (
                <path key={i} d={outlinePath(s.points, size)} fill="#888" />
              ))}
            </g>
          )}
          {sketch.photo && <image href={sketch.photo} x={0} y={0} width={PAPER.w} height={PAPER.h} preserveAspectRatio="xMidYMid meet" />}
          {sketch.strokes.map((s, i) => (
            <path key={i} d={outlinePath(s.points, size)} fill={s.color} />
          ))}
          {sketch.pins.map((p, i) => (
            <g key={'pin' + i}>
              <circle cx={p.at[0]} cy={p.at[1]} r={PIN.r} fill={PIN.color} />
              <text
                x={p.at[0]}
                y={p.at[1] + 1}
                fill="#fff"
                fontSize={PIN.font}
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {i + 1}
              </text>
              {p.text && (
                <text x={p.at[0] + PIN.r + 6} y={p.at[1] + 1} fill={PIN.color} fontSize={PIN.font} dominantBaseline="middle">
                  {p.text.length > 40 ? p.text.slice(0, 40) + '…' : p.text}
                </text>
              )}
            </g>
          ))}
          {empty && (
            <text x={PAPER.w / 2} y={paperH / 2} textAnchor="middle" fontSize={28} fill="#aaa">
              {texts.empty}
            </text>
          )}
        </StrokeCanvas>
        {sketch.pins.length > 0 && (
          // plovoucí panel nad plátnem – přibývající body nezmenšují kreslicí plochu
          <div className={'pins-panel' + (pinsOpen ? '' : ' collapsed')}>
            <button className="pins-head" onClick={() => setPinsOpen((o) => !o)}>
              ① Body ({sketch.pins.length}) {pinsOpen ? '▾' : '▸'}
            </button>
            {pinsOpen && (
              <ol className="pins">
                {sketch.pins.map((p, i) => (
                  <li key={i}>
                    <span className="pin-num">{i + 1}</span>
                    <input
                      ref={(el) => {
                        pinInputs.current[i] = el
                      }}
                      value={p.text}
                      placeholder="např. šířka 2400, výška stropu 2650, okno parapet 900…"
                      onChange={(e) => setPinText(i, e.target.value)}
                    />
                    <button onClick={() => removePin(i)} aria-label="Smazat bod">
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {underlay && (underlay.strokes.length > 0 || underlay.photo) && (
          <div className="underlay-note">Šedě: skica vrstvy {layer === 'space' ? 'Nábytek' : 'Prostor'} (jen podklad) · skryješ ji 👁</div>
        )}
        {busy && <div className="busy">Claude čte skicu… (obvykle 10–40 s)</div>}
        {error && <div className="toast error">{error}</div>}
      </div>
    </div>
  )
}
