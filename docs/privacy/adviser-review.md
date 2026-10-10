# Privacy review: optional Gemini adviser

**Status:** APPROVED 2026-10-10, with open items deferred (see §10). The approver chose to settle the §9 items later.

**Prepared:** 2026-10-10, from the code at commit `521e51d` (`src/adviser/*`, `functions/api/advice.ts`).

**Not legal advice.** This is a technical description of the data flow. Whether it meets COPPA, GDPR-K, local school rules or your organisation's policies needs a decision by whoever is responsible for them.

## 1. What the feature does

On the puzzle map, the game can ask a server function for teaching suggestions:

- which detected error pattern to practise first;
- which eligible words to use;
- which due skill to review;
- which approved foils to keep when the policy is already showing fewer choices.

Suggestions only choose among options the local policy has already allowed, and they are checked against the curriculum twice. Nothing the model writes is ever shown to a child.

## 2. Data flow

```
Child's device ──HTTPS POST /api/advice──▶ Cloudflare Pages Function ──HTTPS──▶ Google Gemini API
   (aggregates only)                       (validates, adds API key)          (generativelanguage.googleapis.com)
        ◀────────── curriculum-checked suggestions ◀────────── model JSON ◀──────────┘
```

## 3. What is sent

The request body is built only by `buildAdviceRequest` in `src/adviser/request.ts`. Its exact keys are pinned by a test. The server forwards only the validated body to Google.

| Field | Content | About the child? |
|---|---|---|
| `currentLevel` | The level number on screen | Yes: current level |
| `skills[]` | Per level: question count, first-try accuracy, recent accuracy (rounded to 2 decimals) | Yes: aggregate performance |
| `foilTypes[]` | Per foil code: times shown, times chosen | Yes: aggregate performance |
| `errorPatterns[]` | Foil code and error rate of each detected pattern | Yes: aggregate performance |
| `dueReviewSkillIds[]` | Levels due for review | Yes: practice timing, coarse |
| `approvedItems[]` | Curriculum words up to the current level, their foils, and `seen` (true/false per word) | Yes: which words were practised |

## 4. What is never sent

- Names, accounts, email addresses or any profile data. The game collects none.
- A learner id, session id, device id, event ids or decision ids.
- Timestamps, response times or the order of answers.
- Free text. Children never type anything.
- The individual learning-event history.

## 5. What each party can see

