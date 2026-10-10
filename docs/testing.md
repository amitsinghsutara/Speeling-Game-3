# Testing

```bash
npm run check   # lint (oxlint) + strict typecheck + all tests (Vitest) + content freshness
npm test        # tests only
npm run test:watch
```

Look at the **exit code**, not filtered output. A failing typecheck is easy to miss if you pipe the output through `grep`.

## What is covered

| Area | Where | Highlights |
|---|---|---|
| Content import | `src/content/*.test.ts`, `scripts/import-content.test.ts` | Every validation rule, on a small fixture workbook (`src/test/fixtures/workbook.ts`). The real spreadsheet imports with 0 issues and matches the committed JSON. |
| Audio coverage | `scripts/audio-coverage.test.ts` | Every target word has an MP3; there are no empty or orphan files |
| Game rules | `src/game/*.test.ts` | Target appears exactly once with approved foils, for all 200 items; seeded shuffles; retry and duplicate-tap rules; stars; unlocks; session flow |
| Learner model | `src/learner/*.test.ts` | Evidence levels; patterns need repeated evidence across words; patterns fade; the report never says "mastered" |
| Adaptive policy | `src/adaptive/policy.test.ts` | One scenario per strategy and presentation rule, determinism, and a 150-trial "approved content only" property test |
| AI adviser | `src/adviser/adviser.test.ts` | Request privacy; validation; disabled or unconfigured; timeouts; outages; junk output; rate limits; fallback model; key routing; logs never contain body, IP or key |
| AI suggestions | `src/insights/insights.test.ts` | Banned-language and contradiction checks; approved-word filtering; fallback model; browser re-validation; cache and in-flight sharing; local suggestions pass the same checks |
| Storage | `src/persistence/*.test.ts` | IndexedDB round-trip, migration to v2, corrupt records skipped, memory fallback, reset |
| App flows | `src/App.test.tsx` | A full puzzle journey, sounds, exit dialog, updates, learning events, grown-ups screen and reset, AI-first suggestions with fallback |
| Accessibility | `src/a11y.test.tsx`, `scripts/contrast.test.ts` | axe-core on every screen and dialog (0 violations); WCAG contrast computed from theme tokens |
| UI pieces | `src/ui/**/*.test.tsx` | Press feedback on touch, hold-to-open gate, shared tile text size |

## Conventions

- **Inject randomness, time and ids.** Use `seededRandom(seed)`, `now`, `newId`. Assert exact results instead of probabilities.
- **Test rules with fixtures, and the real data separately.**
  - `answerEvents()` and `correctAnswers()` in `src/test/fixtures/events.ts` build learning histories. Fixture ids are zero-padded, so string order matches creation order.
  - `validWorkbook()` builds a consistent workbook to break one thing at a time.
- **Mutation-check new rules.** Temporarily break the rule in the code, confirm a test fails, then restore it. These rules were checked this way: distinct words for patterns, first choice only, never repeat the last word, the tier gate, scaffolding, and banned language.
- **Long UI journeys** may need a larger timeout, for example `it(..., 15_000)`, because screen changes wait for the 120 ms press delay.

## Manual checks still needed

- On a real phone, and inside the container WebView (task T019c).
- Offline on a device: install, go to airplane mode, relaunch.
- Audio pronunciation, in the target dialect.
