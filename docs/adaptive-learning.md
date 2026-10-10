# Adaptive learning

The game decides what to ask next from what the child actually did. Everything runs on the device, deterministically. Optional AI advice can only choose among options the rules already allow.

> **Provisional.** Every number on this page is an engineering placeholder awaiting confirmation by a curriculum owner (spec FR-025). The values live in two versioned files, and every saved decision is marked `provisional: true` until they are confirmed:
> - `src/learner/config.ts`
> - `src/adaptive/config.ts`

## 1. Learning events

Every tap on a tile that counts as an attempt stores one event (`src/learner/events.ts`). It includes:

- item, skill and level;
- the foil codes shown;
- the chosen word and foil code;
- whether it was correct;
- the attempt number and response time;
- the content version;
- the id of the decision that produced the question.

**Not counted:** repeat taps on a disabled tile, or taps after the answer.

**Not stored:** names, free text or device ids.

## 2. Learner model

`buildLearnerModel(events, content, config)` is a pure function that produces:

- **Per skill:** questions, first-try accuracy, recent accuracy (last 10), distinct words, last seen, and evidence (`none`, `insufficient` below 8 questions, or `enough`).
- **Per foil code:** times shown, times chosen and error rate. Only first choices count, because later choices come after a wrong tile is disabled.
- **Per item:** times seen, last seen, and whether the last try was right first time.
- **Error patterns:** see below.

### Error patterns (repeated evidence only)

A foil code is a pattern when, within the **last 10 questions where it was on screen**, all three of these hold:

- the child picked it **at least 3 times**;
- those picks span **at least 2 different words**;
- they cover **at least 30%** of those questions.

The config refuses values that would allow a single mistake (`minErrors < 2`) or a single word (`minDistinctItems < 2`) to count as a pattern. Patterns fade once recent answers are right.

## 3. The policy

`decideNext()` in `src/adaptive/policy.ts` is pure and deterministic. Ties are broken by a seeded random source.

The policy tries strategies in this order and records why each skipped one was skipped:

| # | Strategy | When | Limit per puzzle |
|---|---|---|---|
| 1 | `FOCUS_ERROR_PATTERN` | An error pattern exists. It picks an eligible word with that foil code, familiar words first, and keeps that foil on screen. | 2 |
| 2 | `SPACED_REVIEW` | An earlier level has not been practised for 24 hours. It picks the weakest, then the oldest, familiar word. | 1 |
| 3 | `TRANSFER_CHECK` | The current skill has enough evidence and recent accuracy of at least 80%. It picks an approved word of that skill **never seen before**. | 1 |
| 4 | `CONTINUE_SEQUENCE` | The puzzle's next new word, in curriculum order. Counts for stars. | – |
| 5 | `CONSOLIDATE` | New words are done, and a word from this puzzle was missed on the first try. | 1 |
| 6 | `MIXED_PRACTICE` | A familiar word from an earlier level. | 1 |

**Shared limits:**

- **Extras:** strategies 1, 2, 3, 5 and 6 share a budget of **3 extras per puzzle**. Extras never cost stars.
- **No immediate repeats:** the policy never asks the word just answered.
- **No stealing:** it never takes the puzzle's next queued word for an extra.
- **End of puzzle:** when nothing applies, the puzzle completes.

### Presentation: which choices to show

These rules live in `src/adaptive/presentation.ts`. They only ever use the word's **own** approved foils, and always show at least **2** foils.

| Reason | Rule |
|---|---|
| `HOLD_HARDER_FOILS` | Tier ≥ 3 foils are held back until the skill has at least 4 questions with recent accuracy of at least 75%. The shape of this rule comes from the spreadsheet's ResearchBasis. |
| `INTRODUCE_NEW_CHALLENGE` | The first time harder tiers are shown in a skill, once the child is ready. |
| `SCAFFOLD_REDUCE_CHOICES` | If at most 1 of the last 3 questions in the skill was right first time, only the **2 easiest foils by tier** are shown. Validated advice may choose which approved foils stay. |
| `FULL_SET` | Otherwise, all of the word's foils. |

### Reason codes

The codes are listed in `src/adaptive/reasons.ts`, which is closed and versioned (version 2). Never rename or reuse a code.

- **Strategy:** `CONTINUE_SEQUENCE`, `FOCUS_ERROR_PATTERN`, `CONSOLIDATE`, `SPACED_REVIEW`, `MIXED_PRACTICE`, `TRANSFER_CHECK`
- **Presentation:** `FULL_SET`, `SCAFFOLD_REDUCE_CHOICES`, `HOLD_HARDER_FOILS`, `INTRODUCE_NEW_CHALLENGE`
- **Skipped:** `NO_ERROR_PATTERN`, `NO_CANDIDATE_WORD`, `EXTRA_BUDGET_USED`, `STRATEGY_LIMIT_REACHED`, `NOT_DUE`, `NOT_READY`, `TRANSFER_UNAVAILABLE`, `NO_EARLIER_SKILL`, `NOTHING_TO_CONSOLIDATE`, and `NEW_WORDS_REMAIN` (defined but not currently used; reserved)
- **Adviser:** `ADVISER_UNAVAILABLE`, `ADVISER_ACCEPTED` (advice narrowed or chose among eligible options), `ADVISER_NOT_APPLICABLE`

### What a decision records

`src/adaptive/decision.ts` defines the record. Each decision stores:

- id, time, policy version, learner-model version, reason-codes version, and the provisional flag;
- puzzle, item and skill;
- the foil words and codes shown;
- strategy and presentation;
- whether it counts for stars;
- evidence: pattern and supporting event ids, skill accuracy, held-back foils;
- the adviser's role;
- every strategy considered and why it was skipped.

Decisions are stored in IndexedDB (`adaptiveDecisions`), and each event links to its decision.

## 4. Tuning

1. Change the values in `src/learner/config.ts` or `src/adaptive/config.ts`.
2. Bump the `version` string.
3. Once a curriculum owner confirms them, set `provisional: false`.
4. Run `npm test`. The scenario tests in `src/adaptive/policy.test.ts` and `src/learner/model.test.ts` show which behaviours change.

Schema checks stop unsafe values, such as a pattern from a single mistake.

## 5. Grown-ups' report

`src/learner/report.ts` turns the learner model into plain language. Its level labels are:

- "Not started"
- "Just getting started (not enough answers yet to say more)"
- "Still practising"
- "Doing well recently" (needs enough evidence and recent accuracy of at least 80%)

It **never** says "mastered", and a test enforces this.
