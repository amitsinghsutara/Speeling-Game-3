# Implementation Plan: Spelling Adventure with Adaptive Learning

**Branch**: `001-spelling-adventure` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

## Summary

This is an offline-first React PWA. A versioned content dataset is generated from the spreadsheet, and a pure game core sits on top of it. Next to the core sit a local learner model (computed from learning events in IndexedDB) and a deterministic adaptive policy that records a reason code for every decision. An optional server-side Gemini adviser comes last; its output is validated against the curriculum and can only choose among options the local policy already deems eligible.

## Technical Context

- **Language/Version**: TypeScript 6 with `strict: true`, on Node 24. Node runs `.ts` scripts natively through type stripping.
- **Primary Dependencies**: React 19, Vite 8, Zod 4 (runtime schemas shared by importer, app, and server), and vite-plugin-pwa. `xlsx` is used only at import time, never in the bundle.
- **Storage**: localStorage for preferences and stars/unlock state, IndexedDB for learning events and decisions.
- **Testing**: Vitest 5, React Testing Library, jsdom, and fake-indexeddb.
- **Lint**: oxlint.
- **Target Platform**: Modern mobile and desktop browsers as an installable PWA. Android WebView is deferred.
- **Project Type**: Single web project, plus one serverless function for the adviser.
- **Performance Goals**: An adaptive decision takes under 10 ms on a mid-range phone, so it is synchronous and pure.
- **Constraints**: No network dependency on the core path, and no Gemini key in the client.
- **Scale/Scope**: 200 items across 10 levels and 18 foil codes.

## Constitution Check

| Principle | How the plan complies |
|---|---|
| I. Learning correctness | The importer reads the spreadsheet read-only and checks the WordList against the Summary sheet. The build fails on any error. Thresholds are provisional configuration. |
| II. Child-safe | Retry until correct and never 0 stars. Adviser failures are silent. |
| III. Accessibility | Semantic buttons, feedback not conveyed by colour alone, reduced motion. Covered in Phase 9. |
| IV. Offline-first | Content is bundled, MP3s are precached, and the policy is local. The adviser is optional. |
| V. Maintainable | Modules are separated: `content`, `game`, `learner`, `adaptive`, `audio`, `persistence`, `adviser`, `ui`. Core logic is pure with an injected random source and clock. |
| VI. Privacy | Events stay on the device. The adviser receives only a pseudonymous ID and aggregates, and is disabled until a privacy review is recorded. |
| VII. Verifiable | Every phase ends with lint, typecheck, and tests passing. |
| VIII. Adaptive | A closed reason-code enum, a versioned policy configuration, and a repeated-evidence rule. |
| IX. Bounded AI | The key stays server-side. Responses are validated with Zod and checked against the curriculum, with a timeout, a rate limit, and a fallback to local rules. |

Gate result: **PASS**. There are no violations to track in Complexity Tracking.

## Project Structure

```text
English_Spelling_Words_and_Foils.xlsx   # authoritative source (read-only)
scripts/
  import-content.ts          # xlsx → src/content/content.generated.json
src/
  content/
    schema.ts                # Zod schemas + inferred types (shared)
    validate.ts              # cross-row validation (pure)
    normalize.ts             # raw sheet rows → dataset (pure, testable without xlsx)
    content.generated.json   # committed, versioned output
    loadContent.ts           # runtime parse + validate
  game/                      # buildQuestion, evaluateAnswer, scoring, progression
  learner/                   # LearningEvent, learner model (pure)
  adaptive/                  # policy, reason codes, policy config
  audio/                     # AudioProvider, bundled MP3 + speech fallback
  persistence/               # storage repos (localStorage + IndexedDB)
  adviser/                   # client: request builder, response validation, fallback
  ui/                        # React components and screens
  test/                      # setup + fixtures
functions/api/advice.ts      # serverless Gemini endpoint (Phase 8)
public/audio/words/*.mp3     # ported from Speeling Game 2
```

## Key Design Decisions

1. **Stable IDs**: an item ID is `item-NNN`, taken from the spreadsheet's global Item # column (validated as unique). A skill ID is `level-N`, because the dataset tags skills only at the level.
2. **Content version**: `contentVersion` is a SHA-256 hash of the normalized items plus the codebook. Every learning event stores it.
3. **Codebook as data**: each foil gets `code` (raw) and `tier` (parsed from "Tier N" in the codebook). Nothing in the code hard-codes code meanings.
4. **Scaffolding without inventing content**: scaffolding shows a subset of the item's own approved foils, ordered by tier with sequence as the tiebreak. No other foil sources are used until FR-024 is resolved.
5. **The adviser can only choose among eligible options**: the policy first computes eligible `(item, foilSet, strategy)` candidates. Advice may only pick among those candidates, so invalid advice cannot widen the set.
6. **Adviser host**: Cloudflare Pages Functions, matching Game 2's deployment. This can be revisited in Phase 8.
7. **Game 2 port**: the importer is rewritten in TypeScript with full validation, the MP3s are copied, and the star rules are reimplemented with tests. Game 2's sync and analytics code is not ported.

## Phases

1. Foundation: scaffold, strict TS, lint, tests, build.
2. Content: schema, importer, validation, generated dataset, tests.
3. Game core: build question, evaluate, stars, unlock (pure, tested).
4. UI and audio: screens and the MP3 provider.
5. Learner model: events in IndexedDB and derived statistics.
6. Adaptive policy: strategies, reason codes, provisional configuration.
7. Adaptive tests: scenario and property tests.
8. Gemini adviser: endpoint, validation, fallback.
9. Offline/PWA, accessibility, and release checks.

## Complexity Tracking

None.
