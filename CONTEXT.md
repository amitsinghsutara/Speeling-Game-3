# Spelling Adventure: domain glossary

Use these terms as written, in code, docs, issues and tests.

| Term | Meaning |
|---|---|
| **Item** | One row of the curriculum spreadsheet: a target word plus its three foils. Id `item-NNN`, from the spreadsheet's Item #. |
| **Target** | The correctly spelled word the child hears and must find. |
| **Foil** | An approved wrong spelling shown beside the target (for example `sit` for target `sat`). Foils come only from the spreadsheet. |
| **Foil code** | The FoilCodebook code of a foil's error type: `V`, `FC`, `IC`, `PH`, `OM`, `L1-RL`… Meanings and tiers live in the codebook, never in code. |
| **Tier** | The codebook's difficulty for a foil code, from 1 (easy) to 4 (hardest). "Harder foils" means tier 3 or above. |
| **Level / skill** | A curriculum level (1–10), each with one skill pattern, for example "CVC, short vowels". Skill id `level-N`. |
| **Puzzle** | A level is split into up to 5 puzzles of curriculum-ordered new words. Stars and unlocks are per puzzle. |
| **Question** | One shown item with a chosen set of foils, produced by one adaptive decision. |
| **Attempt** | One tap on an answer tile. A question has one or more attempts and ends on the target. |
| **Learning event** | A stored record of one attempt (`src/learner/events.ts`), kept on the device. |
| **Learner model** | Statistics derived from learning events: per skill, per foil code, per item, plus error patterns (`src/learner/model.ts`). |
| **Error pattern** | A foil code the child keeps choosing, with repeated evidence across different words. Never from a single mistake. |
| **Adaptive decision** | The policy's choice of the next question: item, foils, strategy, presentation, reason codes, evidence. Stored on the device. |
| **Strategy** | Why this word: `CONTINUE_SEQUENCE`, `FOCUS_ERROR_PATTERN`, `SPACED_REVIEW`, `TRANSFER_CHECK`, `CONSOLIDATE` or `MIXED_PRACTICE`. |
| **Presentation** | Why these choices: `FULL_SET`, `SCAFFOLD_REDUCE_CHOICES`, `HOLD_HARDER_FOILS` or `INTRODUCE_NEW_CHALLENGE`. |
| **Extra** | A question chosen by any strategy other than `CONTINUE_SEQUENCE`. Extras never cost stars; at most 3 per puzzle. |
| **Adviser** | The optional Gemini helper during play. It may only choose among options the policy already allows. |
| **Insights / Suggestions** | The grown-ups' summary and home ideas: AI first, with the game's own rules as the fallback. |
| **Provisional** | A threshold or rule not yet confirmed by a curriculum owner. Flagged in config and on every decision. |
| **Container** | The native Android app that hosts the game in a WebView and exposes `window.Android`. |
