import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Room, Slope, Stairs } from '../model/schema'
import { floorTexture } from './grain'
import { pointOnWall, wallMiters, wallPieces, wallSegments, type P2, type WallMiter, type WallSeg } from '../model/room'

const MM = 0.001
const WALL_COLOR = '#e9e6e0'
const CEILING_COLOR = '#f1eee8'
const STAIRS_COLOR = '#c9b38f'
const STAIRS_SLAB = 180 // tloušťka desky ramene (svisle)
const STEP_RISE = 180

/** Svislý hranol z půdorysu (body [x, z] v mm) od bottom do top. */
function prism(pts: P2[], bottom: number, top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM)))
  const geom = new THREE.ExtrudeGeometry(shape, { depth: (top - bottom) * MM, bevelEnabled: false })
  geom.rotateX(-Math.PI / 2) // výška vytažení → osa y, tvar zpět do roviny x/z
  geom.translate(0, bottom * MM, 0)
  return geom
}

/** Kusy jedné stěny; schová se, když je kamera za ní (pohled do místnosti zvenku). height = pod krovem nadezdívka. */
function Wall({ seg, room, miter, height }: { seg: WallSeg; room: Room; miter: WallMiter; height: number }) {
  const ref = useRef<THREE.Group>(null)
  const t = room.wallThickness
  // otvory nad nadezdívkou se neukazují, vyšší se zkrátí
  const openings = room.openings
    .filter((o) => o.wall === seg.index && o.sill < height)
    .map((o) => ({ ...o, height: Math.min(o.height, height - o.sill) }))
  const pieces = useMemo(() => wallPieces(seg.length, height, openings), [seg.length, height, openings])
  const geoms = useMemo(
    () =>
      pieces.map((p) => {
        // kusy na koncích stěny dostanou šikmý spoj vnějšího líce
        const outFrom = p.from === 0 ? miter.start : p.from
        const outTo = p.to === seg.length ? miter.end : p.to
        const pts = [pointOnWall(seg, p.from), pointOnWall(seg, p.to), pointOnWall(seg, outTo, -t), pointOnWall(seg, outFrom, -t)]
        return prism(pts, p.bottom, p.top)
      }),
    [pieces, seg, miter, t],
  )
  const angle = Math.atan2(-seg.u[1], seg.u[0])
  const mid = new THREE.Vector3(((seg.a[0] + seg.b[0]) / 2) * MM, 0, ((seg.a[1] + seg.b[1]) / 2) * MM)
  const outward = new THREE.Vector3(-seg.n[0], 0, -seg.n[1])

  useFrame(({ camera }) => {
    if (!ref.current) return
    const toCam = camera.position.clone().setY(0).sub(mid)
    ref.current.visible = toCam.dot(outward) < 0
  })

  return (
    <group ref={ref}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
        </mesh>
      ))}
      {openings
        .filter((o) => o.kind === 'window')
        .map((o) => {
          const [x, z] = pointOnWall(seg, o.offset + o.width / 2, -t / 2)
          return (
            <mesh key={o.id} position={[x * MM, (o.sill + o.height / 2) * MM, z * MM]} rotation={[0, angle, 0]}>
              <boxGeometry args={[o.width * MM, o.height * MM, 10 * MM]} />
              <meshStandardMaterial color="#bcd7ea" transparent opacity={0.35} />
            </mesh>
          )
        })}
    </group>
  )
}

