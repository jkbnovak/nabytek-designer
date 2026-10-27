import { useEffect, useState } from 'react'
import type { Assembly, Camera, Cabinet, Obstacle, Opening, Room, Slope, Stairs, Zone } from '../model/schema'
import { slopeDepthFor } from '../model/slopes'
import { footprint, reanchor, type Footprint } from '../model/placement'
import { buildPolyline, closePolygon, edgesOf, flipWalls, type P2, type WallSeg } from '../model/room'
import { inkLayer, type DrawLayer, type InkStroke, type Layer, type LayerVisibility } from '../model/planInk'
import { CameraInspector } from './CameraInspector'
import { FloatingTools, ToolbarSlot } from './FloatingTools'
import { ToolbarTarget } from './toolbar'
import { MaterialPicker } from '../materials/MaterialPicker'
import { convertFurniture, convertWalls } from './planConvert'
import { getZone, mergeWithNeighbour, setPartSize, splitCell, updateZone, type Path } from '../model/zoneOps'
import type { Cell } from '../model/geometry'
import { PlanView, planHint, type PlanSel, type PlanTool } from './PlanView'
import { ObstacleInspector, OpeningInspector, RoomInspector, SlopeInspector, StairsInspector } from './RoomInspectors'
import { ElevationView } from './ElevationView'
import { cabinetCeiling, ceilingStatus } from '../model/ceiling'
import { DimensionDialog, type DimField } from './DimensionDialog'
import { CabinetInspector, CellInspector } from './Inspector'
import { SketchView } from '../sketch/SketchView'
import { EMPTY_SKETCH, exportSketch, parseSketch, pinsText, type Sketch } from '../sketch/sketch'
import { projectKey } from '../projects'
import { importSketch, type ImportResponse } from '../api'
import { useHistory } from '../useHistory'

interface Props {
  assembly: Assembly
  setAssembly: (fn: (a: Assembly) => Assembly) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  visible: LayerVisibility
  onVisible: (v: LayerVisibility) => void
  projectId: string // skici se ukládají k projektu
  onView: (cameraId: string | null) => void // vybraná kamera → 3D se na ni přepne
  command: EditorCommand | null // přepnutí zvenku (průvodce)
  focus: boolean // kreslení přes celou obrazovku
  onFocus: (on: boolean) => void
}

/** Přepnutí editoru zvenku; nonce odliší opakovaný stejný příkaz. */
export interface EditorCommand {
  mode: 'sketch' | 'plan' | 'elevation'
  layer?: Layer
  spaceTool?: SpaceTool
  nonce: number
}

type Dialog = { title: string; fields: DimField[]; onOk: (v: Record<string, number>) => void }

const DEFAULT_ROOM_HEIGHT = 2600
const newId = (prefix: string) => prefix + Date.now().toString(36)

const LAYERS: [Layer, string][] = [
  ['space', 'Prostor'],
  ['furniture', 'Nábytek'],
  ['views', 'Pohledy'],
]

export type SpaceTool = Exclude<PlanTool, 'cabinet' | 'camera'>
const SPACE_TOOLS: [SpaceTool, string][] = [
  ['walls', 'Stěny'],
  ['window', 'Okno'],
  ['door', 'Dveře'],
  ['column', 'Sloup'],
  ['slope', 'Šikmina'],
  ['stairs', 'Schodiště'],
]

