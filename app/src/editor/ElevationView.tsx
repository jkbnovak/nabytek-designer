import type { Cabinet } from '../model/schema'
import { planeAt, type CeilingPlane } from '../model/ceiling'
import { cabinetCells, cabinetParts, type Cell } from '../model/geometry'
import type { Path } from '../model/zoneOps'
import { StrokeCanvas } from './StrokeCanvas'
import { recognize, type Pt } from './recognize'

interface Props {
  cab: Cabinet
  ceiling: CeilingPlane | null // šikmina / podhled schodů nad korpusem (i když je zkosení vypnuté)
  selectedPath: Path | null
  onSelectCell: (path: Path | null) => void
  onSplit: (cell: Cell, axis: 'x' | 'y', first: number) => void
  onMessage: (msg: string) => void
}

const MARGIN = 250
const MIN_PART = 50
const samePath = (a: Path | null, b: Path) => !!a && a.length === b.length && a.every((v, i) => v === b[i])

/** Čelní pohled na korpus. SVG y = −výška, takže podlaha je dole. */
export function ElevationView({ cab, ceiling, selectedPath, onSelectCell, onSplit, onMessage }: Props) {
  const parts = cabinetParts(cab)
  const cells = cabinetCells(cab)
  const t = cab.thickness
  const viewBox: [number, number, number, number] = [-MARGIN, -cab.height - MARGIN, cab.width + 2 * MARGIN, cab.height + 2 * MARGIN]
  const font = Math.max(viewBox[2], viewBox[3]) / 50

  const cellAt = (x: number, y: number) => cells.find(({ rect: r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)

  const handleStroke = (pts: Pt[]) => {
    const s = recognize(pts)
    if (s.kind !== 'line' || !s.axis) {
      onMessage('Tah nerozpoznán – svislá čára = příčka, vodorovná = police.')
      return
    }
    const [mx, my] = [s.mid[0], -s.mid[1]]
    const cell = cellAt(mx, my)
    if (!cell) return
    const r = cell.rect
    const vertical = s.axis === 'v'
    const span = vertical ? r.w : r.h
    const raw = vertical ? mx - r.x - t / 2 : my - r.y - t / 2
    const first = Math.round(raw / 10) * 10
    if (first < MIN_PART || first > span - t - MIN_PART) {
      onMessage('Příliš blízko okraje pole.')
      return
    }
    onSplit(cell, vertical ? 'x' : 'y', first)
  }

  const handleTap = ([x, y]: Pt) => onSelectCell(cellAt(x, -y)?.path ?? null)

  const rectProps = (x: number, y: number, w: number, h: number) => ({ x, y: -(y + h), width: w, height: h })

  return (
    <StrokeCanvas viewBox={viewBox} onStroke={handleStroke} onTap={handleTap}>
      <line x1={-MARGIN} y1={0} x2={cab.width + MARGIN} y2={0} stroke="#999" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <defs>
        <pattern id="slope-hatch" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0V40" stroke="#8a7aa8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </pattern>
      </defs>
      {ceiling && (
        // šikmina měřená na líci fronty; nad ní šrafa
        <polygon
          points={[
            [-MARGIN, -planeAt(ceiling, -MARGIN, cab.depth)],
            [cab.width + MARGIN, -planeAt(ceiling, cab.width + MARGIN, cab.depth)],
            [cab.width + MARGIN, -cab.height - MARGIN],
            [-MARGIN, -cab.height - MARGIN],
          ]
            .map((p) => p.join(','))
            .join(' ')}
          fill="url(#slope-hatch)"
          fillOpacity={0.5}
          stroke="#6a5a8a"
          strokeWidth={2}
          strokeDasharray="10 6"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {cells.map((c) => (
        <rect
          key={c.path.join('.')}
          {...rectProps(c.rect.x, c.rect.y, c.rect.w, c.rect.h)}
          fill={samePath(selectedPath, c.path) ? '#f6d9c8' : '#fbf8f2'}
        />
      ))}

      {parts
        .filter((p) => ['side', 'top', 'bottom', 'divider', 'shelf', 'plinth'].includes(p.role))
        .map((p, i) => (
          <rect
            key={i}
            {...rectProps(p.center[0] - p.size[0] / 2, p.center[1] - p.size[1] / 2, p.size[0], p.size[1])}
            fill="#d9c7a7"
            stroke="#333"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

      {parts
        .filter((p) => p.role === 'rod')
        .map((p, i) => (
          <line
            key={i}
            x1={p.center[0] - p.size[0] / 2}
            x2={p.center[0] + p.size[0] / 2}
            y1={-p.center[1]}
            y2={-p.center[1]}
            stroke="#777"
            strokeWidth={4}
            vectorEffect="non-scaling-stroke"
          />
        ))}

      {parts
        .filter((p) => p.role === 'drawer')
        .map((p, i) => {
          const [x, y] = [p.center[0] - p.size[0] / 2, p.center[1] - p.size[1] / 2]
          return (
            <g key={i}>
              <rect
                {...rectProps(x, y, p.size[0], p.size[1])}
                fill="#efe9df"
                fillOpacity={0.6}
                stroke="#333"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={p.center[0] - 80}
                x2={p.center[0] + 80}
                y1={-(y + p.size[1] - 40)}
                y2={-(y + p.size[1] - 40)}
                stroke="#333"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

      {/* dvířka: značka otevírání – vrchol trojúhelníku míří ke straně pantů */}
      {cells
        .filter((c) => c.zone.front !== 'none' && c.zone.fill.type !== 'drawers')
        .map((c) => {
          const r = c.rect
          const [x0, x1, top, bot] = [r.x, r.x + r.w, -(r.y + r.h), -r.y]
          const [hinge, free] = c.zone.front === 'door-left' ? [x0, x1] : [x1, x0]
          return (
            <path
              key={'d' + c.path.join('.')}
              d={`M${free} ${top}L${hinge} ${(top + bot) / 2}L${free} ${bot}`}
              fill="none"
              stroke="#d4572a"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

      {cells.map((c) => (
        <text
          key={'t' + c.path.join('.')}
          x={c.rect.x + c.rect.w / 2}
          y={-(c.rect.y + c.rect.h / 2)}
          fontSize={font * 0.7}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#2a5db0"
        >
          {Math.round(c.rect.w)}×{Math.round(c.rect.h)}
        </text>
      ))}

      <text x={cab.width / 2} y={font * 1.5} fontSize={font} textAnchor="middle">
        {cab.width}
      </text>
      <text x={-font} y={-cab.height / 2} fontSize={font} textAnchor="middle" transform={`rotate(-90 ${-font} ${-cab.height / 2})`}>
        {cab.height}
      </text>
    </StrokeCanvas>
  )
}
