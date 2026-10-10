/**
 * Server side of the grown-ups' AI suggestions: POST /api/insights.
 * Same safeguards as the adviser (secret key, timeouts, fallback model, rate
 * limit, metadata-only logs) plus its own switch, INSIGHTS_ENABLED.
 */
import { callGemini } from '../adviser/gemini.ts'
import { GEMINI_BUDGET_MS, GEMINI_TIMEOUT_MS, geminiBase, type AdviserEnv, type ServerDeps } from '../adviser/server.ts'
import { INSIGHT_LIMITS, insightsRequestSchema, type InsightsResponse } from './schema.ts'
import { validateInsights } from './validate.ts'

export interface InsightsEnv extends AdviserEnv {
  /** Must be exactly "true". Separate from ADVISER_ENABLED; needs the privacy addendum approved. */
  INSIGHTS_ENABLED?: string
}

export const INSIGHTS_REQUEST_BYTES = 40_000

export const INSIGHTS_INSTRUCTION = `You help a parent or teacher understand a 5-8 year old's practice in a spelling game. You receive aggregate statistics, the game's own label for each level, detected error patterns (foil codes), and the approved word list.
Write warmly and plainly, as for a busy parent. Rules:
- Describe practice, never the child. Do not label, diagnose, compare with other children, or mention ages, conditions, or being ahead or behind.
- Do not contradict the game's level labels. Only list strengths for levels labelled "doing-well".
- focusAreas: only foil codes from errorPatterns, each with one practical tip (max ${INSIGHT_LIMITS.tipChars} characters).
- homeActivities: up to ${INSIGHT_LIMITS.activities} short games to play at home, each using only target words from approvedItems (max ${INSIGHT_LIMITS.wordsPerActivity} words).
- summary: two or three sentences (max ${INSIGHT_LIMITS.summaryChars} characters).
- No links, products, or contact details. Return only JSON matching the schema.`

export const INSIGHTS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    strengths: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { level: { type: 'INTEGER' }, note: { type: 'STRING' } }, required: ['level', 'note'] },
    },
    focusAreas: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { foilCode: { type: 'STRING' }, tip: { type: 'STRING' } }, required: ['foilCode', 'tip'] },
    },
    homeActivities: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, description: { type: 'STRING' }, words: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['title', 'description', 'words'],
      },
    },
  },
  required: ['summary', 'strengths', 'focusAreas', 'homeActivities'],
} as const

/** Metadata only: never the request, the suggestions, the IP or the key. */
export interface InsightsLogEntry {
  event: 'insights'
  outcome: 'ok' | 'unavailable'
  reason?: string
  model?: string
  fallbackUsed?: boolean
  attempts?: { model: string; outcome: string; ms: number }[]
  removedItems?: number
  totalMs: number
}

export type InsightsDeps = Omit<ServerDeps, 'log'> & { log?: (entry: InsightsLogEntry) => void }

const json = (body: InsightsResponse, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function handleInsightsRequest(request: Request, env: InsightsEnv, deps: InsightsDeps): Promise<Response> {
  const started = deps.now()
  const log = (entry: Omit<InsightsLogEntry, 'event' | 'totalMs'>) => deps.log?.({ event: 'insights', ...entry, totalMs: deps.now() - started })
  const refuse = (reason: string, status: number) => {
    log({ outcome: 'unavailable', reason })
    return json({ status: 'unavailable', reason }, status)
  }

  if (request.method !== 'POST') return refuse('method-not-allowed', 405)
  if (env.INSIGHTS_ENABLED !== 'true') return refuse('disabled', 503)
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return refuse('not-configured', 503)
  const base = geminiBase(env)
  if (!base) return refuse('not-configured', 503)
  if (!deps.rateLimiter.allow(request.headers.get('cf-connecting-ip') ?? 'unknown', deps.now())) return refuse('rate-limited', 429)

  const text = await request.text()
  if (text.length > INSIGHTS_REQUEST_BYTES) return refuse('too-large', 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return refuse('bad-json', 400)
  }
  const parsed = insightsRequestSchema.safeParse(body)
  if (!parsed.success) return refuse('bad-request', 400)

  let lastRejection = 'invalid-insights'
  const result = await callGemini(
    {
      base,
      key: env.GEMINI_API_KEY,
      models: [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL],
      systemInstruction: INSIGHTS_INSTRUCTION,
      responseSchema: INSIGHTS_RESPONSE_SCHEMA,
      input: parsed.data,
      maxOutputTokens: 1500,
      budgetMs: deps.budgetMs ?? GEMINI_BUDGET_MS,
      timeoutMs: deps.timeoutMs ?? GEMINI_TIMEOUT_MS,
      invalidReason: 'invalid-insights',
      parse: (raw) => {
        const check = validateInsights(raw, deps.content, parsed.data)
        if (check.kind === 'rejected') {
          lastRejection = check.reason
          return null
        }
        return check.insights
      },
    },
    deps,
  )
  if (result.kind === 'ok') {
    log({ outcome: 'ok', model: result.model, fallbackUsed: result.attempts.length > 1, attempts: result.attempts, removedItems: result.value.removed.length })
    return json({ status: 'ok', model: result.model, insights: result.value }, 200)
  }
  const reason = result.reason === 'invalid-insights' ? `invalid-insights:${lastRejection}` : result.reason
  log({ outcome: 'unavailable', reason, attempts: result.attempts })
  return json({ status: 'unavailable', reason }, result.status)
}
