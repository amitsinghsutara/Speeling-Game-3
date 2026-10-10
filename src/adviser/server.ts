/**
 * Server side of the adviser: validates the request, asks Gemini for advice,
 * validates the answer against the curriculum, and fails safe. Runtime-agnostic
 * (only fetch/Request/Response), so the Pages Function is a thin wrapper and
 * tests can run it directly.
 *
 * The API key never leaves this side. Request bodies are never logged.
 */
import type { ContentDataset } from '../content/schema.ts'
import { LIMITS, adviceRequestSchema, type AdviceRequest, type AdviceResponse, type RawAdvice } from './schema.ts'
import { validateAdvice } from './validate.ts'

export interface AdviserEnv {
  /** Must be exactly "true" to enable. Off by default (constitution VI: privacy review first). */
  ADVISER_ENABLED?: string
  /** Secret; set with `wrangler pages secret put GEMINI_API_KEY`. */
  GEMINI_API_KEY?: string
  /** Required: the Gemini model id to call. Not defaulted, so nothing is guessed. */
  GEMINI_MODEL?: string
  /** Optional: tried once if the main model fails (unavailable, rate-limited, timeout or bad output). */
  GEMINI_FALLBACK_MODEL?: string
  /** Local testing only: point at a fake Gemini on this machine. Leave unset in production. */
  GEMINI_API_BASE?: string
}

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com'

/**
 * The API key is only ever sent to Google's real endpoint or to this machine
 * (for the local fake). Any other base is treated as misconfiguration.
 */
export function geminiBase(env: Pick<AdviserEnv, 'GEMINI_API_BASE'>): string | null {
  const base = (env.GEMINI_API_BASE ?? GEMINI_API_BASE).replace(/\/+$/, '')
  if (base === GEMINI_API_BASE) return base
  try {
    const url = new URL(base)
    const local = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    return local && url.pathname === '/' ? base : null
  } catch {
    return null
  }
}

export interface ServerDeps {
  fetch: typeof fetch
  now: () => number
  newId: () => string
  content: ContentDataset
  rateLimiter: RateLimiter
  /** Per-model limit. */
  timeoutMs?: number
  /** Total time for the main model and the fallback together. */
  budgetMs?: number
}

/** Per attempt. */
export const GEMINI_TIMEOUT_MS = 4500
/** Both attempts together; ends before the browser's 8 s timeout. */
export const GEMINI_BUDGET_MS = 7000

/** Best-effort, per-instance sliding window. Serverless instances do not share it; see README. */
export interface RateLimiter {
  allow(key: string, now: number): boolean
}

export function slidingWindowLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    allow(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= maxRequests) {
        hits.set(key, recent)
        return false
      }
      recent.push(now)
      hits.set(key, recent)
      if (hits.size > 10_000) hits.clear() // bound memory under abuse
      return true
    },
  }
}