export function Editor({
  assembly,
  setAssembly,
  selectedId,
  onSelect,
  visible,
  onVisible,
  projectId,
  onView,
  command,
  focus,
  onFocus,
}: Props) {
  const [mode, setMode] = useState<'sketch' | 'plan' | 'elevation'>('plan')
  const [cellPath, setCellPath] = useState<Path | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // editor přes celé okno – víc místa na kreslení
  const [toolTarget, setToolTarget] = useState<HTMLElement | null>(null)
  // skica zvlášť pro každou vrstvu
  const sketches: Record<DrawLayer, ReturnType<typeof useHistory<Sketch>>> = {
    space: useHistory<Sketch>(projectKey(projectId, 'sketch-space'), () => EMPTY_SKETCH, parseSketch),
    furniture: useHistory<Sketch>(projectKey(projectId, 'sketch-furniture'), () => EMPTY_SKETCH, parseSketch),
  }
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [sketchNotes, setSketchNotes] = useState<Record<DrawLayer, string>>({ space: '', furniture: '' })
  const [importInfo, setImportInfo] = useState<Omit<ImportResponse, 'assembly'> | null>(null)
  const [layer, setLayer] = useState<Layer>('furniture')
  const [spaceTool, setSpaceTool] = useState<SpaceTool>('walls')
  const tool: PlanTool = layer === 'furniture' ? 'cabinet' : layer === 'views' ? 'camera' : spaceTool
  // skica a inkoust patří jen prostoru a nábytku
  const drawLayer: DrawLayer = layer === 'space' ? 'space' : 'furniture'
  const [otherSel, setOtherSel] = useState<PlanSel>(null)
  const [ink, setInk] = useState<InkStroke[]>([])
  const [inkNote, setInkNote] = useState('')
  const inkKind: InkStroke['kind'] = layer === 'space' ? 'walls' : 'furniture'
  const toolInk = layer === 'views' ? [] : ink.filter((st) => st.kind === inkKind)
  const room = assembly.room
  const planSel: PlanSel = selectedId ? { kind: 'cabinet', id: selectedId } : otherSel
  const opening = otherSel?.kind === 'opening' ? room?.openings.find((o) => o.id === otherSel.id) : undefined
  const obstacle = otherSel?.kind === 'obstacle' ? room?.obstacles.find((o) => o.id === otherSel.id) : undefined
  const slope = otherSel?.kind === 'slope' ? room?.slopes.find((o) => o.id === otherSel.id) : undefined
  const stairs = otherSel?.kind === 'stairs' ? room?.stairs.find((o) => o.id === otherSel.id) : undefined

  const cab = assembly.cabinets.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (!command) return
    setMode(command.mode)
    if (command.layer && command.layer !== layer) {
      setLayer(command.layer)
      if (!visible[command.layer]) onVisible({ ...visible, [command.layer]: true })
      // členění potřebuje vybraný korpus – výběr nerušit
      if (command.mode !== 'elevation') selectPlan(null)
    }
    if (command.spaceTool) setSpaceTool(command.spaceTool)
  }, [command?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialog) onFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, dialog]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 2500)
    return () => clearTimeout(id)
  }, [message])

  useEffect(() => {
    if (!cab) setMode((m) => (m === 'elevation' ? 'plan' : m))
    setCellPath(null)
  }, [cab?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const otherLayer: DrawLayer = drawLayer === 'space' ? 'furniture' : 'space'
  const sketch = sketches[drawLayer]

  /** Převod skici aktivní vrstvy: prostor nahradí místnost, nábytek nahradí korpusy (umístí je do stávající místnosti). */
  const convert = async () => {
    setConverting(true)
    setConvertError(null)
    try {
      // nábytek dostane prostor jako šedý podklad, aby šlo poznat, u které stěny co stojí
      const image = await exportSketch(sketch.value, drawLayer === 'furniture' ? sketches.space.value : undefined)
      const note = [sketchNotes[drawLayer].trim(), pinsText(sketch.value.pins)].filter(Boolean).join('\n\n')
      const { assembly: imported, ...info } = await importSketch(drawLayer, image, note, assembly.room, assembly.brief)
      if (drawLayer === 'space') setAssembly((a) => ({ ...a, room: imported.room }))
      else setAssembly((a) => ({ ...a, cabinets: imported.cabinets }))
      selectPlan(drawLayer === 'space' ? { kind: 'room' } : null)
      setImportInfo(info)
      setMode('plan')
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(false)
    }
  }

  const updateCab = (id: string, fn: (c: Cabinet) => Cabinet) =>
    setAssembly((a) => ({ ...a, cabinets: a.cabinets.map((c) => (c.id === id ? fn(c) : c)) }))

  const patchCab = (patch: Partial<Cabinet>) => {
    if (!cab) return
    updateCab(cab.id, (c) => {
      const next = { ...c, ...patch }
      return { ...next, ...reanchor(next, footprint(c)) }
    })
  }

  const setInterior = (fn: (z: Zone) => Zone) => cab && updateCab(cab.id, (c) => ({ ...c, interior: fn(c.interior) }))

  const selectPlan = (sel: PlanSel) => {
    onSelect(sel?.kind === 'cabinet' ? sel.id : null)
    setOtherSel(sel?.kind === 'cabinet' ? null : sel)
    if (sel?.kind === 'camera') onView(sel.id)
  }

  /** Přepne aktivní vrstvu – ta je vždy viditelná, výběr z druhé vrstvy se zruší. */
  const switchLayer = (l: Layer) => {
    if (l === layer) return
    setLayer(l)
    if (!visible[l]) onVisible({ ...visible, [l]: true })
    selectPlan(null)
  }

  const camera = otherSel?.kind === 'camera' ? assembly.cameras.find((c) => c.id === otherSel.id) : undefined
  const patchCamera = (id: string, p: Partial<Camera>) =>
    setAssembly((a) => ({ ...a, cameras: a.cameras.map((c) => (c.id === id ? { ...c, ...p } : c)) }))

  /** Kamera z čáry: začátek = oko, konec = kam se dívá. */
  const handleCameraLine = (from: P2, to: P2) => {
    setDialog({
      title: 'Kamera',
      fields: [
        { key: 'eye', label: 'Výška oka', value: 1600 },
        { key: 'target', label: 'Výška cíle', value: 1100, min: 0 },
        { key: 'fov', label: 'Zorný úhel', value: 50 },
      ],
      onOk: (v) => {
        const id = newId('c')
        const r = (n: number) => Math.round(n / 10) * 10
        const c: Camera = {
          id,
          label: `Pohled ${assembly.cameras.length + 1}`,
          position: [r(from[0]), v.eye, r(from[1])],
          target: [r(to[0]), v.target, r(to[1])],
          fov: Math.max(10, Math.min(120, v.fov)),
        }
        setAssembly((a) => ({ ...a, cameras: [...a.cameras, c] }))
        selectPlan({ kind: 'camera', id })
        setDialog(null)
      },
    })
  }

  const setRoom = (fn: (r: Room) => Room | null) => setAssembly((a) => (a.room ? { ...a, room: fn(a.room) } : a))
  const patchOpening = (id: string, p: Partial<Opening>) =>
    setRoom((r) => ({ ...r, openings: r.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) }))
  const patchObstacle = (id: string, p: Partial<Obstacle>) =>
    setRoom((r) => ({ ...r, obstacles: r.obstacles.map((o) => (o.id === id ? { ...o, ...p } : o)) }))

  const patchSlope = (id: string, p: Partial<Slope>) =>
    setRoom((r) => ({ ...r, slopes: r.slopes.map((o) => (o.id === id ? { ...o, ...p } : o)) }))
  const patchStairs = (id: string, p: Partial<Stairs>) =>
    setRoom((r) => ({ ...r, stairs: r.stairs.map((o) => (o.id === id ? { ...o, ...p } : o)) }))

  /** Převod inkoustu v půdorysu: stěny nahradí místnost (nábytek zůstane), nábytek se přidá. */
  const convertInk = async (kind: InkStroke['kind']) => {
    setConverting(true)
    try {
      if (kind === 'walls') {
        const { room: newRoom, info } = await convertWalls(ink, assembly, inkNote)
        setAssembly((a) => ({ ...a, room: newRoom }))
        setImportInfo(info)
        selectPlan({ kind: 'room' })
      } else {
        const { cabinets, info } = await convertFurniture(ink, assembly, inkNote)
        setAssembly((a) => ({ ...a, cabinets: [...a.cabinets, ...cabinets] }))
        setImportInfo(info)
        selectPlan(cabinets.length === 1 ? { kind: 'cabinet', id: cabinets[0].id } : null)
      }
      setInk((all) => all.filter((st) => st.kind !== kind))
      setInkNote('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(false)
    }
  }

  /**
   * Dialog s výškou a délkami stěn. Uzavřená místnost: poslední dvě stěny se dopočítají, aby se obrys uzavřel.
   * Samostatná stěna / řada stěn: zadávají se všechny délky.
   */
  const openRoomDialog = ({ vertices: poly, closed }: { vertices: P2[]; closed: boolean }) => {
    const { angles, lengths } = edgesOf(poly, closed)
    const editable = closed ? lengths.slice(0, -2) : lengths
    setDialog({
      title: closed
        ? `Místnost – ${lengths.length} stěn (poslední dvě se dopočítají)`
        : lengths.length === 1
          ? 'Stěna'
          : `Stěny – ${lengths.length}`,
      fields: [
        { key: 'height', label: closed ? 'Výška stropu' : 'Výška stěny', value: room?.height ?? DEFAULT_ROOM_HEIGHT },
        ...editable.map((l, i) => ({ key: `w${i}`, label: editable.length === 1 ? 'Délka' : `Stěna ${i + 1}`, value: l })),
      ],
      onOk: (v) => {
        const newLengths = lengths.map((l, i) => v[`w${i}`] ?? l)
        const vertices = closed ? closePolygon(poly[0], angles, newLengths) : buildPolyline(poly[0], angles, newLengths)
        setAssembly((a) => ({
          ...a,
          room: {
            vertices,
            closed,
            height: v.height,
            wallThickness: a.room?.wallThickness ?? 150,
            // otvory a šikminy jsou vázané na pořadí stěn – při změně počtu stěn je nelze zachovat
            ...(a.room && a.room.vertices.length === vertices.length && a.room.closed === closed
              ? { openings: a.room.openings, slopes: a.room.slopes }
              : { openings: [], slopes: [] }),
            obstacles: a.room?.obstacles ?? [],
            stairs: a.room?.stairs ?? [],
          },
        }))
        selectPlan({ kind: 'room' })
        setDialog(null)
      },
    })
  }

  const handleOpeningAt = (kind: Opening['kind'], seg: WallSeg, along: number) => {
    if (!room) return setMessage('Nejdřív nakresli a převeď stěny.')
    const width = kind === 'window' ? 1200 : 800
    setDialog({
      title: kind === 'window' ? `Okno ve stěně ${seg.index + 1}` : `Dveře ve stěně ${seg.index + 1}`,
      fields: [
        { key: 'width', label: 'Šířka', value: width },
        { key: 'height', label: 'Výška', value: kind === 'window' ? 1400 : 1970 },
        ...(kind === 'window' ? [{ key: 'sill', label: 'Parapet', value: 900, min: 0 }] : []),
        { key: 'offset', label: 'Od rohu', value: Math.max(0, Math.round((along - width / 2) / 10) * 10), min: 0 },
      ],
      onOk: (v) => {
        const id = newId('o')
        const o: Opening = { id, kind, wall: seg.index, offset: v.offset, width: v.width, height: v.height, sill: v.sill ?? 0 }
        setRoom((r) => ({ ...r, openings: [...r.openings, o] }))
        selectPlan({ kind: 'opening', id })
        setDialog(null)
      },
    })
  }

  /** Šikmina u stěny – na jedné stěně nejvýš jedna, nová nahradí starou. */
  const handleSlopeAt = (seg: WallSeg) => {
    if (!room) return
    const existing = room.slopes.find((s) => s.wall === seg.index)
    setDialog({
      title: `Šikmina u stěny ${seg.index + 1}`,
      fields: [
        { key: 'knee', label: 'Nadezdívka', value: existing?.kneeHeight ?? 1200, min: 0 },
        { key: 'angle', label: 'Sklon °', value: 45 },
      ],
      onOk: (v) => {
        const id = existing?.id ?? newId('k')
        const sl: Slope = { id, wall: seg.index, kneeHeight: v.knee, depth: slopeDepthFor(v.knee, v.angle, room.height) }
        setRoom((r) => ({ ...r, slopes: [...r.slopes.filter((s) => s.wall !== seg.index), sl] }))
        selectPlan({ kind: 'slope', id })
        setDialog(null)
      },
    })
  }

  /** Schodiště z čáry ve směru stoupání: začátek čáry = spodní schod, čára = osa ramene. */
  const handleStairsLine = (from: P2, to: P2) => {
    if (!room) return setMessage('Nejdřív nakresli a převeď stěny.')
    const [dx, dz] = [to[0] - from[0], to[1] - from[1]]
    const len = Math.hypot(dx, dz)
    // přichytit směr na 45°, rotation jako u korpusu (lokální x = směr stoupání)
    const rotation = (Math.round((Math.atan2(-dz, dx) * 180) / Math.PI / 45) * 45 + 360) % 360
    setDialog({
      title: 'Schodiště',
      fields: [
        { key: 'length', label: 'Délka ramene', value: Math.round(len / 10) * 10 },
        { key: 'width', label: 'Šířka', value: 900 },
        { key: 'bottomStart', label: 'Podhled dole', value: 200, min: 0 },
        { key: 'bottomEnd', label: 'Podhled nahoře', value: Math.max(0, room.height - 300), min: 0 },
      ],
      onOk: (v) => {
        const id = newId('st')
        const a = (rotation * Math.PI) / 180
        const st: Stairs = {
          id,
          // začátek zůstane, kde začala čára
          x: Math.round(from[0] + (Math.cos(a) * v.length) / 2),
          z: Math.round(from[1] - (Math.sin(a) * v.length) / 2),
          length: v.length,
          width: v.width,
          rotation,
          bottomStart: v.bottomStart,
          bottomEnd: v.bottomEnd,
        }
        setRoom((r) => ({ ...r, stairs: [...r.stairs, st] }))
        selectPlan({ kind: 'stairs', id })
        setDialog(null)
      },
    })
  }

  const handleColumnRect = (f: Footprint) => {
    if (!room) return setMessage('Nejdřív nakresli a převeď stěny.')
    setDialog({
      title: 'Sloup / komín / stoupačka',
      fields: [
        { key: 'width', label: 'Šířka', value: f.maxX - f.minX },
        { key: 'depth', label: 'Hloubka', value: f.maxZ - f.minZ },
        { key: 'height', label: 'Výška', value: room.height },
      ],
      onOk: (v) => {
        const id = newId('s')
        const o: Obstacle = {
          id,
          label: '',
          x: (f.minX + f.maxX) / 2,
          z: (f.minZ + f.maxZ) / 2,
          width: v.width,
          depth: v.depth,
          height: v.height,
          rotation: 0,
        }
        setRoom((r) => ({ ...r, obstacles: [...r.obstacles, o] }))
        selectPlan({ kind: 'obstacle', id })
        setDialog(null)
      },
    })
  }

  const handleSplit = (cell: Cell, axis: 'x' | 'y', first: number) => {
    setDialog({
      title: axis === 'x' ? 'Příčka – šířka levého pole' : 'Police – výška spodního pole',
      fields: [{ key: 'first', label: axis === 'x' ? 'Šířka' : 'Výška', value: first }],
      onOk: (v) => {
        if (!cab) return
        const res = splitCell(cab.interior, cell.path, axis, v.first, cab.thickness)
        setInterior(() => res.root)
        setCellPath(null)
        setDialog(null)
      },
    })
  }

  // Cesta může po kroku zpět ukazovat mimo strom – pak nic nevybírat.
  const safeZone = (path: Path) => {
    try {
      return cab ? getZone(cab.interior, path) : null
    } catch {
      return null
    }
  }
  const leaf = cellPath ? safeZone(cellPath) : null
  const partSize = (() => {
    if (!cellPath?.length) return null
    const parent = safeZone(cellPath.slice(0, -1))
    return parent?.kind === 'split' ? (parent.parts[cellPath[cellPath.length - 1]]?.size ?? null) : null
  })()

  return (
    <ToolbarTarget.Provider value={focus ? toolTarget : null}>
      <div className="editor">
        {focus && <FloatingTools onBody={setToolTarget} />}
        <ToolbarSlot order={1}>
          <div className="tabs">
            <button
              className={mode === 'sketch' ? 'on' : ''}
              onClick={() => {
                setMode('sketch')
                if (layer === 'views') switchLayer('furniture')
              }}
            >
              Skica
            </button>
            <button className={mode === 'plan' ? 'on' : ''} onClick={() => setMode('plan')}>
              Půdorys
            </button>
            <button className={mode === 'elevation' ? 'on' : ''} disabled={!cab} onClick={() => setMode('elevation')}>
              Pohled{cab ? `: ${cab.label || cab.id}` : ''}
            </button>
            <span className="hint">
              {mode === 'sketch'
                ? 'Kresli volně · kóty piš perem k čarám, nebo ① Bod = ťukni a napiš'
                : mode === 'plan'
                  ? planHint(tool)
                  : 'Svislá čára = příčka · vodorovná = police · ťuknutí = pole'}
            </span>
            <button
              className="focus-toggle"
              onClick={() => onFocus(!focus)}
              title={focus ? 'Zpět na editor s 3D (Esc)' : 'Kreslicí plocha přes celé okno, menu v plovoucím panelu'}
            >
              {focus ? '✕ Zmenšit' : '⛶ Kreslit přes celé okno'}
            </button>
          </div>
        </ToolbarSlot>
        {mode !== 'elevation' && (
          <ToolbarSlot order={2}>
            <div className="layer-bar">
              {LAYERS.filter(([l]) => mode === 'plan' || l !== 'views').map(([l, label]) => {
                const strokes = ink.filter((st) => inkLayer(st.kind) === l).length
                return (
                  <div key={l} className={'layer' + (layer === l ? ' on' : '') + (visible[l] ? '' : ' hidden')}>
                    <button
                      className="eye"
                      disabled={layer === l}
                      title={layer === l ? 'Aktivní vrstva je vždy vidět' : visible[l] ? 'Skrýt vrstvu' : 'Zobrazit vrstvu'}
                      onClick={() => onVisible({ ...visible, [l]: !visible[l] })}
                    >
                      👁
                    </button>
                    <button className="name" onClick={() => switchLayer(l)}>
                      {label}
                      {mode === 'plan' && strokes > 0 && (
                        <span className="badge" title="Nepřevedené tahy">
                          {strokes}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
              {mode === 'plan' && layer === 'space' && (
                <div className="seg">
                  {SPACE_TOOLS.map(([t, label]) => (
                    <button key={t} className={spaceTool === t ? 'on' : ''} onClick={() => setSpaceTool(t)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ToolbarSlot>
        )}
        {mode === 'plan' && toolInk.length > 0 && (
          <ToolbarSlot order={3}>
            <div className="ink-bar">
              <input
                className="note"
                value={inkNote}
                placeholder={
                  inkKind === 'walls'
                    ? 'Poznámka k převodu (např. výška stropu 2650, zdi 300)…'
                    : 'Poznámka k převodu (např. všechny korpusy výška 2200)…'
                }
                onChange={(e) => setInkNote(e.target.value)}
              />
              <button onClick={() => setInk((all) => all.filter((_, k) => k !== all.lastIndexOf(toolInk[toolInk.length - 1])))}>↶</button>
              <button className="danger" onClick={() => setInk((all) => all.filter((st) => st.kind !== inkKind))}>
                Smazat inkoust
              </button>
              <button className="primary" disabled={converting} onClick={() => convertInk(inkKind)}>
                {converting ? 'Převádím…' : inkKind === 'walls' ? 'Převést stěny →' : 'Převést nábytek →'}
              </button>
            </div>
          </ToolbarSlot>
        )}

        {mode === 'sketch' ? (
          <SketchView
            sketch={sketch.value}
            setSketch={sketch.set}
            undo={sketch.undo}
            canUndo={sketch.canUndo}
            busy={converting}
            error={convertError}
            onConvert={convert}
            note={sketchNotes[drawLayer]}
            onNote={(n) => setSketchNotes((all) => ({ ...all, [drawLayer]: n }))}
            layer={drawLayer}
            underlay={visible[otherLayer] ? sketches[otherLayer].value : null}
          />
        ) : (
          <div className="canvas-wrap">
            {mode === 'plan' || !cab ? (
              <PlanView
                assembly={assembly}
                tool={tool}
                layer={layer}
                visible={visible}
                selected={planSel}
                onSelect={selectPlan}
                ink={ink}
                onInk={(st) => setInk((all) => [...all, st])}
                onOpeningAt={handleOpeningAt}
                onColumnRect={handleColumnRect}
                onSlopeAt={handleSlopeAt}
                onStairsLine={handleStairsLine}
                onCameraLine={handleCameraLine}
                onMessage={setMessage}
              />
            ) : (
              <ElevationView
                cab={cab}
                ceiling={cabinetCeiling(cab, room)}
                selectedPath={cellPath}
                onSelectCell={setCellPath}
                onSplit={handleSplit}
                onMessage={setMessage}
              />
            )}
            {message && <div className="toast">{message}</div>}
            {importInfo && (
              <div className="import-info">
                <button className="close" onClick={() => setImportInfo(null)} aria-label="Zavřít">
                  ×
                </button>
                <strong>Výsledek převodu</strong>
                {importInfo.notes && <p>{importInfo.notes}</p>}
                {importInfo.uncertain.length > 0 && (
                  <>
                    <em>Zkontroluj:</em>
                    <ul>
                      {importInfo.uncertain.map((u, i) => (
                        <li key={i}>
                          <b>{u.cabinet}</b>: {u.what}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'plan' && cab && (
          <CabinetInspector
            cab={cab}
            defaults={assembly.materials}
            ceiling={ceilingStatus(cab, room)}
            onChange={patchCab}
            onDelete={() => {
              setAssembly((a) => ({ ...a, cabinets: a.cabinets.filter((c) => c.id !== cab.id) }))
              onSelect(null)
            }}
            onOpenElevation={() => setMode('elevation')}
          />
        )}
        {mode === 'plan' && room && otherSel?.kind === 'room' && (
          <RoomInspector
            room={room}
            onChange={(p) => setRoom((r) => ({ ...r, ...p }))}
            onEditWalls={() => openRoomDialog(room)}
            onFlip={() => setRoom(flipWalls)}
            onDelete={() => {
              setRoom(() => null)
              selectPlan(null)
            }}
          />
        )}
        {mode === 'plan' && opening && (
          <OpeningInspector
            opening={opening}
            onChange={(p) => patchOpening(opening.id, p)}
            onDelete={() => {
              setRoom((r) => ({ ...r, openings: r.openings.filter((o) => o.id !== opening.id) }))
              selectPlan(null)
            }}
          />
        )}
        {mode === 'plan' && obstacle && (
          <ObstacleInspector
            obstacle={obstacle}
            onChange={(p) => patchObstacle(obstacle.id, p)}
            onDelete={() => {
              setRoom((r) => ({ ...r, obstacles: r.obstacles.filter((o) => o.id !== obstacle.id) }))
              selectPlan(null)
            }}
          />
        )}
        {mode === 'plan' && room && slope && (
          <SlopeInspector
            slope={slope}
            roomHeight={room.height}
            onChange={(p) => patchSlope(slope.id, p)}
            onDelete={() => {
              setRoom((r) => ({ ...r, slopes: r.slopes.filter((o) => o.id !== slope.id) }))
              selectPlan(null)
            }}
          />
        )}
        {mode === 'plan' && layer === 'furniture' && !cab && (
          <div className="inspector">
            <strong className="inspector-title">Materiály projektu</strong>
            <MaterialPicker
              label="Korpusy"
              value={assembly.materials.carcass}
              onChange={(id) => id && setAssembly((a) => ({ ...a, materials: { ...a.materials, carcass: id } }))}
            />
            <MaterialPicker
              label="Fronty"
              value={assembly.materials.fronts}
              onChange={(id) => id && setAssembly((a) => ({ ...a, materials: { ...a.materials, fronts: id } }))}
            />
          </div>
        )}
        {mode === 'plan' && camera && (
          <CameraInspector
            camera={camera}
            onChange={(p) => patchCamera(camera.id, p)}
            onDelete={() => {
              setAssembly((a) => ({ ...a, cameras: a.cameras.filter((c) => c.id !== camera.id) }))
              selectPlan(null)
              onView(null)
            }}
          />
        )}
        {mode === 'plan' && stairs && (
          <StairsInspector
            stairs={stairs}
            onChange={(p) => patchStairs(stairs.id, p)}
            onDelete={() => {
              setRoom((r) => ({ ...r, stairs: r.stairs.filter((o) => o.id !== stairs.id) }))
              selectPlan(null)
            }}
          />
        )}
        {mode === 'elevation' && cab && cellPath && leaf?.kind === 'leaf' && (
          <CellInspector
            leaf={leaf}
            size={partSize}
            inSplit={cellPath.length > 0}
            onChange={(z) => setInterior((root) => updateZone(root, cellPath, () => z))}
            onSize={(s) => setInterior((root) => setPartSize(root, cellPath, s))}
            onMerge={() => {
              setInterior((root) => mergeWithNeighbour(root, cellPath, cab.thickness))
              setCellPath(null)
            }}
          />
        )}

        {dialog && <DimensionDialog title={dialog.title} fields={dialog.fields} onOk={dialog.onOk} onCancel={() => setDialog(null)} />}
      </div>
    </ToolbarTarget.Provider>
  )
}
