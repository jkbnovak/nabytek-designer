import { useEffect, useRef, useState } from 'react'
import type { Assembly } from '../model/schema'
import { askAdvisor, type ChatMessage } from '../api'
import { projectKey } from '../projects'
import { Markdown } from './Markdown'

const MAX_IMAGE_PX = 1024 // menší obrázek = méně tokenů, na posouzení návrhu stačí

const STARTERS = [
  'Zkontroluj návrh a upozorni na problémy.',
  'Poraď s tím, co v zadání nevím.',
  'Jaké kování doporučíš na dvířka a šuplíky?',
  'Jak to namontovat do nerovných stěn?',
]

function loadChat(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

/** Aktuální 3D pohled jako zmenšené PNG (base64), nebo null. */
function viewerSnapshot(): string | null {
  const src = document.querySelector<HTMLCanvasElement>('.viewer canvas')
  if (!src) return null
  const s = Math.min(1, MAX_IMAGE_PX / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * s)
  c.height = Math.round(src.height * s)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]
}

interface Props {
  projectId: string
  assembly: Assembly
  onClose: () => void
}

/** Poradce – chat s nábytkářem nad projektem; vidí zadání, model a volitelně aktuální 3D pohled. */
export function AdvisorPanel({ projectId, assembly, onClose }: Props) {
  const key = projectKey(projectId, 'advisor')
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(key))
  const [input, setInput] = useState('')
  const [withView, setWithView] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(messages))
    } catch {
      // plné úložiště – chat zůstane aspoň do zavření
    }
  }, [key, messages])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => () => abort.current?.abort(), [])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    const history: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError(null)
    setBusy(true)
    abort.current = new AbortController()
    const showAnswer = (content: string) => setMessages([...history, { role: 'assistant', content }])
    try {
      await askAdvisor(history, assembly, withView ? viewerSnapshot() : null, showAnswer, abort.current.signal)
    } catch (err) {
      if (!abort.current.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
        setMessages(history) // otázka zůstane, prázdná odpověď ne
        setInput(question)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="advisor-panel">
      <header>
        <strong>💬 Poradce – nábytkář</strong>
        {messages.length > 0 &&
          (confirmClear ? (
            <button
              className="danger"
              onClick={() => {
                setMessages([])
                setConfirmClear(false)
              }}
            >
              Opravdu smazat
            </button>
          ) : (
            <button onClick={() => setConfirmClear(true)} disabled={busy} title="Začít novou konverzaci">
              Nová
            </button>
          ))}
        <button onClick={onClose} aria-label="Zavřít">
          ×
        </button>
      </header>
      <div className="advisor-messages">
        {messages.length === 0 && (
          <div className="advisor-empty">
            <p>
              Ptej se jako kolegy v dílně. Poradce vidí zadání projektu, celý model a{withView ? ' aktuální 3D pohled' : ' popis návrhu'}.
            </p>
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'advisor-msg ' + m.role}>
            {m.role === 'assistant' ? m.content ? <Markdown text={m.content} /> : <em className="thinking">Přemýšlí…</em> : m.content}
          </div>
        ))}
        {error && <p className="error-text">{error}</p>}
        <div ref={end} />
      </div>
      <form
        className="advisor-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <textarea
          rows={3}
          value={input}
          placeholder="Napiš otázku… (Enter odešle, Shift+Enter nový řádek)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
        />
        <div className="advisor-actions">
          <label>
            <input type="checkbox" checked={withView} onChange={(e) => setWithView(e.target.checked)} /> přiložit 3D pohled
          </label>
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()}>
              ■ Zastavit
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!input.trim()}>
              Odeslat
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}
