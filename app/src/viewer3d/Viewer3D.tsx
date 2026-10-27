import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { Edges, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import type { Assembly, Cabinet, Camera } from '../model/schema'
import { cabinetParts, type Part, type PartRole } from '../model/geometry'
import { cabinetCut } from '../model/ceiling'
import { footprint } from '../model/placement'
import { RoomMesh } from './RoomMesh'
import type { LayerVisibility } from '../model/planInk'
import { material, type Material } from '../materials/library'
import { grainTexture } from './grain'
import { RenderQuality, useRenderQuality } from './quality'
import type { Shot } from '../render/VisualizeDialog'
import { pointOnWall, wallSegments } from '../model/room'

// Scéna pracuje v metrech, model v mm.
const MM = 0.001

const ROD = material('kov-nerez')

/** Který materiál nese díl: fronty, tyč, ostatní = korpus. */
function partMaterial(role: PartRole, carcass: Material, fronts: Material): Material {
  if (role === 'door' || role === 'drawer') return fronts
  if (role === 'rod') return ROD
  return carcass
}

/** Seříznutý díl: konvexní obal bodů, UV promítnuté podle převažujícího směru normály (kvůli kresbě dřeva). */
function hullGeometry(part: Part): THREE.BufferGeometry {
  const g = new ConvexGeometry(part.points!.map(([x, y, z]) => new THREE.Vector3(x * MM, y * MM, z * MM)))
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const [w, h, d] = part.size.map((v) => v * MM)
  const [x0, y0, z0] = part.center.map((v, k) => v * MM - [w, h, d][k] / 2)
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))]
    const [px, py, pz] = [(pos.getX(i) - x0) / (w || 1), (pos.getY(i) - y0) / (h || 1), (pos.getZ(i) - z0) / (d || 1)]
    const [u, v] = nx >= ny && nx >= nz ? [pz, py] : ny >= nz ? [px, pz] : [px, py]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

function PartMesh({ part, mat, frontsOpacity, selected }: { part: Part; mat: Material; frontsOpacity: number; selected: boolean }) {
  const hull = useMemo(() => (part.shape === 'hull' ? hullGeometry(part) : null), [part])
  const [w, h, d] = part.size.map((v) => v * MM)
  const isFront = part.role === 'door' || part.role === 'drawer'
  const opacity = isFront ? frontsOpacity : 1
  const map = grainTexture(mat)
  const render = useRenderQuality()
  return (
    <mesh
      castShadow
      receiveShadow
      // seříznutý díl má body v souřadnicích korpusu, ostatní se posouvají na střed
      position={hull ? [0, 0, 0] : (part.center.map((v) => v * MM) as [number, number, number])}
      rotation={part.shape === 'cylinder' ? [0, 0, Math.PI / 2] : [0, 0, 0]}
      geometry={hull ?? undefined}
    >
      {part.shape === 'box' && <boxGeometry args={[w, h, d]} />}
      {part.shape === 'cylinder' && <cylinderGeometry args={[h / 2, h / 2, w, 16]} />}
      <meshStandardMaterial
        // s texturou nese barvu textura, jinak barva materiálu
        color={map ? '#ffffff' : mat.color}
        map={map}
        roughness={mat.roughness}
        metalness={mat.metalness ?? 0}
        // výběr ukazují jen oranžové hrany, aby barva materiálu zůstala čitelná
        transparent={opacity < 1}
        opacity={opacity}
      />
      {part.shape !== 'cylinder' && opacity > 0.05 && (!render || selected) && <Edges color={selected ? '#d4572a' : '#3a3a3a'} />}
    </mesh>
  )
}

