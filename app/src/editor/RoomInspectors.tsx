import type { Obstacle, Opening, Room, Slope, Stairs } from '../model/schema'
import { slopeAngle, slopeDepthFor } from '../model/slopes'
import { NumberField, Seg } from './Inspector'

export function RoomInspector({
  room,
  onChange,
  onEditWalls,
  onFlip,
  onDelete,
}: {
  room: Room
  onChange: (p: Partial<Room>) => void
  onEditWalls: () => void
  onFlip: () => void
  onDelete: () => void
}) {
  return (
    <div className="inspector">
      <NumberField label={room.closed ? 'Výška stropu' : 'Výška stěny'} value={room.height} onCommit={(v) => onChange({ height: v! })} />
      <NumberField label="Tloušťka zdí" value={room.wallThickness} onCommit={(v) => onChange({ wallThickness: v! })} />
      <div className="actions">
        <button onClick={onEditWalls}>Délky stěn…</button>
        {!room.closed && (
          <button onClick={onFlip} title="Přehodí stranu, na které stojí nábytek">
            ⇅ Otočit stranu
          </button>
        )}
        <button className="danger" onClick={onDelete}>
          {room.closed ? 'Smazat místnost' : 'Smazat stěny'}
        </button>
      </div>
    </div>
  )
}

export function OpeningInspector({
  opening: o,
  onChange,
  onDelete,
}: {
  opening: Opening
  onChange: (p: Partial<Opening>) => void
  onDelete: () => void
}) {
  return (
    <div className="inspector">
      <div className="field">
        <span>Typ</span>
        <Seg
          value={o.kind}
          options={[
            ['window', 'Okno'],
            ['door', 'Dveře'],
          ]}
          onChange={(kind) => onChange({ kind, sill: kind === 'door' ? 0 : o.sill || 900 })}
        />
      </div>
      <NumberField label="Šířka" value={o.width} onCommit={(v) => onChange({ width: v! })} />
      <NumberField label="Výška" value={o.height} onCommit={(v) => onChange({ height: v! })} />
      {o.kind === 'window' && <NumberField label="Parapet" value={o.sill} allowZero onCommit={(v) => onChange({ sill: v ?? 0 })} />}
      <NumberField label="Od rohu" value={o.offset} allowZero onCommit={(v) => onChange({ offset: v ?? 0 })} />
      <div className="actions">
        <button className="danger" onClick={onDelete}>
          Smazat
        </button>
      </div>
    </div>
  )
}

export function ObstacleInspector({
  obstacle: o,
  onChange,
  onDelete,
}: {
  obstacle: Obstacle
  onChange: (p: Partial<Obstacle>) => void
  onDelete: () => void
}) {
  return (
    <div className="inspector">
      <label className="field wide">
        <span>Název</span>
        <input value={o.label} placeholder="sloup, komín…" onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <NumberField label="Šířka" value={o.width} onCommit={(v) => onChange({ width: v! })} />
      <NumberField label="Hloubka" value={o.depth} onCommit={(v) => onChange({ depth: v! })} />
      <NumberField label="Výška" value={o.height} onCommit={(v) => onChange({ height: v! })} />
      <NumberField label="Otočení °" value={o.rotation} allowZero onCommit={(v) => onChange({ rotation: v ?? 0 })} />
      <div className="actions">
        <button className="danger" onClick={onDelete}>
          Smazat
        </button>
      </div>
    </div>
  )
}

export function SlopeInspector({
  slope: s,
  roomHeight,
  onChange,
  onDelete,
}: {
  slope: Slope
  roomHeight: number
  onChange: (p: Partial<Slope>) => void
  onDelete: () => void
}) {
  return (
    <div className="inspector">
      <NumberField label="Nadezdívka" value={s.kneeHeight} allowZero onCommit={(v) => onChange({ kneeHeight: v ?? 0 })} />
      <NumberField label="Zlom od stěny" value={s.depth} onCommit={(v) => onChange({ depth: v! })} />
      <NumberField
        label="Sklon °"
        value={Math.round(slopeAngle(s, roomHeight))}
        onCommit={(v) => onChange({ depth: slopeDepthFor(s.kneeHeight, v!, roomHeight) })}
      />
      <div className="actions">
        <button className="danger" onClick={onDelete}>
          Smazat šikminu
        </button>
      </div>
    </div>
  )
}

export function StairsInspector({
  stairs: st,
  onChange,
  onDelete,
}: {
  stairs: Stairs
  onChange: (p: Partial<Stairs>) => void
  onDelete: () => void
}) {
  return (
    <div className="inspector">
      <NumberField label="Délka ramene" value={st.length} onCommit={(v) => onChange({ length: v! })} />
      <NumberField label="Šířka" value={st.width} onCommit={(v) => onChange({ width: v! })} />
      <NumberField label="Podhled dole" value={st.bottomStart} allowZero onCommit={(v) => onChange({ bottomStart: v ?? 0 })} />
      <NumberField label="Podhled nahoře" value={st.bottomEnd} allowZero onCommit={(v) => onChange({ bottomEnd: v ?? 0 })} />
      <NumberField label="Otočení °" value={st.rotation} allowZero onCommit={(v) => onChange({ rotation: v ?? 0 })} />
      <div className="actions">
        <button onClick={() => onChange({ rotation: (st.rotation + 180) % 360 })} title="Schodiště stoupá opačným směrem">
          ⇄ Otočit směr
        </button>
        <button className="danger" onClick={onDelete}>
          Smazat
        </button>
      </div>
    </div>
  )
}