/** Šikmý strop u stěny: od nadezdívky u líce stěny k linii zlomu ve výšce stropu. Schová se, když je kamera nad ním. */
function SlopeMesh({ seg, slope, height }: { seg: WallSeg; slope: Slope; height: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const { geom, origin, normal, roomSide } = useMemo(() => {
    const v = (p: P2, y: number) => new THREE.Vector3(p[0] * MM, y * MM, p[1] * MM)
    const [a, b] = [v(seg.a, slope.kneeHeight), v(seg.b, slope.kneeHeight)]
    const [c, d] = [v(pointOnWall(seg, seg.length, slope.depth), height), v(pointOnWall(seg, 0, slope.depth), height)]
    const g = new THREE.BufferGeometry().setFromPoints([a, b, c, a, c, d])
    g.computeVertexNormals()
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a))
    // bod v místnosti pod šikminou určuje, ze které strany je „vnitřek“
    const inside = v(pointOnWall(seg, seg.length / 2, slope.depth / 2), 0)
    return { geom: g, origin: a, normal: n, roomSide: Math.sign(n.dot(inside.clone().sub(a))) }
  }, [seg, slope, height])

  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = Math.sign(normal.dot(camera.position.clone().sub(origin))) === roomSide
  })

  return (
    <mesh ref={ref} geometry={geom} receiveShadow>
      <meshStandardMaterial color={CEILING_COLOR} side={THREE.DoubleSide} roughness={0.95} />
    </mesh>
  )
}

/** Rameno schodiště: šikmá deska (spodní hrana = podhled) a stupně na ní. Lokální x = směr stoupání. */
function StairsMesh({ st }: { st: Stairs }) {
  const rise = st.bottomEnd - st.bottomStart
  const slab = useMemo(() => {
    const g = new THREE.BoxGeometry(st.length * MM, STAIRS_SLAB * MM, st.width * MM)
    g.applyMatrix4(new THREE.Matrix4().makeShear(rise / st.length, 0, 0, 0, 0, 0)) // y roste s x
    return g
  }, [st.length, st.width, rise])
  const n = Math.max(2, Math.round(Math.abs(rise) / STEP_RISE))
  const [run, stepRise] = [st.length / n, rise / n]
  return (
    <group position={[st.x * MM, 0, st.z * MM]} rotation={[0, (st.rotation * Math.PI) / 180, 0]}>
      <mesh geometry={slab} castShadow receiveShadow position={[0, ((st.bottomStart + st.bottomEnd) / 2 + STAIRS_SLAB / 2) * MM, 0]}>
        <meshStandardMaterial color={STAIRS_COLOR} />
      </mesh>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} castShadow receiveShadow position={[(-st.length / 2 + (i + 0.5) * run) * MM, (st.bottomStart + STAIRS_SLAB + (i + 0.5) * stepRise) * MM, 0]}>
          <boxGeometry args={[run * MM, Math.abs(stepRise) * MM, st.width * MM]} />
          <meshStandardMaterial color={STAIRS_COLOR} />
        </mesh>
      ))}
    </group>
  )
}

export function RoomMesh({ room }: { room: Room }) {
  const segs = useMemo(() => wallSegments(room), [room])
  const miters = useMemo(() => wallMiters(segs, room.closed, room.wallThickness), [segs, room.closed, room.wallThickness])
  const floor = useMemo(() => {
    const shape = new THREE.Shape(room.vertices.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM)))
    return new THREE.ShapeGeometry(shape)
  }, [room.vertices])

  return (
    <group>
      {room.closed && (
        <mesh geometry={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <meshStandardMaterial map={floorTexture()} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
      {segs.map((seg) => {
        const slope = room.slopes.find((s) => s.wall === seg.index)
        return (
          <group key={seg.index}>
            <Wall seg={seg} room={room} miter={miters[seg.index]} height={slope ? Math.min(slope.kneeHeight, room.height) : room.height} />
            {slope && <SlopeMesh seg={seg} slope={slope} height={room.height} />}
          </group>
        )
      })}
      {room.stairs.map((st) => (
        <StairsMesh key={st.id} st={st} />
      ))}
      {room.obstacles.map((o) => (
        <mesh key={o.id} castShadow receiveShadow position={[o.x * MM, (o.height / 2) * MM, o.z * MM]} rotation={[0, (o.rotation * Math.PI) / 180, 0]}>
          <boxGeometry args={[o.width * MM, o.height * MM, o.depth * MM]} />
          <meshStandardMaterial color="#cfcac2" />
        </mesh>
      ))}
    </group>
  )
}
