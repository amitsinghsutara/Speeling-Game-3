# AI features (Gemini)

There are two optional features. Both have a kill switch, and both send aggregates only.

| | Play adviser | Grown-ups' suggestions |
|---|---|---|
| What it does | Helps the policy choose among already-eligible options | Writes a summary, focus tips and home ideas for adults |
| When it asks | In the background on the puzzle map (at most every 2 minutes) | When a grown-up opens the grown-ups' screen, or presses Refresh |
| Endpoint | `POST /api/advice` | `POST /api/insights` |
| Server switch | `ADVISER_ENABLED=true` | `INSIGHTS_ENABLED=true` |
| Browser switch | `VITE_ADVISER_ENABLED=true` | `VITE_INSIGHTS_ENABLED=true` |
| If unavailable | Local rules decide alone (`ADVISER_UNAVAILABLE`) | Suggestions from the game's own rules (`src/insights/local.ts`) |
| Code | `src/adviser/` | `src/insights/` |

Both browser switches are set in `.env.adviser`, used by `npm run deploy:adviser`. Production status and approvals are recorded in the [privacy review](privacy/adviser-review.md).

## Models

| Setting | Value (production, 2026-10-10) |
|---|---|
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite`, tried once if the main model fails, is rate-limited, is slow or returns bad output |
| `GEMINI_API_KEY` | Cloudflare secret. Never in the browser, never logged, sent only in the `x-goog-api-key` header |

To list the models your key can use, run `npm run gemini:models -- lite`. It reads the key from `.dev.vars` and never prints it.

Both features call Gemini through `src/adviser/gemini.ts`. It tries the main model and then the fallback inside one **7-second budget**, with a **4.5-second** limit per attempt, and asks for JSON that matches a response schema.

## What is sent

`src/adviser/request.ts` builds the request, and tests pin its exact keys. It contains:

- current level;
- per-skill counts and accuracies;
- per-foil-code shown and chosen counts;
- detected patterns;
- skills due for review;
- the approved word list up to the current level, with a `seen` flag.

Insights add the device's own label for each started level.

**Never sent:** learner, session, device or event ids; timestamps; answer history; free text.

## Validation

Every AI output is checked on the server **and again in the browser**; the browser never trusts the server alone.

**Play advice** (`src/adviser/validate.ts`):

- **Focus foil code:** must be a detected pattern.
- **Review skill:** must be due.
- **Words:** must be approved, offered, and at or below the current level.
- **Candidate foils:** must be that word's own approved foils.
- **Rejected items** are dropped and listed.

The policy then only lets advice narrow candidates it already allowed (`preferAdvised` in `src/adaptive/policy.ts`).

**Grown-ups' suggestions** (`src/insights/validate.ts`):

- **Unsafe language:** labelling or diagnostic terms anywhere discard the whole result. The banned list (`BANNED_TERMS`) covers diagnoses, "behind", "gifted", "mastered", "normal" and similar.
- **Links:** links, email-like or phone-like text discard the result.
- **Strengths:** kept only for levels the device rates "doing well".
- **Focus areas:** must be detected patterns.
- **Practice words:** must be approved **targets** at or below the child's level. Foils and invented words are removed.
- **Length:** text is trimmed to set limits.

## Timeouts, limits and caching

| | Adviser | Insights |
|---|---|---|
| Browser timeout | 8 s | 10 s |
| Browser minimum interval | 2 min | 30 s |
| Reuse | Used only for its level, for up to 30 min | Same data reused for up to 10 min; requests in flight are shared |
| Server rate limit | 20 per IP per 10 min | 10 per IP per 10 min |
| Request size limit | 32 KB | 40 KB |

The server rate limits are best effort, because each serverless instance keeps its own count. For a hard cap, add a Cloudflare rate-limiting rule.

## Logs

- **Browser console:** filter on `[adviser]` or `[insights]`. You see the request summary, the answer (model, latency, content, what validation removed), and failures with their reasons. For the adviser, you also see each decision that used the advice.
- **Server log:** one JSON line per request (`"event":"advice"` or `"event":"insights"`). It holds the outcome, model, fallback used, per-attempt timings, removed counts and total time. It **never** includes the body, the IP or the key; tests enforce this.

  ```bash
  npx wrangler pages deployment tail --project-name=spelling-adventure
  ```

## Local testing

See [Operations → Local testing](operations.md#local-testing-with-the-pages-functions). You can use the real API with your key in `.dev.vars`, or the fake Gemini (`npm run mock:gemini`), which deliberately invents a word and a foil so you can watch validation remove them.

## Rules that must not change without a privacy review

- AI never scores, declares mastery, changes answers, or sends unvalidated content to a child.
- AI is never on the child's path: play never waits for it.
- Requests stay aggregate-only.
- Insights are requested only from the grown-ups' screen.
