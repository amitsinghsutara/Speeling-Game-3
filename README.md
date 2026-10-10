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

## Deployment

The app is hosted on Cloudflare Pages, in project `spelling-adventure`:

- Production: https://spelling-adventure-68z.pages.dev
- Game 2 stays separately at `forest-spelling-adventure.pages.dev`

```bash
npm run deploy   # check + build + upload dist/ to production (branch "main")
```

- **Sign-in:** you need `wrangler` signed in (`npx wrangler login`).
- **Classic Pages project:** the project was created directly on Cloudflare Pages, which needed `--force` once at creation. Never pass `--force` again.
- **Caching:** `public/_headers` sets the cache rules. The page always revalidates, so updates reach players. Hashed assets are cached permanently, and word audio for a week.

## Offline and install

- **Precache:** a service worker (vite-plugin-pwa / Workbox) caches the app, content, fonts, icons and every word MP3 on the first visit, so the game installs and plays offline.
- **Updates:** a new version downloads in the background and is applied only on the Welcome or level screens, never mid-puzzle. Progress is saved on every change.
- **Container:** in the container app, the game calls `window.Android.cachedStatus(true)` once it is fully cached.
- **Icons:** regenerate them with `npm run gen:icons` (dependency-free; it draws Fern's face).
- **Dev server:** `npm run dev` does not register the service worker. To test offline, use `npm run build && npx vite preview`.
- **Local testing:** old service workers from Game 2 can linger on `localhost` ports and serve Game 2. Use a fresh port, or `127.0.0.1`.

## Optional AI adviser (Gemini)

**Production status (2026-10-10): on.** Main model `gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`. All four settings (`ADVISER_ENABLED`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_API_KEY`) are encrypted Cloudflare secrets on the production environment. Deploy with `npm run deploy:adviser`; a plain `npm run deploy` builds with the browser switch off.

- **Players update on their next launch.** A running game keeps its current version until it reloads.
- **Kill switch:** `printf false | npx wrangler pages secret put ADVISER_ENABLED --project-name=spelling-adventure`, then redeploy. Settings apply to new deployments.

### How it works

The adviser can suggest which detected error pattern to practise first, which eligible words to use, which due skill to review, and which approved foils to keep when scaffolding. Its limits:

- **Only choices the policy already allows.** It picks among options the local policy has already made eligible.
- **Cannot change the rules.** It cannot add strategies, change the curriculum order, score, declare mastery or alter answers.
- **Checked twice.** Every suggestion is validated against the curriculum, on the server and again in the browser.
- **Never in the way.** Advice is fetched in the background on the puzzle map, so play never waits. With no advice, local rules decide alone, and every decision records `ADVISER_UNAVAILABLE`, `ADVISER_ACCEPTED` or `ADVISER_NOT_APPLICABLE`.
- **Minimal data.** Only aggregate statistics and the approved word list are sent: no learner id, events or timestamps. See `src/adviser/request.ts` and its tests.

It stays off unless **both** switches are on. Constitution VI requires a recorded privacy review before production use.

```bash
# Server (Cloudflare Pages project settings, or the CLI):
npx wrangler pages secret put GEMINI_API_KEY --project-name=spelling-adventure   # paste the key when prompted
# Also set ADVISER_ENABLED=true and GEMINI_MODEL=<model id> as environment variables in the dashboard.

# Client: build with the flag on
npm run deploy:adviser
```

- **Endpoint:** `functions/api/advice.ts` is the Pages Function; all logic is in `src/adviser/server.ts`.
- **Timeouts:** 6 s on the server and 8 s in the client, which is never on the child's path.
- **Rate limits:** 20 requests per device IP per 10 minutes, best effort and per serverless instance. Use Cloudflare rate-limiting rules for a hard limit. The client also allows at most one request per 2 minutes.
- **Freshness:** advice is used only for its own level, and only for 30 minutes.

### Testing the adviser locally

The local key file is **`.dev.vars`** (git-ignored; copy `.dev.vars.example` to create it). It is read by the local server only, and never committed or deployed.

**With your real key:**

1. In `.dev.vars`, set `GEMINI_API_KEY` and `GEMINI_MODEL`, and leave `GEMINI_API_BASE` commented out.
2. Run `npm run dev:full`. This builds with the adviser switched on and serves the site and `/api/advice` at http://127.0.0.1:8788.
3. Open the puzzle map. That triggers one background request (at most one every 2 minutes).

- **Model ids:** `npm run gemini:models -- lite` lists the models your key can use (names only; the key is never printed).
- **Fallback:** set `GEMINI_FALLBACK_MODEL` to have the function try a second model once, when the main one is unavailable, rate-limited, slow or returns bad output. Both attempts share a 7-second budget, which ends before the browser's 8-second timeout.

**Without a key, against a fake Gemini:**

1. Run `npm run mock:gemini` in one terminal.
2. Uncomment `GEMINI_API_BASE=http://127.0.0.1:8790` in `.dev.vars`, and put any value in `GEMINI_API_KEY`.
3. Run `npm run dev:full` in another terminal.

The fake deliberately suggests an invented word and an invented foil, so you can watch validation remove them. For safety, the function only sends the key to Google's endpoint or to `127.0.0.1`/`localhost`.

To deploy with the adviser switched on in the browser, use `npm run deploy:adviser`. The server stays off until `ADVISER_ENABLED`, `GEMINI_MODEL` and the `GEMINI_API_KEY` secret are set on the Cloudflare project.
