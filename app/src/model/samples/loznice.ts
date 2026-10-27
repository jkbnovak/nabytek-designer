import type { Assembly } from '../schema'

// Přibližný přepis ruční skici „LOŽNICE“ – testovací případ, rozměry ověřit s autorem.
export const loznice: Assembly = {
  name: 'Ložnice – vestavba',
  materials: { carcass: 'egger-W1000', fronts: 'egger-H1145' },
  brief: 'Vestavba do ložnice: šatní skříň s tyčí a policemi, vedle komoda se šuplíky. Bílé lamino, dub na plátech.',
  room: {
    vertices: [
      [0, 0],
      [3200, 0],
      [3200, 3500],
      [0, 3500],
    ],
    closed: true,
    height: 2600,
    wallThickness: 150,
    openings: [
      { id: 'o1', kind: 'window', wall: 1, offset: 1200, width: 1200, height: 1400, sill: 900 },
      { id: 'o2', kind: 'door', wall: 2, offset: 400, width: 800, height: 1970, sill: 0 },
    ],
    obstacles: [],
    slopes: [],
    stairs: [],
  },
  cabinets: [
    {
      id: 'komoda',
      label: '② komoda',
      x: 0,
      z: 1490, // levý zadní roh: za skříní (613 + front 18 + rezerva) + šířka 850
      rotation: 90,
      width: 850,
      height: 1000,
      depth: 650,
      elevation: 0,
      plinth: 80,
      thickness: 18,
      interior: { kind: 'leaf', fill: { type: 'drawers', count: 4 }, front: 'none' },
    },
    {
      id: 'skrin',
      label: '③ šatní skříň',
      x: 650,
      z: 0,
      rotation: 0,
      width: 1600,
      height: 2320,
      depth: 613,
      elevation: 0,
      plinth: 80,
      thickness: 18,
      interior: {
        kind: 'split',
        axis: 'x',
        parts: [
          {
            size: null,
            zone: {
              kind: 'split',
              axis: 'y',
              parts: [
                { size: null, zone: { kind: 'leaf', fill: { type: 'rod' }, front: 'door-left' } },
                { size: 380, zone: { kind: 'leaf', fill: { type: 'open', shelves: 0 }, front: 'door-left' } },
              ],
            },
          },
          {
            size: null,
            zone: {
              kind: 'split',
              axis: 'y',
              parts: [
                { size: 900, zone: { kind: 'leaf', fill: { type: 'open', shelves: 2 }, front: 'door-right' } },
                { size: null, zone: { kind: 'leaf', fill: { type: 'rod' }, front: 'door-right' } },
                { size: 380, zone: { kind: 'leaf', fill: { type: 'open', shelves: 0 }, front: 'door-right' } },
              ],
            },
          },
        ],
      },
    },
  ],
  cameras: [
    { id: 'c1', label: 'Pohled 1 – čelně na skříň', position: [1450, 1600, 3300], target: [1450, 1100, 300], fov: 50 },
    { id: 'c2', label: 'Pohled 2 – na komodu', position: [2600, 1500, 1400], target: [300, 600, 400], fov: 50 },
    { id: 'c3', label: 'Pohled 3 – od dveří', position: [3000, 1700, 3200], target: [900, 900, 300], fov: 50 },
  ],
}
