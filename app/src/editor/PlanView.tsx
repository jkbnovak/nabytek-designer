import type { Assembly, Obstacle, Opening } from '../model/schema'
import { footprint, footprintCorners, snap, toWorld, type Footprint } from '../model/placement'
import {
  nearestWall,
  pointInPolygon,
  pointOnWall,
  wallCoords,
  wallMiters,
  wallQuad,
  wallSegments,
  type P2,
  type WallSeg,
} from '../model/room'
import { StrokeCanvas, inkSize, outlinePath } from './StrokeCanvas'
import { slopeAngle, slopeQuad, stairsCorners } from '../model/slopes'
import { ceilingStatus } from '../model/ceiling'
import { inkLayer, type InkStroke, type Layer, type LayerVisibility } from '../model/planInk'
import { isClosedStroke, recognize, type Pt } from './recognize'

export type PlanTool = 'cabinet' | 'walls' | 'window' | 'door' | 'column' | 'slope' | 'stairs' | 'camera'
export type PlanSel =
  | { kind: 'cabinet'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'obstacle'; id: string }
  | { kind: 'slope'; id: string }
  | { kind: 'stairs'; id: string }
  | { kind: 'camera'; id: string }
  | { kind: 'room' }
  | null

interface Props {
  assembly: Assembly
  tool: PlanTool
  layer: Layer
  visible: LayerVisibility
  selected: PlanSel
  onSelect: (sel: PlanSel) => void
  ink: InkStroke[]
  onInk: (stroke: InkStroke) => void
  onOpeningAt: (kind: Opening['kind'], seg: WallSeg, along: number) => void
  onColumnRect: (f: Footprint) => void
  onSlopeAt: (seg: WallSeg) => void
  onStairsLine: (from: P2, to: P2) => void
  onCameraLine: (from: P2, to: P2) => void
  onMessage: (msg: string) => void
}

const MIN_ROOM = { x: 3000, z: 2500 }
const MARGIN = 500

export const obstacleCorners = (o: Obstacle): P2[] =>
  [
    [-o.width / 2, -o.depth / 2],
    [o.width / 2, -o.depth / 2],
    [o.width / 2, o.depth / 2],
    [-o.width / 2, o.depth / 2],
  ].map(([lx, lz]) => toWorld({ x: o.x, z: o.z, rotation: o.rotation }, lx, lz))

const HINTS: Record<PlanTool, string> = {
  cabinet: 'Kresli korpusy i s rozměry, pak Převést nábytek · ťuknutí = výběr',
  walls: 'Kresli stěny i s délkami, pak Převést stěny · ťuknutí na stěny = vlastnosti',
  window: 'Ťukni na stěnu, kam přijde okno',
  door: 'Ťukni na stěnu, kam přijdou dveře',
  column: 'Obdélník = sloup / komín / stoupačka',
  slope: 'Ťukni na stěnu, pod kterou je šikmina (krov)',
  stairs: 'Čára ve směru stoupání (od spodního schodu nahoru) = schodiště',
  camera: 'Čára od oka ve směru pohledu = kamera · ťuknutí na očičko = výběr',
}
export const planHint = (tool: PlanTool) => HINTS[tool]

