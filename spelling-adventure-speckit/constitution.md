# Spelling Adventure — Project Constitution

## Mission
Build a warm, accessible, child-friendly spelling and phonics game that helps early readers listen to a target word, distinguish its spelling from carefully designed foils, and learn through supportive feedback.

## Principles

### 1. Learning correctness before decoration
- Treat the supplied word/foil spreadsheet as the authoritative learning dataset.
- Do not invent, silently correct, or omit target words, foil words, foil types, levels, sequence numbers, or design notes.
- Validate data at import/build time and report malformed rows clearly.
- Preserve the distinction between target words and foils.

### 2. Child-safe, encouraging interaction
- Use positive, non-shaming feedback.
- Never punish a child for an incorrect answer; allow retry or a defined supportive progression.
- Avoid ads, external links, account creation, chat, and unnecessary data collection in the core game.
- Do not expose personal data or send gameplay events off-device by default.

### 3. Accessibility and usability
- Use large, readable text and large touch targets.
- Provide keyboard focus states and semantic controls.
- Do not communicate correctness by color alone; include text, icons, or audio/visual cues.
- Respect reduced-motion preferences and avoid rapid flashing.
- Make the core flow usable on small screens and with touch input.

### 4. Offline-first reliability
- Core gameplay, the word dataset, interface assets, and required audio must work offline after the app has been installed/loaded and cached as designed.
- Never make a network request a prerequisite for answering a question or saving progress.
- Handle missing audio gracefully and provide a visible replay/control state.

### 5. Maintainable engineering
- Use TypeScript with strict typing.
- Keep game logic, word data, audio, persistence, and UI concerns separated.
- Prefer small components and pure functions for answer selection, scoring, and progression.
- Avoid unnecessary dependencies and avoid adding AI/network services to the core gameplay path.
- Add automated tests for critical game rules and data validation.

### 6. Privacy and data minimization
- Keep progress local by default.
- Collect only data needed for the game to function.
- Do not add analytics, remote storage, or AI-based child profiling without an explicit product decision and privacy review.

### 7. Verifiable delivery
- Each feature must have acceptance criteria and tests where practical.
- Do not claim a feature is complete until the implementation is reviewed and the relevant tests pass.
- Document browser/device limitations, especially speech support in embedded WebViews.

## Technical defaults
- React + TypeScript + Vite.
- Responsive web app/PWA.
- Local persistence using a small storage abstraction; choose localStorage for simple preferences/progress or IndexedDB if the data needs justify it.
- Audio behind a typed interface, so bundled audio, browser speech, and a native bridge can be swapped without changing game logic.
- Vitest and React Testing Library for unit/component tests.

## Change control
If a feature conflicts with learning correctness, privacy, accessibility, or offline reliability, stop and resolve the conflict before implementing it.