function CabinetMesh({
  cab,
  room,
  defaults,
  frontsOpacity,
  selected,
}: {
  cab: Cabinet
  room: Assembly['room']
  defaults: Assembly['materials']
  frontsOpacity: number
  selected: boolean
}) {
  const parts = useMemo(() => cabinetParts(cab, cabinetCut(cab, room)), [cab, room])
  const carcass = material(cab.carcassMaterial ?? defaults.carcass)
  const fronts = material(cab.frontsMaterial ?? defaults.fronts)
  return (
    <group position={[cab.x * MM, cab.elevation * MM, cab.z * MM]} rotation={[0, (cab.rotation * Math.PI) / 180, 0]}>
      {parts.map((p, i) => (
        <PartMesh key={i} part={p} mat={partMaterial(p.role, carcass, fronts)} frontsOpacity={frontsOpacity} selected={selected} />
      ))}
    </group>
  )
}

/** Střed místnosti nebo sestavy v metrech – kam míří kamera. */
function sceneCenter(a: Assembly): { center: [number, number, number]; size: number } {
  const pts = [
    ...(a.room?.vertices ?? []),
    ...a.cabinets.flatMap((c) => {
      const f = footprint(c)
      return [
        [f.minX, f.minZ],
        [f.maxX, f.maxZ],
      ] as [number, number][]
    }),
  ]
  if (!pts.length) return { center: [1.5, 0.9, 1], size: 3 }
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return {
    center: [((Math.min(...xs) + Math.max(...xs)) / 2) * MM, 0.9, ((Math.min(...zs) + Math.max(...zs)) / 2) * MM],
    size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 2000) * MM,
  }
}

/** Nastaví kameru na celou scénu – jen při změně projektu nebo obrysu místnosti, ne při každé úpravě. */
function CameraRig({ center, size, viewKey }: { center: [number, number, number]; size: number; viewKey: string }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    camera.position.set(center[0] + size * 0.6, size * 0.9, center[2] + size * 1.3)
    controls?.target.set(...center)
    controls?.update()
  }, [viewKey, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const FREE_FOV = 45

/** Slunce: dovnitř prvním oknem (stíny od okna), jinak šikmo zepředu. Pozice v metrech. */
function sunPosition(a: Assembly, center: [number, number, number]): [number, number, number] {
  const r = a.room
  const win = r?.openings.find((o) => o.kind === 'window')
  const seg = r && win ? wallSegments(r)[win.wall] : undefined
  if (r && win && seg) {
    const [x, z] = pointOnWall(seg, win.offset + win.width / 2, -4000) // 4 m před oknem venku
    return [x * MM, (win.sill + win.height + 1500) * MM, z * MM]
  }
  return [center[0] + 2.5, 4, center[2] + 3.5]
}

/** Osvětlení kvalitního renderu: měkké světlo prostředí (lokální, bez stahování), slunce se stíny, okolní zastínění. */
function RenderLighting({ assembly, center, size }: { assembly: Assembly; center: [number, number, number]; size: number }) {
  const sun = sunPosition(assembly, center)
  const s = size * 0.8
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight
        position={sun}
        intensity={2.2}
        color="#fff4e5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-s}
        shadow-camera-right={s}
        shadow-camera-top={s}
        shadow-camera-bottom={-s}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      >
        <object3D attach="target" position={center} />
      </directionalLight>
      <Environment resolution={256} frames={1}>
        {/* strop jako velký měkký zdroj + slabší boční světlo */}
        <Lightformer form="rect" intensity={1.2} position={[center[0], 6, center[2]]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[center[0] - 8, 2, center[2]]} rotation-y={Math.PI / 2} scale={[12, 4, 1]} />
        <Lightformer
          form="rect"
          intensity={0.4}
          position={[center[0], 2, center[2] + 8]}
          rotation-y={Math.PI}
          scale={[12, 4, 1]}
          color="#ffe9d0"
        />
      </Environment>
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.35} distanceFalloff={0.6} intensity={2.2} />
      </EffectComposer>
    </>
  )
}

