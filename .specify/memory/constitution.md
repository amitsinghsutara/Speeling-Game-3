<!--
Sync Impact Report
- Version change: (unratified template) → 1.0.0
- Source: .specify/constitution.md (starter pack) amended with the adaptive-learning product decision of 2026-10-10
- Modified principles:
  - 5. Maintainable engineering → adds learner model / adaptive policy separation
  - 6. Privacy and data minimization → records the explicit product decision allowing an optional, server-side AI adviser
- Added principles: 8. Pedagogy-first adaptive learning; 9. Bounded AI advice
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read the constitution at runtime) ✅
- Deferred TODOs: privacy review sign-off before the AI adviser is enabled in production
-->

# Spelling Adventure Constitution

## Mission

Build a warm, accessible, child-friendly spelling and phonics game that helps early readers listen to a target word, distinguish its spelling from carefully designed foils, and learn through supportive feedback. The core of the product is a pedagogy-first adaptive learning engine that shapes future challenges from the child's observed progress.

## Core Principles

### I. Learning correctness before decoration

- The supplied word/foil spreadsheet (`English_Spelling_Words_and_Foils.xlsx`) is the authoritative learning dataset, including its FoilCodebook, LevelGuide, and design notes.
- Do not invent, silently correct, or omit target words, foil words, foil types, levels, sequence numbers, or design notes.
- Do not invent curriculum mappings, mastery thresholds, or pedagogical rules. Unconfirmed values are configuration marked as provisional, never hidden constants.
- Validate data at import/build time and report malformed rows clearly.
- Preserve the distinction between target words and foils.

### II. Child-safe, encouraging interaction

- Use positive, non-shaming feedback.
- Never punish a child for an incorrect answer; allow retry or a defined supportive progression.
- Avoid ads, external links, account creation, chat, and unnecessary data collection in the core game.
- Do not expose personal data or send gameplay events off-device by default.

### III. Accessibility and usability

- Use large, readable text and large touch targets.
- Provide keyboard focus states and semantic controls.
- Do not communicate correctness by color alone; include text, icons, or audio/visual cues.
- Respect reduced-motion preferences and avoid rapid flashing.
- Make the core flow usable on small screens and with touch input.

### IV. Offline-first reliability

- Core gameplay, the word dataset, adaptive decisions, interface assets, and required audio MUST work offline after the app has been loaded and cached as designed.
- Never make a network request a prerequisite for answering a question, choosing the next challenge, or saving progress.
- Handle missing audio gracefully and provide a visible replay/control state.

### V. Maintainable engineering

- Use TypeScript with strict typing.
- Keep content, game logic, learner model, adaptive policy, audio, persistence, AI adviser, and UI concerns separated.
- Prefer small components and pure, deterministic functions for answer selection, scoring, progression, and adaptive decisions. Randomness and time are injected.
- Avoid unnecessary dependencies and keep AI/network services out of the core gameplay path.
- Add automated tests for critical game rules, data validation, and adaptive behavior.

### VI. Privacy and data minimization

- Keep progress and learning events local by default.
- Collect only data needed for the game to function and adapt.
- Product decision (2026-10-10): an optional, server-side AI adviser is permitted under Principle IX. It receives only the minimum aggregated, pseudonymous skill-level data needed for a recommendation: no names, free text, device identifiers, or raw event logs.
- The AI adviser MUST NOT be enabled in production until a privacy review is recorded.
- Do not add analytics or remote storage without a further explicit product decision and privacy review.

### VII. Verifiable delivery

- Each feature must have acceptance criteria and tests where practical.
- Do not claim a feature is complete until the implementation is reviewed and the relevant tests pass.
- Document browser/device limitations, especially speech support in embedded WebViews.

### VIII. Pedagogy-first adaptive learning

- Learning events are recorded per item and per phonics skill/foil type.
- Error patterns are inferred only from repeated evidence, never from a single mistake.
- Adaptive strategies (focused practice, scaffolding, consolidation, mixed practice, spaced review, transfer) draw only from approved curriculum content.
- New challenges are introduced gradually, only when readiness criteria are met.
- Every adaptive decision records a reason code and the evidence it used.
- Deterministic local rules are the authoritative decision-maker and the fallback whenever advice is absent, late, or invalid.

### IX. Bounded AI advice

- The AI adviser (Gemini) is optional and advisory: it may recommend a next skill, suggest a strategy, or propose candidate foils.
- All advice is validated against the curriculum and schema before use; anything not in the approved dataset is discarded.
- The AI adviser MUST NOT score answers, declare mastery, change correct answers, or send unvalidated questions to a child.
- The API key lives only in server-side environment secrets. Calls use runtime schema validation, timeouts, and rate limits, and fail safe to local rules.

## Technical Defaults

- React + TypeScript + Vite; responsive web app/PWA.
- Normalized, versioned content dataset generated from the spreadsheet by a repeatable import script.
- Local persistence behind a small storage abstraction: localStorage for preferences and simple progress, IndexedDB for learning events.
- Audio behind a typed interface; bundled recordings are preferred, with browser speech and a native bridge as swappable fallbacks.
- Vitest and React Testing Library for unit/component tests.

## Governance

- This constitution supersedes conflicting guidance in specs, plans, and tasks.
- If a feature conflicts with learning correctness, privacy, accessibility, or offline reliability, stop and resolve the conflict before implementing it.
- Amendments are made through `/speckit-constitution`, recorded in the Sync Impact Report, and versioned semantically: MAJOR for removed or redefined principles, MINOR for new principles or materially expanded guidance, and PATCH for clarifications.
- Plans MUST include a Constitution Check gate; reviews verify compliance.

**Version**: 1.0.0 | **Ratified**: 2026-10-10 | **Last Amended**: 2026-10-10