const json = (body: AdviceResponse, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const unavailable = (reason: string, status: number) => json({ status: 'unavailable', reason }, status)

export const SYSTEM_INSTRUCTION = `You advise a spelling game for 5-8 year olds. You receive aggregate statistics about one child's practice and the approved word list.
Rules:
- Only use itemIds, foil words, foil codes and skillIds that appear in the input. Never invent words.
- focusFoilCode: one of the input errorPatterns' foilCode values to practise first, or null.
- reviewSkillId: one of dueReviewSkillIds, or null.
- preferItemIds: up to ${LIMITS.preferItemIds} approved itemIds that would help most (prefer seen words for practice).
- candidateFoils: up to ${LIMITS.candidateFoils} {itemId, word} pairs, using only that item's listed foils, best for an easier version of the question.
- rationale: one short sentence for the teacher (max ${LIMITS.rationaleChars} characters). It is never shown to the child.
You do not score answers, judge mastery, or write questions. Return only JSON matching the schema.`

/** Gemini response schema (OpenAPI subset), mirroring rawAdviceSchema. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    focusFoilCode: { type: 'STRING', nullable: true },
    reviewSkillId: { type: 'STRING', nullable: true },
    preferItemIds: { type: 'ARRAY', items: { type: 'STRING' } },
    candidateFoils: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { itemId: { type: 'STRING' }, word: { type: 'STRING' } }, required: ['itemId', 'word'] },
    },
    rationale: { type: 'STRING' },
  },
  required: ['focusFoilCode', 'reviewSkillId', 'preferItemIds', 'candidateFoils', 'rationale'],
} as const

export function geminiRequestBody(request: AdviceRequest) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(request) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  }
}

/** Pulls the JSON text out of a generateContent response; null if the shape is unexpected. */
function geminiText(body: unknown): string | null {
  const candidates = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates
  const parts = candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
  return text.length > 0 ? text : null
}

export async function handleAdviceRequest(request: Request, env: AdviserEnv, deps: ServerDeps): Promise<Response> {
  if (request.method !== 'POST') return unavailable('method-not-allowed', 405)
  if (env.ADVISER_ENABLED !== 'true') return unavailable('disabled', 503)
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return unavailable('not-configured', 503)
  const base = geminiBase(env)
  if (!base) return unavailable('not-configured', 503)

  const clientKey = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (!deps.rateLimiter.allow(clientKey, deps.now())) return unavailable('rate-limited', 429)

  const text = await request.text()
  if (text.length > LIMITS.requestBytes) return unavailable('too-large', 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return unavailable('bad-json', 400)
  }
  const parsed = adviceRequestSchema.safeParse(body)
  if (!parsed.success) return unavailable('bad-request', 400)

  // The main model first, then the fallback once, all inside one time budget that ends
  // before the browser gives up. Any failure on the last model means "no advice".
  const models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter((m): m is string => !!m && m.length > 0)
  const deadline = deps.now() + (deps.budgetMs ?? GEMINI_BUDGET_MS)
  let failure = { reason: 'upstream-unreachable', status: 502 }
  for (const model of [...new Set(models)]) {
    const remaining = deadline - deps.now()
    if (remaining <= 0) break
    const attempt = await askModel(base, model, env.GEMINI_API_KEY, parsed.data, Math.min(remaining, deps.timeoutMs ?? GEMINI_TIMEOUT_MS), deps)
    if (attempt.kind === 'advice') return json({ status: 'ok', model, advice: attempt.advice }, 200)
    failure = attempt
  }
  return unavailable(failure.reason, failure.status)
}

type Attempt = { kind: 'advice'; advice: RawAdvice } | { kind: 'failed'; reason: string; status: number }

async function askModel(
  base: string,
  model: string,
  key: string,
  request: AdviceRequest,
  timeoutMs: number,
  deps: ServerDeps,
): Promise<Attempt> {
  let upstream: Response
  try {
    upstream = await deps.fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(geminiRequestBody(request)),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return timedOut ? { kind: 'failed', reason: 'upstream-timeout', status: 504 } : { kind: 'failed', reason: 'upstream-unreachable', status: 502 }
  }
  if (!upstream.ok) return { kind: 'failed', reason: `upstream-${upstream.status}`, status: 502 }

  let raw: unknown
  try {
    const answer = geminiText(await upstream.json())
    raw = answer === null ? null : JSON.parse(answer)
  } catch {
    raw = null
  }
  const validated = validateAdvice(raw, { content: deps.content, request, adviceId: deps.newId(), receivedAt: deps.now() })
  if (!validated) return { kind: 'failed', reason: 'invalid-advice', status: 502 }

  // Only curriculum-checked fields go back; the browser validates them again.
  return {
    kind: 'advice',
    advice: {
      focusFoilCode: validated.focusFoilCode,
      reviewSkillId: validated.reviewSkillId,
      preferItemIds: validated.preferItemIds,
      candidateFoils: validated.candidateFoils,
      rationale: validated.rationale,
    },
  }
}