/** Přepne kameru na „očičko“; volný pohled vrátí jen zorný úhel (poloha zůstane, kde uživatel skončil). */
function ViewRig({ view }: { view: Camera | null }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const key = view ? [...view.position, ...view.target, view.fov].join(',') : ''
  useEffect(() => {
    if (view) {
      camera.position.set(...(view.position.map((v) => v * MM) as [number, number, number]))
      controls?.target.set(...(view.target.map((v) => v * MM) as [number, number, number]))
    }
    camera.fov = view?.fov ?? FREE_FOV
    camera.updateProjectionMatrix()
    controls?.update()
  }, [key, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export function Viewer3D({
  assembly,
  frontsOpacity = 1,
  selectedId = null,
  visible = { space: true, furniture: true, views: true },
  viewId = null,
  onView,
  onVisualize,
}: {
  assembly: Assembly
  frontsOpacity?: number
  selectedId?: string | null
  visible?: LayerVisibility
  viewId?: string | null
  onView?: (id: string | null) => void
  onVisualize?: (shot: Shot) => void // jen když je AI průchod zapnutý (klíč na serveru)
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [render, setRender] = useState(false)
  const view = assembly.cameras.find((c) => c.id === viewId) ?? null
  // kamera se řídí celou scénou, aby při skrytí vrstvy neskočila
  const { center, size } = sceneCenter(assembly)
  const viewKey = `${assembly.name}|${assembly.room?.vertices.flat().join(',') ?? ''}`
  /** Uloží aktuální pohled jako PNG (podklad pro klienta / pro AI vizualizaci). */
  const snapshot = () => {
    const canvas = wrap.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${assembly.name} – ${view?.label || '3D'}.png`.replace(/[\\/:*?"<>|]+/g, '')
    a.click()
  }

  return (
    <div className="viewer-wrap" ref={wrap}>
      <Canvas camera={{ fov: FREE_FOV }} shadows="soft" dpr={render ? 2 : [1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <RenderQuality.Provider value={render}>
          <ViewRig view={view} />
          <CameraRig center={center} size={size} viewKey={viewKey} />
          <color attach="background" args={[render ? '#ffffff' : '#f4f2ee']} />
          {render ? (
            <RenderLighting assembly={assembly} center={center} size={size} />
          ) : (
            <>
              <ambientLight intensity={0.6} />
              <directionalLight position={[3, 5, 4]} intensity={1.2} />
              <Grid args={[10, 10]} cellSize={0.1} sectionSize={1} position={[0, -0.01, 0]} infiniteGrid fadeDistance={15} />
            </>
          )}
          {visible.space && assembly.room && <RoomMesh room={assembly.room} />}
          {visible.furniture &&
            assembly.cabinets.map((c) => (
              <CabinetMesh
                key={c.id}
                cab={c}
                room={assembly.room}
                defaults={assembly.materials}
                frontsOpacity={frontsOpacity}
                selected={c.id === selectedId}
              />
            ))}
          <OrbitControls makeDefault />
        </RenderQuality.Provider>
      </Canvas>
      <div className="view-bar">
        <button className={view ? '' : 'on'} onClick={() => onView?.(null)}>
          Volně
        </button>
        {assembly.cameras.map((c) => (
          <button key={c.id} className={c.id === viewId ? 'on' : ''} onClick={() => onView?.(c.id)}>
            👁 {c.label || c.id}
          </button>
        ))}
        <button
          className={render ? 'on' : ''}
          onClick={() => setRender((r) => !r)}
          title="Kvalitní render: stíny, světlo, bez pomocných čar"
        >
          🎨 Render
        </button>
        {onVisualize && (
          <button
            onClick={() => {
              const canvas = wrap.current?.querySelector('canvas')
              if (canvas)
                onVisualize({
                  dataUrl: canvas.toDataURL('image/png'),
                  width: canvas.width,
                  height: canvas.height,
                  cameraId: viewId,
                  isRender: render,
                })
            }}
            title="Fotorealistická vizualizace přes AI (placené, cena se ukáže předem)"
          >
            ✨ AI
          </button>
        )}
        <button onClick={snapshot} title="Uložit aktuální pohled jako obrázek">
          📸
        </button>
      </div>
    </div>
  )
}
