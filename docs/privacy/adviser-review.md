# Privacy review: optional Gemini adviser

**Status:** DRAFT, awaiting approval. The adviser must stay disabled in production until the approval section below is filled in (constitution Principle VI).

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

- **Cloudflare (hosting):** receives the HTTPS request, including the device's **IP address** and normal browser headers, as it does for every page load. The function keeps the IP only in memory for rate limiting (up to 10 minutes, per server instance). It logs no request bodies. Cloudflare's own platform logging follows the Cloudflare account settings.
- **Google (Gemini API):** receives the aggregate JSON above, server-to-server. Google sees Cloudflare's address, not the child's. **Google's use of this data depends on the API tier.** Google's terms have historically allowed content sent through unpaid tiers to be used to improve its products, while paid tiers do not. Check the current Gemini API terms, and use a **billing-enabled (paid) key** if prompts must not be used for training.
- **The device:** keeps the validated advice in memory only. Saved decisions store the advice id and any rejected suggestions, never the model's text.

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
| Approved by | _(name, role)_ |
| Date | _(YYYY-MM-DD)_ |
| Conditions | _(e.g. paid-tier key only; parent notice updated)_ |

The adviser may be enabled in production only once this section is complete.
