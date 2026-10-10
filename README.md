# Spelling Adventure

An offline-first spelling and phonics game for early readers, featuring Fern the fox. The core is a pedagogy-first adaptive learning engine. An optional Gemini adviser may make suggestions, but only validated suggestions are used, and local rules always decide.

- Constitution: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Spec, plan and tasks: [`specs/001-spelling-adventure/`](specs/001-spelling-adventure/)

## Setup

Requires Node 24 or later, which runs the TypeScript import script directly.

```bash
npm install
npm run dev        # local dev server
npm run check      # lint + typecheck + tests + content freshness check
npm run build      # typecheck + production build
```

## Content pipeline

The authoritative curriculum is `English_Spelling_Words_and_Foils.xlsx` at the repo root. The import script only ever reads it, never writes it.

```bash
npm run gen:content              # xlsx → src/content/content.generated.json
npm run gen:content -- --check   # fail if the committed JSON is stale
```

The import reads all five sheets. It fails without writing anything if it finds any of these:

- missing or non-numeric fields
- shifted column headers
- unknown foil codes
- duplicate item numbers, or duplicate choices within an item
- sequence gaps
- counts that disagree with the LevelGuide
- L1-transfer counts that disagree with the foil codes
- per-level foil-type tallies that disagree with the Summary sheet

Foil-code meanings and difficulty tiers come from the FoilCodebook sheet, never from code. Design notes and research text are for content reviewers only and are never shown to children.

| Module | Responsibility |
|---|---|
| `src/content/schema.ts` | Zod schemas shared by the importer and the app |
| `src/content/normalize.ts` | Raw sheet rows → normalized draft (pure, the only module that knows the column layout) |
| `src/content/validate.ts` | Cross-row and cross-sheet validation |
| `src/content/loadContent.ts` | Runtime parse of the bundled dataset |
| `scripts/import-content.ts` | Reads the xlsx, hashes the `contentVersion`, writes the JSON |

The `xlsx` dev dependency is installed from the SheetJS CDN (0.20.3), because the npm registry copy (0.18.5) has known advisories. It is used only at import time and is never bundled.
