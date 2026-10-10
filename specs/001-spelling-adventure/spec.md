# Feature Specification: Spelling Adventure with Adaptive Learning

**Feature Branch**: `001-spelling-adventure`

**Created**: 2026-10-10

**Status**: Draft, with clarifications in progress (see [Clarifications](#clarifications))

**Input**: The starter spec pack, amended with the adaptive-learning requirements of 2026-10-10. Spelling Adventure is an offline-first spelling and phonics game for early readers featuring Fern the fox. Its core is a pedagogy-first adaptive learning engine; Gemini is an optional, validated pedagogical adviser.

## Summary

A learner hears a target word and picks its spelling from four answer tiles: the target plus three foils from the approved spreadsheet. Every answer is recorded as a learning event against the item's phonics skill and the foil type chosen. A deterministic, local adaptive policy uses the learner model to decide what comes next: focused practice, scaffolding, consolidation, mixed practice, spaced review, transfer to unseen approved words, or gradual introduction of new challenges. Every decision carries a reason code. An optional server-side Gemini adviser may recommend, but local rules validate and decide.

## Clarifications

### Session 2026-10-10

- Q: How many choices per question? → A: 4, the target plus exactly 3 foils. All 200 spreadsheet items have exactly 3.
- Q: What is the authoritative dataset? → A: `English_Spelling_Words_and_Foils.xlsx`, with sheets WordList (200 items, 10 levels), LevelGuide, FoilCodebook, Summary, and ResearchBasis. It validates with 0 errors.
- Q: What do foil codes such as `V`, `FC`, and `IC` mean? → A: They are defined in the spreadsheet's FoilCodebook sheet (18 codes, each with a difficulty tier). The codebook is imported as data, not hard-coded.
- Q: What is the incorrect-answer policy? → A: Retry until correct. The chosen wrong tile is disabled and a short phonics hint is shown. This is adopted from Speeling Game 2.
- Q: How are stars awarded? → A: 1–3 stars per puzzle, by mistakes in that puzzle: 0 mistakes earns 3, 1–3 earns 2, and 4 or more earns 1. Never 0 stars; the best result is kept. Adopted from Speeling Game 2.
- Q: How do levels unlock? → A: Sequentially. A level unlocks when the previous level is completed. Adopted from Speeling Game 2.
- Q: Is the AI adviser in scope? → A: Yes, as an optional adviser bounded by Constitution Principle IX. It is built after the deterministic policy.
- Q: How should prior work be reused? → A: Port selectively from Speeling Game 2: the importer approach, the 200 bundled MP3s, and engine pieces rewritten to fit this architecture.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answer spelling questions from the approved curriculum (Priority: P1)

A child opens the game, picks an unlocked level, hears a word, and selects its spelling from four tiles. They receive warm feedback and retry until correct, then move on.

**Why this priority**: This is the minimum playable game, and every other story depends on it.

**Independent Test**: Load the imported dataset, play a level end to end offline, and confirm that choices, evaluation, retry, and stars follow the rules.

**Acceptance Scenarios**:

1. **Given** a valid item, **When** choices are built, **Then** the target appears exactly once with its 3 configured foils and no choice is duplicated (case-insensitive).
2. **Given** an active question, **When** the child selects a foil, **Then** the tile is disabled, a supportive hint is shown, one mistake is recorded, and the question does not advance.
3. **Given** an active question, **When** the child selects the target, **Then** positive feedback is shown and the game advances exactly once, even after rapid repeated taps.
4. **Given** a completed puzzle, **When** stars are computed, **Then** they follow the agreed mistake bands and a replay never lowers the stored result.
5. **Given** no usable audio, **When** the child taps replay, **Then** a friendly, non-blocking message appears and the question remains answerable.

---

### User Story 2 - Learning events and learner model (Priority: P1)

Every attempt is stored locally as a learning event. The learner model summarizes performance per skill (level skill pattern) and per foil type.

**Why this priority**: Adaptive decisions are only as good as the evidence they use.

**Independent Test**: Replay a scripted sequence of attempts and verify the stored events and the derived per-skill and per-foil-type statistics.

**Acceptance Scenarios**:

1. **Given** an attempt, **When** it is recorded, **Then** the event stores the item ID, skill, chosen option, chosen foil code (if any), correctness, attempt index, response time, timestamp, content version, and the decision ID that produced the question.
2. **Given** one wrong answer of a foil type, **When** the learner model is queried, **Then** no error pattern is reported for that type.
3. **Given** wrong answers of the same foil type that meet the configured repetition threshold within the configured window, **When** the learner model is queried, **Then** an error pattern is reported with the supporting event IDs.
4. **Given** corrupt or older stored data, **When** the app loads, **Then** it migrates or safely resets without crashing.

---

### User Story 3 - Deterministic adaptive challenge selection (Priority: P1)

After each question, the local adaptive policy selects the next item and presentation strategy from the approved curriculum and records a reason code.

**Why this priority**: This is the core feature of the product.

**Independent Test**: Feed fixed learner-model states to the policy with a seeded random source and assert the exact decisions and reason codes.

**Acceptance Scenarios**:

1. **Given** a detected error pattern for a foil type, **When** the next challenge is chosen, **Then** the policy selects focused practice on approved items whose foils include that type (reason `FOCUS_ERROR_PATTERN`).
2. **Given** a child struggling with an item, **When** scaffolding applies, **Then** the question is presented with fewer foils, chosen from the item's approved foils by lowest difficulty tier, and the target is never altered (reason `SCAFFOLD_REDUCE_CHOICES`).
3. **Given** readiness criteria are met in a skill, **When** the next challenge is chosen, **Then** higher-tier foils or the next skill are introduced gradually (reason `INTRODUCE_NEW_CHALLENGE`).
4. **Given** a skill previously practiced, **When** its review interval elapses, **Then** a review item is scheduled (reason `SPACED_REVIEW`).
5. **Given** demonstrated success on a skill, **When** a transfer check is due, **Then** an approved item of that skill that the child has never seen is chosen (reason `TRANSFER_CHECK`).
6. **Given** any decision, **When** it is made, **Then** it is persisted with its reason code, the inputs it used, and the policy version.
7. **Given** the same learner state and seed, **When** the policy runs twice, **Then** the decisions are identical.

---

### User Story 4 - Optional Gemini pedagogical adviser (Priority: P3)

When online and enabled, the app asks a server endpoint for advice. Valid advice may influence the local policy's choice among already-eligible options.

**Why this priority**: It adds value, but core gameplay must never depend on it.

**Independent Test**: Stub the endpoint with valid, invalid, slow, and failing responses, and confirm that only validated, curriculum-approved advice is ever used.

**Acceptance Scenarios**:

1. **Given** the adviser is disabled, offline, slow past the timeout, rate-limited, or returning invalid JSON, **When** a decision is made, **Then** the local policy decides alone (reason `ADVISER_UNAVAILABLE`) and the child sees no error.
2. **Given** advice naming a skill, item, or foil not in the approved dataset, **When** it is validated, **Then** that part is discarded and logged.
3. **Given** valid advice, **When** it is applied, **Then** it only reorders or selects among options the local policy already deems eligible (reason `ADVISER_ACCEPTED`). It never changes scoring, mastery, or correct answers.
4. **Given** any adviser request, **When** it is sent, **Then** it contains only a pseudonymous ID and aggregated per-skill and per-foil-type statistics.

---

### User Story 5 - Offline PWA and resume (Priority: P2)

The game installs as a PWA, reloads offline, and resumes progress.

**Independent Test**: Load once, go offline, reload, play a question, close, and reopen.

**Acceptance Scenarios**:

1. **Given** cached assets, **When** offline and reloaded, **Then** the home screen, content, audio, gameplay, adaptive decisions, and saved progress all work.

### Edge Cases

- An item whose foils are all the same tier when scaffolding is needed: the policy reduces the number of choices without inventing a tier order.
- A skill with too few unseen items for a transfer check: the transfer check is skipped (reason `TRANSFER_UNAVAILABLE`).
- L1-transfer foils (`L1-*` codes): served as listed. The general alternatives are not in the dataset, so no swapping is done (see FR-024).
- A content version changes between sessions: events keep their content version, and the learner model ignores items that no longer exist.
- Missing audio for one word: the question stays usable with a visible replay state.

## Requirements *(mandatory)*

### Functional Requirements

**Content**

- **FR-001**: A repeatable import script MUST convert all five spreadsheet sheets into a normalized, versioned JSON dataset without modifying the source spreadsheet.
- **FR-002**: Items MUST preserve level, item number, sequence in level, skill pattern, target, the 3 foils with their raw type codes, the real-word foil count, the L1-transfer foil count, and the design note.
- **FR-003**: The FoilCodebook (code, name, definition, example, probe, difficulty tier) and LevelGuide MUST be imported as data, and every foil code MUST resolve to a codebook entry.
- **FR-004**: Validation MUST report the row and field for missing values, unknown codes, duplicate IDs, duplicate choices, sequence gaps, and mismatches against the Summary sheet's per-level counts. An invalid dataset MUST fail the build.
- **FR-005**: Design notes and research notes MUST NOT be shown to children.

**Gameplay**

- **FR-006**: The game MUST present one target plus its approved foils, shuffled with an injectable random source.
- **FR-007**: The game MUST evaluate answers by comparing against the item's target, with protection against duplicate taps.
- **FR-008**: The game MUST apply the retry, star, and unlock rules from the Clarifications.
- **FR-009**: Audio MUST sit behind an `AudioProvider` interface. Bundled MP3s are the primary provider and browser speech is a best-effort fallback.

**Learner model and adaptive policy**

- **FR-010**: The game MUST persist every attempt as a learning event in local storage (IndexedDB) with a schema version.
- **FR-011**: The learner model MUST compute per-skill and per-foil-type accuracy, attempt counts, recency, and error patterns, as pure functions of the events.
- **FR-012**: An error pattern MUST require repeated evidence that meets configurable thresholds. A single mistake MUST never trigger one.
- **FR-013**: The adaptive policy MUST be a pure, deterministic function of learner state, content, configuration, a clock, and a seeded random source.
- **FR-014**: The policy MUST support these strategies: focused practice, scaffolding, consolidation, mixed practice, spaced review, transfer, and gradual introduction.
- **FR-015**: The policy MUST only select approved items and foils. Scaffolding MAY show a subset of an item's approved foils and MUST NOT add foils from other items unless that is explicitly approved (see FR-024).
- **FR-016**: Every decision MUST record a reason code from a closed, versioned enumeration, along with its evidence.
- **FR-017**: All thresholds MUST live in a versioned policy configuration. Unconfirmed values MUST be marked provisional.
- **FR-018**: Mastery MUST NOT be declared from a small number of answers. The minimum evidence is part of the policy configuration.

**AI adviser**

- **FR-019**: The adviser MUST be a server-side endpoint holding the Gemini key in environment secrets. The client MUST NOT hold the key.
- **FR-020**: Requests and responses MUST be schema-validated at runtime on both server and client.
- **FR-021**: Adviser calls MUST have timeouts, rate limits, and safe fallbacks to local rules.
- **FR-022**: Adviser requests MUST contain only minimal data: a pseudonymous ID and aggregates, with no names, free text, or raw events.
- **FR-023**: The adviser MUST NOT score, declare mastery, change answers, or produce questions that reach a child without validation.

**Open**

- **FR-024**: Whether foils may be drawn from other items' approved foils, and how the general alternatives to L1 foils are supplied, is [NEEDS CLARIFICATION: approved foil pool beyond each item's 3].
- **FR-025**: The numeric thresholds for error patterns, readiness, mastery, tier unlock, review intervals, and transfer are [NEEDS CLARIFICATION: confirmed pedagogical thresholds]. Until confirmed, they ship as provisional configuration and are clearly labeled.
  - Provisional learner-model values in use (`src/learner/config.ts`, version `learner-model/1-provisional`), awaiting confirmation:
    - **Error pattern:** a foil type counts as a pattern when it was picked at least **3** times, across at least **2** different words, at a rate of at least **30%**, within the last **10** questions where that foil type was on screen.
    - **First choices only:** only the first choice in each question counts as evidence, because retries come after a wrong tile is disabled.
    - **Evidence floor:** a skill with fewer than **8** questions is reported as "insufficient evidence".
    - **Hard limits:** the settings check refuses `minErrors < 2` and `minDistinctItems < 2`, so a single mistake, or a single tricky word, can never be a pattern.

### Key Entities

- **ContentDataset**: the content version, levels, items, foil codebook, level guide, and source checksum.
- **Item**: a stable ID, level, sequence, skill ID, target, and foils (word, code, tier).
- **FoilType**: code, name, definition, difficulty tier, and whether it is an L1 transfer.
- **LearningEvent**: an immutable record of one attempt.
- **LearnerModel**: derived per-skill and per-foil-type statistics and detected patterns.
- **AdaptiveDecision**: the selected item, the foils presented, the strategy, the reason code, the evidence, and the policy version.
- **PolicyConfig**: versioned thresholds, each flagged as provisional or confirmed.
- **Advice**: validated output from the adviser, its provenance, and whether it was accepted or rejected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 200 spreadsheet items import with 0 validation errors, and the per-level foil-type counts match the Summary sheet.
- **SC-002**: 100% of adaptive decisions in tests carry a valid reason code and are reproducible from the same seed and state.
- **SC-003**: No test scenario produces a question containing a word outside the approved dataset, including scenarios with adversarial adviser output.
- **SC-004**: With the network disabled, a child can complete a full level and have progress and events restored after a reload.
- **SC-005**: An adviser failure adds no child-visible delay beyond the configured timeout and shows no error.

## Assumptions

- The first target is a responsive web app/PWA. Integration with the Curious Reader Android WebView is a later, separate spec.
- English only. Audio assumes General American pronunciation, per the spreadsheet's own caution.
- Speeling Game 2's 200 MP3s are synthetic (Edge TTS). They are acceptable as bundled audio until human recordings are available.
- "Skill" means the LevelGuide skill pattern, one per level. Finer-grained skill tagging is not in the dataset.
- Resume restores at the puzzle level, not mid-question.
- Visual assets use placeholders until the mascot and art files are supplied.
