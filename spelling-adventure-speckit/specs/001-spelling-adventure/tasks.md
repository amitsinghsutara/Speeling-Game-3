# Initial Task Backlog: Spelling Adventure

This is a proposed starter backlog. Let Spec Kit generate or refine tasks after the spec and plan have been clarified. Keep tasks small and independently verifiable.

## Phase 1 — Foundation
- [ ] T001 Confirm target platform(s), browser support, and whether Android WebView integration is in scope.
- [ ] T002 Initialize React + TypeScript + Vite project (if no existing project is being reused).
- [ ] T003 Configure formatting, linting, type checking, test runner, and production build scripts.
- [ ] T004 Add project design tokens and global responsive styles.
- [ ] T005 Add a developer README with install, test, and build instructions.

## Phase 2 — Content pipeline
- [ ] T006 Locate and confirm the authoritative complete word/foil spreadsheet.
- [ ] T007 Define the validated content schema, preserving all source fields and foil type labels.
- [ ] T008 Create a repeatable spreadsheet-to-JSON import script.
- [ ] T009 Implement validation for missing values, duplicate IDs, duplicate choices, sequence errors, and invalid foil counts.
- [ ] T010 Add fixtures based on reviewed sample rows and tests for valid/invalid content.
- [ ] T011 Import the complete reviewed dataset and resolve all validation errors.

## Phase 3 — Game logic
- [ ] T012 Define typed item, level, question, answer, progress, and scoring models.
- [ ] T013 Implement answer-choice construction using target plus configured foils.
- [ ] T014 Implement testable choice shuffling and verify the target appears exactly once.
- [ ] T015 Implement answer evaluation and duplicate-tap protection.
- [ ] T016 Implement the agreed retry, reveal, scoring, and progression rules.
- [ ] T017 Add unit tests for question construction, evaluation, scoring, and level completion.

## Phase 4 — UI
- [ ] T018 Build the home screen using the agreed forest-adventure visual direction.
- [ ] T019 Build level selection and level status indicators.
- [ ] T020 Build the question screen with a prominent replay-audio control.
- [ ] T021 Build large, accessible answer tiles.
- [ ] T022 Build encouraging correct/incorrect feedback states.
- [ ] T023 Build progress indicator and level completion/reward screen.
- [ ] T024 Add responsive layouts, focus states, semantic labels, and reduced-motion support.
- [ ] T025 Add component tests for the main gameplay journey.

## Phase 5 — Audio and persistence
- [ ] T026 Define the audio provider interface and explicit loading/error states.
- [ ] T027 Implement the chosen initial audio provider.
- [ ] T028 Add optional native Android TTS provider only if platform scope confirms it.
- [ ] T029 Define and version the local progress format.
- [ ] T030 Implement progress save, restore, invalid-state fallback, and reset behavior.
- [ ] T031 Add audio and persistence tests.

## Phase 6 — Offline and release
- [ ] T032 Configure the PWA manifest and service worker using a compatible, maintained approach.
- [ ] T033 Ensure core content and required assets are cached.
- [ ] T034 Test offline reload, gameplay, and saved progress on target browsers.
- [ ] T035 Run accessibility and responsive manual checks.
- [ ] T036 Run the full test suite, type check, lint, and production build.
- [ ] T037 Document deployment and known audio/device limitations.
- [ ] T038 Deploy a preview and complete acceptance review before production release.
