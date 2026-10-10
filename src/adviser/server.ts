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
  timeoutMs?: number
}

export const GEMINI_TIMEOUT_MS = 6000

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

  let upstream: Response
  try {
    upstream = await deps.fetch(
      `${base}/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(geminiRequestBody(parsed.data)),
        signal: AbortSignal.timeout(deps.timeoutMs ?? GEMINI_TIMEOUT_MS),
      },
    )
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return unavailable(timedOut ? 'upstream-timeout' : 'upstream-unreachable', timedOut ? 504 : 502)
  }
  if (!upstream.ok) return unavailable(`upstream-${upstream.status}`, 502)

  let raw: unknown
  try {
    const answer = geminiText(await upstream.json())
    raw = answer === null ? null : JSON.parse(answer)
  } catch {
    raw = null
  }
  const validated = validateAdvice(raw, { content: deps.content, request: parsed.data, adviceId: deps.newId(), receivedAt: deps.now() })
  if (!validated) return unavailable('invalid-advice', 502)

  // Only curriculum-checked fields go back; the browser validates them again.
  const advice: RawAdvice = {
    focusFoilCode: validated.focusFoilCode,
    reviewSkillId: validated.reviewSkillId,
    preferItemIds: validated.preferItemIds,
    candidateFoils: validated.candidateFoils,
    rationale: validated.rationale,
  }
  return json({ status: 'ok', advice }, 200)
}
