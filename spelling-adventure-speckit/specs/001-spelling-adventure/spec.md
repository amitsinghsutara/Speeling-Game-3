# Feature Specification: Spelling Adventure

**Status:** Draft — clarify open decisions before implementation  
**Feature branch suggestion:** `001-spelling-adventure`

## 1. Summary
Create a responsive, forest-themed spelling and phonics game for early readers. A learner selects a level, listens to a target word, chooses the matching spelling from answer tiles, receives encouraging feedback, earns stars, and continues through the level.

The game must use the supplied spreadsheet as the source of truth for target words and distractor/foil words.

## 2. Problem
Early readers benefit from short, focused listening-and-spelling activities with carefully selected distractors. The game should make this practice inviting while preserving the instructional intent of each word and foil.

## 3. Goals
- Deliver a friendly, polished game experience suitable for children.
- Present the correct target word among the configured foils for each item.
- Let the learner replay the target audio.
- Give clear, encouraging feedback after an answer.
- Track level/item progress and earned stars locally.
- Work offline after the app and its required assets have been cached.
- Keep content and game logic testable independently of presentation.

## 4. Non-goals for the first release
- User accounts or cloud synchronization.
- Remote AI analysis or AI-generated advice about an individual child.
- Multiplayer, social features, leaderboards, advertising, or in-game purchases.
- A content-authoring backend.
- Guaranteeing identical pronunciation across all browsers/devices without bundled audio.
- Android-specific integration until the target WebView/native bridge requirements are confirmed.

## 5. Intended user and environment
- Primary user: a young child practicing early spelling/phonics.
- Secondary user: a parent, caregiver, or educator starting the game and observing progress.
- Primary environment: mobile and desktop browsers; PWA installation may be supported.
- Design direction: forest adventure, Fern the fox mascot, friendly natural colors, wooden sign/panel motifs, clear high-contrast answer tiles, stars and gentle celebrations.

## 6. User journeys

### Journey A: Start a game
1. The learner opens the game.
2. The home screen presents the game title, a clear start action, and the mascot.
3. The learner chooses an available level or resumes the current level if resume is supported.
4. The first question is shown.

### Journey B: Answer a question
1. The game displays a question state with a prominent audio/replay button.
2. The game plays the target word using the configured audio provider.
3. The learner chooses one of the answer tiles.
4. The game evaluates the choice against the item's target word.
5. The game displays supportive feedback and updates progress/stars according to the agreed scoring rules.
6. The learner proceeds to the next item.

### Journey C: Replay audio
1. The learner activates the audio button.
2. The same target word is played again.
3. The game prevents overlapping playback or handles it predictably.
4. If audio is unavailable, the game shows a helpful non-blocking message and leaves the spelling question usable.

### Journey D: Complete a level
1. The learner answers the final item in a level.
2. The game shows a completion screen with the level result and earned stars.
3. The learner can continue to the next unlocked level or return to level selection.
4. Completion and progress are persisted locally.

### Journey E: Resume after closing
1. The learner closes or refreshes the app.
2. On returning, the game restores saved progress where possible.
3. Corrupt or outdated saved state is handled safely, without crashing the game.

## 7. Functional requirements

### FR-1: Content loading
- Load levels and items from a bundled, version-controlled data file.
- Preserve spreadsheet fields where relevant: level, item number, sequence in level, skill/spelling pattern, target word, foil words, foil types, foil counts, and design notes.
- Validate unique item identity, required fields, word values, level ordering, and foil count.
- Do not silently fabricate missing rows. Incomplete rows must be reported and excluded from a production build until corrected or explicitly marked incomplete.
- Keep design notes available to developers/content reviewers but do not display them to children.

### FR-2: Question construction
- A question uses one target word and its configured foils.
- Include the correct target exactly once among answer choices.
- Do not duplicate answer choices.
- Shuffle choice order per question/session while ensuring the correct answer is not always in the same position.
- Never alter foil spelling to make a question easier unless the content dataset is deliberately updated and reviewed.

### FR-3: Level and item progression
- Present available levels and their completion state.
- Present items in the sequence specified by the dataset unless a future requirement explicitly introduces adaptive sequencing.
- Prevent accidental duplicate advancement from repeated taps.
- Define and test what happens at the final item of a level.
- If unlock rules are used, make them explicit and deterministic.

### FR-4: Audio
- Expose audio through an interface such as `speakTarget(word, itemId)` or `playTargetAudio(item)`.
- Prefer bundled recorded audio for consistent pronunciation and reliable offline behavior.
- If browser speech synthesis is used, feature-detect it and treat it as best-effort; it may be unavailable or behave differently in embedded Android WebViews.
- Support an optional native Android TTS bridge only if that integration is explicitly enabled and documented.
- Do not use user-agent detection as the sole signal that a native bridge exists.
- Provide loading, playing, unavailable, and error states as appropriate.
- Audio failure must not crash or permanently block the game.

