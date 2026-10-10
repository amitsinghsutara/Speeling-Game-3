# Tasks: Spelling Adventure with Adaptive Learning

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

`[P]` marks tasks that can run in parallel. `[USn]` maps a task to a user story.

## Phase 1: Foundation

- [x] T001 Create package.json, strict tsconfig (app + node), vite.config.ts, and .gitignore
- [x] T002 Configure Vitest (jsdom, setup file), oxlint, and scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `gen:content`
- [x] T003 [P] Add a minimal `src/main.tsx` and `App.tsx` placeholder that renders the content summary
- [x] T004 [P] Add README.md with setup, test, and content-pipeline instructions

## Phase 2: Content pipeline [US1]

- [x] T005 Define Zod schemas for the dataset, item, foil, codebook entry, and level guide in `src/content/schema.ts`
- [x] T006 Implement pure `normalize.ts` (sheet rows → dataset), including the tier parse and stable IDs
- [x] T007 Implement `validate.ts`: missing fields, unknown codes, duplicate IDs/targets/choices, sequence gaps, LevelGuide word counts, and Summary per-code counts
- [x] T008 Implement `scripts/import-content.ts` (xlsx → JSON, contentVersion hash, non-zero exit on errors)
- [x] T009 [P] Add unit tests for normalize and validate using small fixtures (valid and each invalid case)
- [x] T010 Generate and commit `src/content/content.generated.json`, and add a test asserting 200 items and 0 errors
- [x] T011 Implement `loadContent.ts` (runtime Zod parse) with a test

## Phase 3: Game core [US1]

- [x] T012 `buildQuestion` with an injected RNG and a foil subset (for scaffolding), plus invariant tests
- [x] T013 `evaluateAnswer` and the per-question state machine (retry, disabled tiles, no double advance)
- [x] T014 `starsForMistakes` (0 mistakes → 3, 1–3 → 2, 4+ → 1), best-kept merge, and tests
- [x] T015 Puzzle splitting and sequential unlock, with tests

## Phase 4: UI and audio [US1]

- [x] T016 Define the AudioProvider interface; implement the bundled-MP3 provider and the speech fallback; add tests
- [x] T017 Port 200 MP3s from Speeling Game 2 to `public/audio/words/`, and add a test that every target has audio
- [x] T018 Build screens: Welcome, Home (levels), Puzzle map, Question with feedback, Puzzle/Level complete, in the cartoon style (thick outlines, press-down buttons, bundled Fredoka and Andika fonts)
- [x] T019 Add component tests for the main journey
- [x] T019a Save stars and completed puzzles locally (versioned, validated, safe fallback), with tests
- [x] T019b Check the layout at phone widths (320, 360, 390 x 640) in a browser; fix overlaps, tile overflow, hidden choices
- [ ] T019c Check on a real phone and inside the container app
- [x] T019d Exit button for the container app: shown only when window.Android exposes an exit method; friendly confirm dialog; Welcome and level screens only
- [ ] T019e Confirm the container's real exit method name and replace EXIT_METHOD_CANDIDATES in src/platform/containerBridge.ts

## Phase 5: Learner model [US2]

- [ ] T020 Define the LearningEvent schema and an IndexedDB repository (versioned, with migration and reset)
- [ ] T021 Derive learner-model statistics per skill and per foil code (pure)
- [ ] T022 Implement error-pattern detection using the repeated-evidence threshold, with tests (a single mistake never triggers it)

## Phase 6: Adaptive policy [US3]

- [ ] T023 Add the ReasonCode enum and a PolicyConfig with provisional flags
- [ ] T024 Generate eligible candidates: focused practice, scaffolding, consolidation, mixed practice, spaced review, transfer, introduction
- [ ] T025 Implement a deterministic selector that persists AdaptiveDecision records
- [ ] T026 Wire the policy into the game flow

## Phase 7: Adaptive tests [US3]

- [ ] T027 Add scenario tests for each strategy and reason code
- [ ] T028 Add property tests: approved-only content, determinism under a seed, and no single-mistake patterns

## Phase 8: Gemini adviser [US4]

- [ ] T029 Define Zod schemas for the advice request and response, plus a minimal-data request builder
- [ ] T030 Build the `functions/api/advice.ts` endpoint (secret key, timeout, rate limit, validation)
- [ ] T031 Build the client adviser (timeout, curriculum check, eligible-only application, fallback reason codes)
- [ ] T032 Add adversarial tests (unknown words, invalid JSON, slow or failing responses)

## Phase 9: Offline, accessibility, and release [US5]

- [ ] T033 Add the PWA manifest and precaching of the app, content, and MP3s
- [ ] T034 Test offline reload, gameplay, and resume
- [ ] T035 Complete the accessibility pass (focus, labels, reduced motion, cues beyond colour)
- [ ] T036 Run the full lint, typecheck, test, and build; document limitations; deploy a preview
