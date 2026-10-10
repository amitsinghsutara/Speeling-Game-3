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
import { callGemini, geminiBody } from './gemini.ts'
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
  /** One metadata line per request. Never receives request bodies, IPs or the key. */
  log?: (entry: ServerLogEntry) => void
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

export const geminiRequestBody = (request: AdviceRequest) =>
  geminiBody({ systemInstruction: SYSTEM_INSTRUCTION, responseSchema: GEMINI_RESPONSE_SCHEMA, input: request, maxOutputTokens: 1024 })

/** Metadata only: what happened, which model, how long. Safe to keep in platform logs. */
export interface ServerLogEntry {
  event: 'advice'
  outcome: 'ok' | 'unavailable'
  reason?: string
  model?: string
  fallbackUsed?: boolean
  attempts?: { model: string; outcome: string; ms: number }[]
  rejectedSuggestions?: number
  totalMs: number
}

export async function handleAdviceRequest(request: Request, env: AdviserEnv, deps: ServerDeps): Promise<Response> {
  const started = deps.now()
  const log = (entry: Omit<ServerLogEntry, 'event' | 'totalMs'>) => deps.log?.({ event: 'advice', ...entry, totalMs: deps.now() - started })
  const refuse = (reason: string, status: number) => {
    log({ outcome: 'unavailable', reason })
    return unavailable(reason, status)
  }

  if (request.method !== 'POST') return refuse('method-not-allowed', 405)
  if (env.ADVISER_ENABLED !== 'true') return refuse('disabled', 503)
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return refuse('not-configured', 503)
  const base = geminiBase(env)
  if (!base) return refuse('not-configured', 503)

  const clientKey = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (!deps.rateLimiter.allow(clientKey, deps.now())) return refuse('rate-limited', 429)

  const text = await request.text()
  if (text.length > LIMITS.requestBytes) return refuse('too-large', 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return refuse('bad-json', 400)
  }
  const parsed = adviceRequestSchema.safeParse(body)
  if (!parsed.success) return refuse('bad-request', 400)

  // The main model first, then the fallback once, all inside one time budget that ends
  // before the browser gives up. Any failure on the last model means "no advice".
  let rejected: string[] = []
  const result = await callGemini(
    {
      base,
      key: env.GEMINI_API_KEY,
      models: [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL],
      systemInstruction: SYSTEM_INSTRUCTION,
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      input: parsed.data,
      maxOutputTokens: 1024,
      budgetMs: deps.budgetMs ?? GEMINI_BUDGET_MS,
      timeoutMs: deps.timeoutMs ?? GEMINI_TIMEOUT_MS,
      invalidReason: 'invalid-advice',
      parse: (raw) => {
        const validated = validateAdvice(raw, { content: deps.content, request: parsed.data, adviceId: deps.newId(), receivedAt: deps.now() })
        if (!validated) return null
        rejected = validated.rejected
        // Only curriculum-checked fields go back; the browser validates them again.
        const advice: RawAdvice = {
          focusFoilCode: validated.focusFoilCode,
          reviewSkillId: validated.reviewSkillId,
          preferItemIds: validated.preferItemIds,
          candidateFoils: validated.candidateFoils,
          rationale: validated.rationale,
        }
        return advice
      },
    },
    deps,
  )
  if (result.kind === 'ok') {
    log({ outcome: 'ok', model: result.model, fallbackUsed: result.attempts.length > 1, attempts: result.attempts, rejectedSuggestions: rejected.length })
    return json({ status: 'ok', model: result.model, advice: result.value, rejected }, 200)
  }
  log({ outcome: 'unavailable', reason: result.reason, attempts: result.attempts })
  return unavailable(result.reason, result.status)
}
