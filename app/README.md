# Nábytek Designer

Nástroj pro návrh korpusového nábytku (vestavby, šatní skříně, kuchyně): kreslení stylusem nebo myší →
parametrický 3D model → render a podklady pro klienta.

## Spuštění

```
npm install
cp .env.example .env   # doplnit ANTHROPIC_API_KEY (volitelně GEMINI_API_KEY)
npm run dev            # jen tento počítač: http://localhost:5173
npm run dev:tablet     # i z ostatních zařízení v síti: http://<IP počítače>:5173
```

Další příkazy: `npm test` (testy), `npm run lint`, `npm run build`.

## Jak je to poskládané

- `src/` – webová aplikace (Vite + React + TypeScript, 3D přes react-three-fiber)
  - `model/` – datový model (zod schéma), geometrie korpusů, místnost, šikminy, zkosení
  - `editor/` – půdorys, čelní pohled, inkoust, plovoucí panel nástrojů
  - `sketch/` – volná skica (pero, body ①, fotka) a její převod
  - `viewer3d/` – 3D náhled a kvalitní render
  - `materials/`, `advisor/` (poradce), `guide/` (průvodce), `render/` (volitelná AI vizualizace)
- `server/` – malý server (Hono) s API klíči: převody skic a poradce přes Claude, volitelně AI vizualizace přes Google Gemini

## Data

Projekty se zatím ukládají do prohlížeče (localStorage) – každé zařízení i každá adresa má vlastní.
Zálohu a přenos dělá 🗂 Projekty → ⬇ Soubor / ⬆ Načíst ze souboru.

## Klíče

`.env` s API klíči se do gitu nedává (je v `.gitignore`). Bez `GEMINI_API_KEY` je AI vizualizace vypnutá.