### FR-5: Answer feedback
- Correct answers receive warm, clear positive feedback.
- Incorrect answers receive gentle, non-shaming feedback and a clear next action.
- Feedback should not rely on color alone.
- Exact retry policy, answer reveal policy, and star scoring remain open decisions to clarify.
- Prevent multiple rapid taps from producing contradictory feedback or multiple progress updates.

### FR-6: Progress and rewards
- Track current level/item, completed items/levels, and stars earned.
- Persist progress locally.
- Handle missing, invalid, or old saved data safely.
- Make scoring deterministic and unit-tested once scoring rules are confirmed.
- Do not claim a child has mastered a skill based solely on a small number of answers.

### FR-7: Offline/PWA behavior
- Bundle the content data and core interface assets with the application.
- Cache the app shell and any required audio/assets using a service worker/PWA strategy.
- Core game flow and local progress must function without network access after the intended initial load/install.
- Show a clear, non-blocking state if some optional asset is not cached.
- Test offline reload, not only offline interaction in an already-open tab.

### FR-8: Responsive UI
- Support small mobile screens, tablets, and desktop browsers.
- Use large answer tiles and generous spacing.
- Keep audio replay easy to find.
- Provide visible focus states, accessible labels, and semantic buttons.
- Respect reduced-motion settings.
- Avoid layout that depends on fixed desktop-only dimensions.

### FR-9: Error handling
- Show a useful fallback if the content file fails validation.
- Prevent broken saved progress from crashing the app.
- Keep errors understandable to developers and non-disruptive to children.
- Do not display stack traces or internal technical errors in the child-facing UI.

## 8. Acceptance scenarios

### Scenario 1: Correct answer appears exactly once
**Given** a valid content item with a target and three distinct foils  
**When** the game constructs answer choices  
**Then** the target appears exactly once, all configured foils appear once, and no choice is duplicated.

### Scenario 2: Choice order varies
**Given** a question with valid choices  
**When** new question instances are generated across sessions  
**Then** the correct choice position is not hard-coded. Tests must verify the shuffling function's invariants rather than relying on probabilistic assertions.

### Scenario 3: Correct answer
**Given** an active question  
**When** the learner selects the target word  
**Then** the game displays positive feedback, records the answer once, and allows progression according to the agreed scoring policy.

### Scenario 4: Incorrect answer
**Given** an active question  
**When** the learner selects a foil  
**Then** the game displays supportive feedback and follows the configured retry/reveal policy without advancing more than once.

### Scenario 5: Audio unavailable
**Given** no usable audio provider is available  
**When** the learner activates replay  
**Then** the app communicates the limitation without crashing, and the learner can still interact with the question.

### Scenario 6: Offline reload
**Given** the app and required assets have been cached  
**When** the device is offline and the app is reloaded  
**Then** the home screen, bundled word content, gameplay, and local progress remain available.

### Scenario 7: Persisted progress
**Given** the learner completes an item and progress is saved  
**When** the app is closed and reopened  
**Then** the app restores the expected progress or safely falls back if the stored data is invalid.

### Scenario 8: Incomplete content
**Given** a spreadsheet row is missing a target or required foil  
**When** the data import/validation process runs  
**Then** it reports the row and field clearly and does not silently create a playable question from incomplete data.

## 9. Quality requirements
- TypeScript strict mode enabled.
- Critical game logic has unit tests.
- UI interactions have component tests.
- No core gameplay network dependency.
- No external analytics or child data transmission by default.
- Build and tests must pass before release.
- Maintain readable code and a concise developer setup guide.

## 10. Open questions for clarification
1. **Platform:** Is release web/PWA only, or must it also run inside the Curious Reader Android WebView container?
2. **Audio:** Are recorded audio files available, or should the first version use browser/native speech as a fallback?
3. **Incorrect answer:** Can the child retry until correct, or does the game reveal the correct answer and move on?
4. **Stars:** Are stars awarded per correct first attempt, per question completed, or by another rule?
5. **Level unlocking:** Are all levels open, or must a child complete one level before unlocking the next?
6. **Progress:** Should the game resume the last question, or resume only at the current level?
7. **Question options:** The example dataset has one target plus three foils. Should every question always have four choices?
8. **Dataset:** What is the authoritative complete spreadsheet/file and how should any incomplete rows be handled?
9. **Languages:** Is the first release English-only?
10. **Visual assets:** Are the existing mascot/background/UI images available as individual files, or should placeholders be used initially?

## 11. Release definition of done
- All agreed acceptance scenarios pass.
- The full content dataset is imported and validated.
- The game works on the agreed target devices/browsers.
- Offline reload and progress persistence have been tested.
- Audio behavior and limitations are documented.
- Automated tests and production build pass.
- No unresolved critical accessibility, content correctness, or privacy issues remain.
