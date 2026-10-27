import { useEffect, useRef, useState } from 'react'
import { Splitter } from './Splitter'
import { useSplit } from './useSplit'
import { ProjectDialog } from './ProjectDialog'
import { Viewer3D } from './viewer3d/Viewer3D'
import { Editor } from './editor/Editor'
import { AssemblySchema, type Assembly } from './model/schema'
import { useHistory } from './useHistory'
import type { LayerVisibility } from './model/planInk'
import { EMPTY_ASSEMBLY, projectKey } from './projects'
import { getCapabilities, type Capabilities } from './api'
import { VisualizeDialog, type Shot } from './render/VisualizeDialog'
import { AdvisorPanel } from './advisor/AdvisorPanel'
import { Guide } from './guide/Guide'
import type { GuideAction } from './guide/steps'
import type { EditorCommand } from './editor/Editor'

interface Props {
  projectId: string
  onRename: (name: string) => void
  onTouched: () => void // model se změnil – aktualizovat čas v seznamu projektů
  onProjects: () => void
  onNew: () => void
}

/** Jeden otevřený projekt: lišta, editor a 3D. Při přepnutí projektu se celá připojí znovu (key = id). */
export function Workspace({ projectId, onRename, onTouched, onProjects, onNew }: Props) {
  const history = useHistory<Assembly>(
    projectKey(projectId, 'assembly'),
    () => EMPTY_ASSEMBLY,
    (raw) => AssemblySchema.parse(raw),
  )
  const { value: assembly, set, undo, redo } = history
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frontsOpacity, setFrontsOpacity] = useState(1)
  const [visible, setVisible] = useState<LayerVisibility>({ space: true, furniture: true, views: true })
  const [editing, setEditing] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [shot, setShot] = useState<Shot | null>(null)
  const [advisor, setAdvisor] = useState(false)
  const [split, setSplit] = useSplit()
  const mainRef = useRef<HTMLElement>(null)
  // průvodce se sám otevře u prázdného projektu
  const [guide, setGuide] = useState(() => !history.value.room && history.value.cabinets.length === 0)
  const [command, setCommand] = useState<EditorCommand | null>(null)
  const [focus, setFocus] = useState(false)

  // kreslení přes celé okno: lišta a 3D se schovají, menu editoru se přesune do plovoucího panelu (Esc = zpět)
  const toggleFocus = (on: boolean) => setFocus(on)

  const guideAction = (a: GuideAction) => {
    if (split < 20) setSplit(50) // editor musí být vidět
    if (a.kind === 'brief') return setEditing(true)
    if (a.kind === 'advisor') return setAdvisor(true)
    if (a.kind === 'elevation') {
      const id = selectedId ?? assembly.cabinets[0]?.id
      if (!id) return
      setSelectedId(id)
      return setCommand({ mode: 'elevation', layer: 'furniture', nonce: Date.now() })
    }
    setCommand({ mode: a.mode, layer: a.layer, spaceTool: a.spaceTool, nonce: Date.now() })
  }

  useEffect(() => {
    getCapabilities().then(setCaps)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (!(e.ctrlKey || e.metaKey) || tag === 'INPUT' || tag === 'TEXTAREA') return
      const action = e.key === 'z' && !e.shiftKey ? undo : e.key === 'y' || (e.key === 'z' && e.shiftKey) ? redo : null
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  useEffect(() => onRename(assembly.name), [assembly.name]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (history.canUndo) onTouched()
  }, [assembly]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'layout' + (focus ? ' focus' : '')}>
      <header>
        <strong>Nábytek Designer</strong>
        <button className="project" onClick={() => setEditing(true)} title="Název a zadání projektu">
          📋 {assembly.name}
          {!assembly.brief && <em>· doplnit zadání</em>}
        </button>
        <button onClick={undo} disabled={!history.canUndo} title="Zpět (Ctrl+Z)">
          ↶ Zpět
        </button>
        <button onClick={redo} disabled={!history.canRedo} title="Vpřed (Ctrl+Y)">
          ↷ Vpřed
        </button>
        <button onClick={onProjects}>🗂 Projekty</button>
        <button onClick={onNew}>+ Nový</button>
        <button className={advisor ? 'on' : ''} onClick={() => setAdvisor((v) => !v)} title="Chat s nábytkářem nad projektem">
          💬 Poradce
        </button>
        <button
          className={guide ? 'on' : ''}
          onClick={() => {
            // průvodce leží nad 3D – když je 3D schované, ukázat ho
            if (!guide && split > 80) setSplit(55)
            setGuide((v) => !v)
          }}
          title="Postup projektu krok za krokem"
        >
          🧭 Průvodce
        </button>
        {!history.saved && (
          <span className="save-error" title="Prohlížeč nemá místo – ulož projekt do souboru v Projektech a smaž staré projekty nebo fotky">
            ⚠ Neuloženo – plné úložiště
          </span>
        )}
        <label title="Zprůhlední dvířka a šuplíky ve 3D, aby byl vidět vnitřek (jen zobrazení, model se nemění)">
          Průhlednost dvířek
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            // posuvník doprava = průhlednější; uvnitř se drží neprůhlednost front
            value={1 - frontsOpacity}
            onChange={(e) => setFrontsOpacity(1 - +e.target.value)}
          />
        </label>
      </header>
      <main ref={mainRef} style={{ '--split': `${split}%` } as React.CSSProperties}>
        <section className="editor-pane">
          <Editor
            assembly={assembly}
            setAssembly={set}
            selectedId={selectedId}
            onSelect={setSelectedId}
            visible={visible}
            onVisible={setVisible}
            projectId={projectId}
            onView={setViewId}
            command={command}
            focus={focus}
            onFocus={toggleFocus}
          />
        </section>
        <Splitter container={mainRef} split={split} onSplit={setSplit} />
        <section className="viewer">
          <Viewer3D
            assembly={assembly}
            frontsOpacity={frontsOpacity}
            selectedId={selectedId}
            visible={visible}
            viewId={viewId}
            onView={setViewId}
            onVisualize={caps?.aiRender ? setShot : undefined}
          />
          {guide && <Guide projectId={projectId} assembly={assembly} onAction={guideAction} onClose={() => setGuide(false)} />}
          {advisor && <AdvisorPanel projectId={projectId} assembly={assembly} onClose={() => setAdvisor(false)} />}
        </section>
      </main>
      {shot && caps && <VisualizeDialog shot={shot} assembly={assembly} priceUsd={caps.aiRenderPriceUsd} onClose={() => setShot(null)} />}
      {editing && (
        <ProjectDialog
          title="Projekt"
          name={assembly.name}
          brief={assembly.brief}
          okLabel="Uložit"
          onOk={(p) => {
            set((a) => ({ ...a, ...p }))
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  )
}