/** Půdorys: x doprava, z dolů (od zadní stěny do místnosti). */
export function PlanView({
  assembly,
  tool,
  layer,
  visible,
  selected,
  onSelect,
  ink,
  onInk,
  onOpeningAt,
  onColumnRect,
  onSlopeAt,
  onStairsLine,
  onCameraLine,
  onMessage,
}: Props) {
  const { room } = assembly
  const segs = room ? wallSegments(room) : []
  // visící korpusy se kreslí až po stojících (jsou nad nimi)
  const prints = assembly.cabinets.map((c) => ({ cab: c, f: footprint(c) })).sort((a, b) => a.cab.elevation - b.cab.elevation)
  const t = room?.wallThickness ?? 0
  const miters = room ? wallMiters(segs, room.closed, t) : []
  const inkPts = ink.flatMap((s) => s.points)
  const xs = [
    0,
    MIN_ROOM.x,
    ...prints.flatMap((p) => [p.f.minX, p.f.maxX]),
    ...(room?.vertices.map((v) => v[0]) ?? []),
    ...inkPts.map((p) => p[0]),
  ]
  const zs = [
    0,
    MIN_ROOM.z,
    ...prints.flatMap((p) => [p.f.minZ, p.f.maxZ]),
    ...(room?.vertices.map((v) => v[1]) ?? []),
    ...inkPts.map((p) => p[1]),
  ]
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - t, Math.max(...xs) + t, Math.min(...zs) - t, Math.max(...zs) + t]
  const viewBox: [number, number, number, number] = [minX - MARGIN, minZ - MARGIN, maxX - minX + 2 * MARGIN, maxZ - minZ + 2 * MARGIN]
  const font = viewBox[2] / 45
  const tol = viewBox[2] / 40
  const shown = (l: Layer) => visible[l] || l === layer
  const layerOpacity = (l: Layer) => (l === layer ? 1 : 0.35)
  const isSel = (kind: string, id?: string) => !!selected && selected.kind === kind && (!id || ('id' in selected && selected.id === id))

  const handleStroke = (pts: Pt[]) => {
    // stěny a nábytek se kreslí inkoustem a převádějí najednou tlačítkem
    if (tool === 'walls' || tool === 'cabinet')
      return onInk({
        kind: tool === 'walls' ? 'walls' : 'furniture',
        points: pts,
        viewWidth: viewBox[2],
      })
    if (tool === 'camera') {
      const [from, to] = [pts[0], pts[pts.length - 1]]
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) < tol) return onMessage('Kamera: táhni od oka ve směru pohledu.')
      return onCameraLine(from, to)
    }
    if (tool === 'stairs') {
      const [from, to] = [pts[0], pts[pts.length - 1]]
      if (Math.hypot(to[0] - from[0], to[1] - from[1]) < tol * 2) return onMessage('Schodiště: nakresli delší čáru ve směru stoupání.')
      return onStairsLine(from, to)
    }
    if (tool !== 'column') return onMessage('Ťukni na stěnu.')
    // pootočený obdélník (u šikmé stěny) neprojde rozpoznáním obdélníku – stačí uzavřený tah
    if (recognize(pts).kind !== 'rect' && !isClosedStroke(pts)) return onMessage('Tah nerozpoznán – nakresli obdélník.')
    const [bx, bz] = [pts.map((p) => p[0]), pts.map((p) => p[1])]
    const sx = [0, ...prints.flatMap((p) => [p.f.minX, p.f.maxX])]
    const sz = [0, ...prints.flatMap((p) => [p.f.minZ, p.f.maxZ])]
    const f = {
      minX: snap(Math.min(...bx), sx, tol),
      maxX: snap(Math.max(...bx), sx, tol),
      minZ: snap(Math.min(...bz), sz, tol),
      maxZ: snap(Math.max(...bz), sz, tol),
    }
    onColumnRect(f)
  }

  const handleTap = (p: Pt) => {
    if ((tool === 'window' || tool === 'door' || tool === 'slope') && room) {
      const hit = nearestWall(room, p)
      if (!hit || hit.distance >= tol + t) return onMessage('Ťukni přímo na stěnu.')
      return tool === 'slope' ? onSlopeAt(hit.seg) : onOpeningAt(tool, hit.seg, hit.along)
    }
    // pod sebou může být víc korpusů (visící nad stojícím) – opakované ťuknutí přepne na další
    const hits = prints.filter(({ cab }) => pointInPolygon(p, footprintCorners(cab))).reverse()
    const cab = hits[0]
    if (layer === 'views') {
      const cam = assembly.cameras.find((c) => Math.hypot(c.position[0] - p[0], c.position[2] - p[1]) < tol * 1.5)
      return onSelect(cam ? { kind: 'camera', id: cam.id } : null)
    }
    if (layer === 'furniture') {
      if (!cab) return onSelect(null)
      const cur = hits.findIndex((h) => isSel('cabinet', h.cab.id))
      return onSelect({ kind: 'cabinet', id: hits[(cur + 1) % hits.length].cab.id })
    }
    if (room) {
      for (const o of room.openings) {
        const seg = segs[o.wall]
        if (!seg) continue
        const { along, dist } = wallCoords(seg, p)
        if (dist > -t - tol && dist < tol && along >= o.offset && along <= o.offset + o.width)
          return onSelect({ kind: 'opening', id: o.id })
      }
      const ob = room.obstacles.find((o) => pointInPolygon(p, obstacleCorners(o)))
      if (ob) return onSelect({ kind: 'obstacle', id: ob.id })
      const st = room.stairs.find((s) => pointInPolygon(p, stairsCorners(s)))
      if (st) return onSelect({ kind: 'stairs', id: st.id })
      const sl = room.slopes.find((s) => segs[s.wall] && pointInPolygon(p, slopeQuad(segs[s.wall], s)))
      if (sl) return onSelect({ kind: 'slope', id: sl.id })
    }
    if (room && (room.closed ? pointInPolygon(p, room.vertices) : (nearestWall(room, p)?.distance ?? Infinity) < tol + t))
      return onSelect({ kind: 'room' })
    if (cab && visible.furniture) onMessage('Korpus patří do vrstvy Nábytek.')
    onSelect(null)
  }

  const poly = (pts: P2[]) => pts.map((p) => p.join(',')).join(' ')

  return (
    <StrokeCanvas viewBox={viewBox} onStroke={handleStroke} onTap={handleTap}>
      <defs>
        <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
          <path d="M100 0H0V100" fill="none" stroke="#e2ded6" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="context-stroke" />
        </marker>
        <pattern id="hatch" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V60" stroke="#888" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      <rect x={viewBox[0]} y={viewBox[1]} width={viewBox[2]} height={viewBox[3]} fill="url(#grid)" />

      {shown('space') && (
        <g opacity={layerOpacity('space')}>
          {room ? (
            <g>
              {room.closed && <polygon points={poly(room.vertices)} fill={isSel('room') ? '#fbeee6' : '#faf8f4'} />}
              {segs.map((seg) => (
                <polygon
                  key={seg.index}
                  points={poly(wallQuad(seg, t, miters[seg.index]))}
                  fill={isSel('room') ? '#a0573a' : '#6b6b6b'}
                  stroke={isSel('room') ? '#a0573a' : '#6b6b6b'}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {room.openings.map((o) => {
                const seg = segs[o.wall]
                if (!seg) return null
                const [a, b] = [o.offset, o.offset + o.width]
                const gap = [pointOnWall(seg, a, 2), pointOnWall(seg, b, 2), pointOnWall(seg, b, -t - 2), pointOnWall(seg, a, -t - 2)]
                const sel = isSel('opening', o.id)
                const color = sel ? '#d4572a' : '#333'
                return (
                  <g key={o.id}>
                    <polygon points={poly(gap)} fill="#fff" />
                    {o.kind === 'window' ? (
                      <>
                        <polyline
                          points={poly([pointOnWall(seg, a, -t * 0.4), pointOnWall(seg, b, -t * 0.4)])}
                          stroke={color}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                        <polyline
                          points={poly([pointOnWall(seg, a, -t * 0.6), pointOnWall(seg, b, -t * 0.6)])}
                          stroke={color}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    ) : (
                      <path
                        d={`M${pointOnWall(seg, a, 0)}L${pointOnWall(seg, a, o.width)}A${o.width} ${o.width} 0 0 ${seg.n[0] * seg.u[1] - seg.n[1] * seg.u[0] > 0 ? 1 : 0} ${pointOnWall(seg, b, 0)}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </g>
                )
              })}
              {segs.map((seg) => {
                const [x, z] = pointOnWall(seg, seg.length / 2, -t - font * 0.9) // vně místnosti, aby kótu nezakryl nábytek
                const angle = (Math.atan2(seg.u[1], seg.u[0]) * 180) / Math.PI
                const upright = angle > 90 || angle < -90 ? angle + 180 : angle
                return (
                  <text
                    key={'l' + seg.index}
                    x={x}
                    y={z}
                    fontSize={font * 0.75}
                    fill="#2a5db0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${upright} ${x} ${z})`}
                  >
                    {Math.round(seg.length)}
                  </text>
                )
              })}
              {room.slopes.map((s) => {
                const seg = segs[s.wall]
                if (!seg) return null
                const q = slopeQuad(seg, s)
                const sel = isSel('slope', s.id)
                const [lx, lz] = pointOnWall(seg, seg.length / 2, s.depth / 2)
                return (
                  <g key={s.id}>
                    <polygon points={poly(q)} fill={sel ? '#f6d9c8' : '#ece6f4'} opacity={0.8} />
                    <polyline
                      points={poly([q[2], q[3]])}
                      stroke={sel ? '#d4572a' : '#6a5a8a'}
                      strokeWidth={2}
                      strokeDasharray="10 6"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text x={lx} y={lz} fontSize={font * 0.7} fill="#6a5a8a" textAnchor="middle" dominantBaseline="middle">
                      šikmina {s.kneeHeight} · {Math.round(slopeAngle(s, room.height))}°
                    </text>
                  </g>
                )
              })}
              {room.stairs.map((st) => {
                const c = stairsCorners(st)
                const sel = isSel('stairs', st.id)
                const color = sel ? '#d4572a' : '#7a5c30'
                const n = Math.max(2, Math.round(Math.abs(st.bottomEnd - st.bottomStart) / 180))
                const lerp = (p: P2, q: P2, k: number): P2 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
                const [start, end] = [lerp(c[0], c[3], 0.5), lerp(c[1], c[2], 0.5)]
                const [mx, mz] = lerp(start, end, 0.5)
                const angle = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI
                const upright = angle > 90 || angle < -90 ? angle + 180 : angle
                return (
                  <g key={st.id}>
                    <polygon points={poly(c)} fill="#f3ead9" stroke={color} strokeWidth={sel ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
                    {Array.from({ length: n - 1 }, (_, i) => (
                      <polyline
                        key={i}
                        points={poly([lerp(c[0], c[1], (i + 1) / n), lerp(c[3], c[2], (i + 1) / n)])}
                        stroke={color}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    <polyline
                      points={poly([start, end])}
                      stroke={color}
                      strokeWidth={2}
                      markerEnd="url(#arrow)"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx={start[0]} cy={start[1]} r={font * 0.25} fill={color} />
                    <text
                      x={mx}
                      y={mz}
                      fontSize={font * 0.6}
                      fill={color}
                      textAnchor="middle"
                      dy={-font * 0.4}
                      transform={`rotate(${upright} ${mx} ${mz})`}
                    >
                      podhled {st.bottomStart}→{st.bottomEnd}
                    </text>
                  </g>
                )
              })}
              {room.obstacles.map((o) => (
                <polygon
                  key={o.id}
                  points={poly(obstacleCorners(o))}
                  fill="url(#hatch)"
                  stroke={isSel('obstacle', o.id) ? '#d4572a' : '#555'}
                  strokeWidth={isSel('obstacle', o.id) ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : (
            // bez místnosti: výchozí zadní (z = 0) a levá (x = 0) stěna
            <path
              d={`M0 ${maxZ + MARGIN / 2}V0H${maxX + MARGIN / 2}`}
              fill="none"
              stroke="#555"
              strokeWidth={6}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      )}

      {shown('furniture') && (
        <g opacity={layerOpacity('furniture')}>
          {prints.map(({ cab, f }) => {
            const pts = footprintCorners(cab)
            const front = [toWorld(cab, 0, cab.depth), toWorld(cab, cab.width, cab.depth)]
            const sel = isSel('cabinet', cab.id)
            const hung = cab.elevation > 0
            const ceiling = ceilingStatus(cab, room)
            const conflict = ceiling === 'conflict'
            const mark = conflict ? ' ⚠' : ceiling === 'cut' ? ' ◢' : ''
            // visící: čárkovaně, poloprůhledně a popisek u zadní hrany, aby nepřekryl korpus pod ním
            const [cx, cz] = toWorld(cab, cab.width / 2, cab.depth * (hung ? 0.25 : 0.5))
            return (
              <g key={cab.id}>
                <polygon
                  points={poly(pts)}
                  fill={sel ? '#f6d9c8' : '#ebe3d3'}
                  fillOpacity={hung ? 0.6 : 1}
                  stroke={conflict ? '#c62828' : sel ? '#d4572a' : '#333'}
                  strokeWidth={sel || conflict ? 3 : 1.5}
                  strokeDasharray={hung ? '8 5' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {!hung && (
                  <line
                    x1={front[0][0]}
                    y1={front[0][1]}
                    x2={front[1][0]}
                    y2={front[1][1]}
                    stroke="#333"
                    strokeWidth={4}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {hung ? (
                  <text
                    x={cx}
                    y={cz}
                    fontSize={Math.min(font * 0.8, (f.maxX - f.minX) / 8)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#444"
                  >
                    {cab.label || cab.id} · {cab.width}×{cab.depth}, v {cab.height}, od {cab.elevation}
                    {mark}
                  </text>
                ) : (
                  <text x={cx} y={cz} fontSize={Math.min(font, (f.maxX - f.minX) / 6)} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} dy={-font * 0.6}>
                      {cab.label || cab.id}
                      {mark && <tspan fill={conflict ? '#c62828' : '#6a5a8a'}>{mark}</tspan>}
                    </tspan>
                    <tspan x={cx} dy={font * 1.2} fontSize={font * 0.8} fill="#666">
                      {cab.width}×{cab.depth}, v {cab.height}
                    </tspan>
                  </text>
                )}
              </g>
            )
          })}
        </g>
      )}
      {shown('views') && (
        <g opacity={layerOpacity('views')}>
          {assembly.cameras.map((c) => {
            const sel = isSel('camera', c.id)
            const eye: P2 = [c.position[0], c.position[2]]
            const dir = Math.atan2(c.target[2] - eye[1], c.target[0] - eye[0])
            const reach = Math.max(font * 3, Math.hypot(c.target[0] - eye[0], c.target[2] - eye[1]))
            // vodorovný zorný úhel pro poměr stran 3:2
            const half = Math.atan(Math.tan(((c.fov / 2) * Math.PI) / 180) * 1.5)
            const ray = (a: number): P2 => [eye[0] + Math.cos(a) * reach, eye[1] + Math.sin(a) * reach]
            const color = sel ? '#d4572a' : '#e8742c'
            const tip = ray(dir)
            return (
              <g key={c.id}>
                <polygon points={poly([eye, ray(dir - half), ray(dir + half)])} fill={color} fillOpacity={sel ? 0.18 : 0.08} />
                <polyline
                  points={poly([eye, tip])}
                  stroke={color}
                  strokeWidth={2}
                  markerEnd="url(#arrow)"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={eye[0]}
                  cy={eye[1]}
                  r={font * 0.45}
                  fill="#fff"
                  stroke={color}
                  strokeWidth={sel ? 3 : 2}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={eye[0]} cy={eye[1]} r={font * 0.2} fill={color} />
                <text x={eye[0]} y={eye[1] + font * 1.1} fontSize={font * 0.6} fill={color} textAnchor="middle">
                  {c.label || c.id}
                </text>
              </g>
            )
          })}
        </g>
      )}
      {ink.map((st, i) =>
        shown(inkLayer(st.kind)) ? (
          <path key={'ink' + i} d={outlinePath(st.points, inkSize(st.viewWidth))} fill={inkLayer(st.kind) === layer ? '#111' : '#9a9a9a'} />
        ) : null,
      )}
    </StrokeCanvas>
  )
}
