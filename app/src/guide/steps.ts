import type { Assembly, Zone } from '../model/schema'
import { DEFAULT_MATERIALS } from '../materials/library'

// Postup projektu pro průvodce: kroky, kdy jsou hotové, a kam s nimi aplikace přepne.

export type GuideAction =
  | { kind: 'brief' }
  | { kind: 'advisor' }
  | { kind: 'editor'; mode: 'sketch' | 'plan'; layer: 'space' | 'furniture' | 'views'; spaceTool?: 'walls' | 'window' | 'slope' | 'stairs' }
  | { kind: 'elevation' } // první korpus → Členění

export interface GuideStep {
  id: string
  title: string
  text: string
  optional?: boolean
  done: boolean | null // null = nedá se poznat (jen informace)
  actions: { label: string; action: GuideAction; disabled?: boolean }[]
}

/** Má korpus nějaké členění nebo vybavení (ne jen prázdnou bednu)? */
const furnished = (z: Zone): boolean => z.kind === 'split' || z.front !== 'none' || z.fill.type !== 'open' || z.fill.shelves > 0

export function guideSteps(a: Assembly, advisorMessages: number): GuideStep[] {
  const r = a.room
  const hasCabinets = a.cabinets.length > 0
  return [
    {
      id: 'brief',
      title: 'Zadání projektu',
      text: 'Napiš, co se navrhuje, své představy a s čím si nevíš rady. AI to použije u převodů skic i v poradci.',
      done: a.brief.trim().length > 0,
      actions: [{ label: 'Vyplnit zadání', action: { kind: 'brief' } }],
    },
    {
      id: 'space',
      title: 'Prostor – stěny',
      text:
        'Nakresli stěny místnosti, nebo jen jednu stěnu. Délky napiš perem k čarám nebo použij ① Bod, pak „Převést stěny“. ' +
        'Rychlejší je Skica: půdorys i pohled na jeden papír, případně fotka papírové skici.',
      done: !!r,
      actions: [
        { label: 'Kreslit stěny', action: { kind: 'editor', mode: 'plan', layer: 'space', spaceTool: 'walls' } },
        { label: 'Skica prostoru', action: { kind: 'editor', mode: 'sketch', layer: 'space' } },
      ],
    },
    {
      id: 'details',
      title: 'Okna, dveře, šikminy, schody',
      text: 'Ve vrstvě Prostor: Okno a Dveře – ťukni na stěnu. Šikmina – ťukni na stěnu pod krovem. Schodiště – čára ve směru stoupání. Sloup – obdélník.',
      optional: true,
      done: !!r && r.openings.length + r.slopes.length + r.stairs.length + r.obstacles.length > 0,
      actions: [
        { label: 'Okna a dveře', action: { kind: 'editor', mode: 'plan', layer: 'space', spaceTool: 'window' }, disabled: !r },
        { label: 'Šikmina', action: { kind: 'editor', mode: 'plan', layer: 'space', spaceTool: 'slope' }, disabled: !r },
      ],
    },
    {
      id: 'furniture',
      title: 'Nábytek – korpusy',
      text:
        'Nakresli obdélníky korpusů – u stěny se přichytí zády ke zdi. Rozměry napiš k nim, pak „Převést nábytek“. ' +
        'Horní skříňky: v inspektoru nastav Zavěšení.',
      done: hasCabinets,
      actions: [
        { label: 'Kreslit korpusy', action: { kind: 'editor', mode: 'plan', layer: 'furniture' } },
        { label: 'Skica nábytku', action: { kind: 'editor', mode: 'sketch', layer: 'furniture' } },
      ],
    },
    {
      id: 'interior',
      title: 'Členění korpusů',
      text: 'Vyber korpus → „Členění“. Svislá čára = příčka, vodorovná = police. Ťuknutím na pole nastavíš tyč, šuplíky nebo dvířka.',
      done: a.cabinets.some((c) => furnished(c.interior)),
      actions: [{ label: 'Otevřít členění', action: { kind: 'elevation' }, disabled: !hasCabinets }],
    },
    {
      id: 'materials',
      title: 'Materiály',
      text: 'Ve vrstvě Nábytek bez vybraného korpusu nastavíš materiály celého projektu; u jednotlivého korpusu je můžeš změnit.',
      done:
        a.materials.carcass !== DEFAULT_MATERIALS.carcass ||
        a.materials.fronts !== DEFAULT_MATERIALS.fronts ||
        a.cabinets.some((c) => c.carcassMaterial || c.frontsMaterial),
      actions: [{ label: 'Nastavit materiály', action: { kind: 'editor', mode: 'plan', layer: 'furniture' } }],
    },
    {
      id: 'views',
      title: 'Pohledy (očička)',
      text: 'Ve vrstvě Pohledy táhni čáru od oka ve směru pohledu. Ve 3D se pak na kameru přepneš tlačítkem nahoře.',
      done: a.cameras.length > 0,
      actions: [{ label: 'Přidat pohled', action: { kind: 'editor', mode: 'plan', layer: 'views' } }],
    },
    {
      id: 'advisor',
      title: 'Kontrola s poradcem',
      text: 'Poradce – nábytkář projde návrh, upozorní na problémy (kolize, rozměry, kování) a poradí.',
      optional: true,
      done: advisorMessages > 0,
      actions: [{ label: 'Otevřít poradce', action: { kind: 'advisor' } }],
    },
    {
      id: 'output',
      title: 'Obrázky pro klienta',
      text: 'Ve 3D vyber pohled, zapni 🎨 Render a ulož 📸. S klíčem Google je k dispozici i ✨ AI vizualizace (placená).',
      done: null,
      actions: [],
    },
  ]
}