- **Cloudflare (hosting):** receives the HTTPS request, including the device's **IP address** and normal browser headers, as it does for every page load. The function keeps the IP only in memory for rate limiting (up to 10 minutes, per server instance). It logs no request bodies. Since 2026-10-10 it writes one **metadata line** per request (outcome, model, whether the fallback was used, timings, how many suggestions validation removed), with no body, IP or key. A test enforces this. Cloudflare's own platform logging follows the Cloudflare account settings.
- **Google (Gemini API):** receives the aggregate JSON above, server-to-server. Google sees Cloudflare's address, not the child's. **Google's use of this data depends on the API tier.** Google's terms have historically allowed content sent through unpaid tiers to be used to improve its products, while paid tiers do not. Check the current Gemini API terms, and use a **billing-enabled (paid) key** if prompts must not be used for training.
- **The device:** keeps the validated advice in memory only. The browser console shows `[adviser]` messages (requests, advice, the model's rationale, removed suggestions). They are visible only to someone with developer tools open on that device. Saved decisions store the advice id and any rejected suggestions, never the model's text.

## 6. Retention

| Where | What | How long |
|---|---|---|
| Device | Advice | In memory until the app closes; usable for at most 30 minutes and only for its level |
| Device | Decisions (advice id, rejected suggestions) | With learning events, until reset |
| Server function | Nothing stored; IP in a memory-only rate-limit table | At most 10 minutes per instance |
| Google | Request and response | Per the Gemini API terms for the key's tier (see §5) |

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Re-identifying a child from the request | No identifiers or timestamps; only coarse aggregates and the shared curriculum list |
| Model suggests unsafe or invented content | Curriculum validation on the server and again in the browser; model text is never shown to children; test-covered |
| The adviser affects learning badly | It only chooses among already-eligible options; it cannot change order, scoring, mastery or answers; every decision records its role |
| The key leaks | Stored as a Cloudflare secret, sent only in a server-side request header, never sent to browsers |
| Cost or abuse | Per-device rate limit (best effort), size limit, timeouts, client throttle; add a Cloudflare rate-limiting rule for a hard cap |
| Data used for model training | Use a paid-tier key and confirm the current terms (§5) |

## 8. Kill switch

Set `ADVISER_ENABLED` to anything other than `true` in the Cloudflare project. The next request returns "disabled" and the game carries on with local rules. No redeploy is needed.

## 9. Open items for the approver

- [ ] Confirm the Gemini API tier and terms meet your data-use requirements (§5).
- [ ] Decide whether parents or schools need a notice, or consent, before this is enabled for them.
- [ ] Confirm the Cloudflare account's logging settings are acceptable.

## 10. Approval

| | |
|---|---|
| Approved by | Project owner (amit@sutara.org) |
| Date | 2026-10-10 |
| Conditions | None set. The §9 open items (API tier and terms, parent or school notice, Cloudflare logging) were **deferred by the approver** to be decided later. |
| Model tier | The approver intends to use a **free-tier** Gemini model. Under §5, Google's terms for unpaid tiers may allow it to use the aggregate prompts to improve its products. This was accepted for now, with the §9 decision still to be made. |

| Enabled in production | 2026-10-10: main model `gemini-3.5-flash-lite`, fallback `gemini-3.1-flash-lite`; settings stored as encrypted Cloudflare secrets |

Revisit this section before rolling the adviser out to schools or other organisations.

## 11. Addendum: AI suggestions for grown-ups

**Status:** APPROVED 2026-10-10, with open items deferred (see the approval table below). Enabled in production on the same date.

**Prepared:** 2026-10-10, from `src/insights/*` and `functions/api/insights.ts`.

### What changes

The grown-ups' screen gains a **"Get AI suggestions"** button. When a grown-up presses it, Gemini writes a short summary, tips for detected error patterns, and up to 3 home practice ideas. This is a new use of AI: it **describes a child's practice to an adult**, whereas the adviser in §1 only chooses among options the game already allows. The constitution requires an explicit product decision and this review before it is used. The product owner asked for the feature on 2026-10-10.

### Data sent (`POST /api/insights`)

- **Aggregates:** the same aggregate data as §3 (`stats`, built by the same code).
- **Level labels:** the device's own label for each level the child has started, for example `practising`.
- **Never sent:** the items listed in §4.
- **When it is sent (changed 2026-10-10 at the owner's request, "AI first, local fallback"; the owner confirmed the change the same day):** a request is sent when a grown-up **opens the grown-ups' screen**, after the press-and-hold gate, or presses "Refresh". It is never sent from play screens or in the background.
- **Caching:** a successful answer is reused for up to 10 minutes while the child's data is unchanged, so reopening the screen does not send again. Requests already in flight are shared.
- **Fallback:** if AI is off, offline, slow, rate-limited or fails the safety checks, the same card shows suggestions from the game's own rules (`src/insights/local.ts`). These come from the device's numbers, the in-game hints and the codebook, and nothing is sent.

### Safeguards

| Risk | Mitigation |
|---|---|
| Labelling or "diagnosing" a child (for example dyslexia, ADHD, "behind", "gifted", "mastered") | A banned-term check runs on every text field. One match discards the **whole** result, on the server and again in the browser. Test-covered. |
| Contradicting the device's own numbers | Strengths are kept only for levels the device rates "doing well". Focus areas must be detected error patterns. |
| Suggesting wrong spellings or unapproved words | Home-practice words must be approved **target** words at or below the child's level. Foils and invented words are removed. |
| Links, products, contact details | Any link, email-like address or phone-like number discards the result. |
| Over-trust | Every suggestion is labelled with its source: "AI-generated suggestions: they may not be right", or "From the game's own rules on this device", with the reason AI is not shown. The device's own numbers on the same screen stay the source of truth. |
| Storage | Suggestions are not stored on the device or the server. The server log is metadata only (§5): outcome, model, timings and a removed-item count. |
| Cost or abuse | Its own rate limit (10 per device IP per 10 minutes), a client wait of 30 seconds between requests, timeouts, and the fallback model. |

### Live check (local, real Gemini, 2026-10-10)

`gemini-3.5-flash-lite` answered in about 2 seconds on both runs:

- **Tone:** warm, plain summaries with no labels.
- **Agreement with the device:** no strengths for a level the device rates "still practising".
- **Focus:** only the real vowel pattern.
- **Home ideas:** use approved level-1 words; one wrong-answer word ("pan") was correctly removed.

### Kill switch

Set `INSIGHTS_ENABLED` to anything other than `true`. It is independent of the play adviser.

### Approval of this addendum

| | |
|---|---|
| Approved by | Project owner (amit@sutara.org) |
| Date | 2026-10-10 |
| Conditions | None set. The §9 open items, **including a parent or school notice**, were deferred by the approver. |

The §9 open items (API tier, parent or school notice, logging) apply here too. A parent notice matters more for this feature, because it describes the child's practice to an adult.
