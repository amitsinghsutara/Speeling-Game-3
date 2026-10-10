/**
 * Browser side of the grown-ups' AI suggestions. Asked only when a grown-up
 * presses the button; never in the background. Validates again before showing.
 */
import type { PolicyConfig } from '../adaptive/config.ts'
import { buildAdviceRequest } from '../adviser/request.ts'
import type { ContentDataset } from '../content/schema.ts'
import { consoleLog, type LogFn } from '../debug/log.ts'
import type { LearnerModel } from '../learner/model.ts'
import type { ProgressReport } from '../learner/report.ts'
import { INSIGHTS_SCHEMA_VERSION, insightsRequestSchema, insightsResponseSchema, type Insights, type InsightsRequest } from './schema.ts'
import { validateInsights } from './validate.ts'

/** The grown-up is waiting on screen, so allow a little longer than background advice. */
export const INSIGHTS_TIMEOUT_MS = 10_000
export const MIN_INSIGHTS_INTERVAL_MS = 30_000
/** A successful answer is reused while the child's data is unchanged, for up to this long. */
export const INSIGHTS_CACHE_MS = 10 * 60 * 1000

export type InsightsOutcome =
  | { kind: 'insights'; insights: Insights; model?: string | undefined; cached?: boolean }
  | { kind: 'none'; reason: 'disabled' | 'offline' | 'too-soon' | 'no-data' | 'timeout' | 'error' | 'unavailable' | 'invalid' }

export interface InsightsClient {
  readonly enabled: boolean
  /** `refresh` skips the cached answer (still subject to the minimum interval). */
  request(learner: LearnerModel, report: ProgressReport, options?: { refresh?: boolean }): Promise<InsightsOutcome>
}

export function buildInsightsRequest(learner: LearnerModel, report: ProgressReport, content: ContentDataset, policy: PolicyConfig, now: number): InsightsRequest {
  // Current level: the highest level the child has practised.
  const currentLevel = Math.max(1, ...report.levels.filter((l) => l.questions > 0).map((l) => l.level))
  return insightsRequestSchema.parse({
    schemaVersion: INSIGHTS_SCHEMA_VERSION,
    stats: buildAdviceRequest(learner, content, currentLevel, policy, now),
    levelStatuses: report.levels.filter((l) => l.status !== 'not-started').map((l) => ({ level: l.level, status: l.status })),
  })
}

export interface InsightsClientOptions {
  enabled: boolean
  content: ContentDataset
  policy: PolicyConfig
  endpoint?: string
  fetch?: typeof fetch
  now?: () => number
  isOnline?: () => boolean
  timeoutMs?: number
  minIntervalMs?: number
  log?: LogFn
}

export function createInsightsClient(options: InsightsClientOptions): InsightsClient {
  const {
    enabled,
    content,
    policy,
    endpoint = '/api/insights',
    fetch: doFetch = (...args: Parameters<typeof fetch>) => fetch(...args),
    now = Date.now,
    isOnline = () => (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine !== false,
    timeoutMs = INSIGHTS_TIMEOUT_MS,
    minIntervalMs = MIN_INSIGHTS_INTERVAL_MS,
    log = consoleLog('insights'),
  } = options
  let lastRequestAt = Number.NEGATIVE_INFINITY
  let cache: { key: string; at: number; outcome: Extract<InsightsOutcome, { kind: 'insights' }> } | null = null
  // A request already on its way for the same data is shared, not repeated.
  let inflight: { key: string; promise: Promise<InsightsOutcome> } | null = null

  const none = (reason: Extract<InsightsOutcome, { kind: 'none' }>['reason'], details?: unknown): InsightsOutcome => {
    log(`no suggestions (${reason})`, details)
    return { kind: 'none', reason }
  }

  async function ask(key: string, body: InsightsRequest, answers: number): Promise<InsightsOutcome> {
    const started = now()
    log(`asking for suggestions: ${answers} answers, ${body.stats.errorPatterns.length} error pattern(s)`, { levelStatuses: body.levelStatuses })
    try {
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const parsed = insightsResponseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) return none('invalid', { httpStatus: response.status })
      if (parsed.data.status !== 'ok') return none('unavailable', { httpStatus: response.status, serverReason: parsed.data.reason })
      // Check again here: the browser never trusts the server's checks alone.
      const check = validateInsights(parsed.data.insights, content, body)
      if (check.kind === 'rejected') return none('invalid', { reason: check.reason })
      const removed = [...parsed.data.insights.removed, ...check.insights.removed]
      log(`suggestions from ${parsed.data.model ?? 'the model'} in ${now() - started} ms`, { ...check.insights, removed })
      const outcome = { kind: 'insights' as const, insights: { ...check.insights, removed }, model: parsed.data.model }
      cache = { key, at: now(), outcome }
      return outcome
    } catch (error) {
      const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
      return none(timedOut ? 'timeout' : 'error', timedOut ? undefined : String(error))
    }
  }

  return {
    enabled,
    async request(learner, report, { refresh = false } = {}) {
      if (!enabled) return { kind: 'none', reason: 'disabled' }
      if (report.questions === 0) return none('no-data')
      if (!isOnline()) return none('offline')
      const body = buildInsightsRequest(learner, report, content, policy, now())
      // Same data as last time: reuse the answer instead of asking again.
      const key = JSON.stringify({ stats: body.stats, levelStatuses: body.levelStatuses })
      if (!refresh && cache && cache.key === key && now() - cache.at <= INSIGHTS_CACHE_MS) {
        log('using the suggestions from a moment ago (no new answers since)')
        return { ...cache.outcome, cached: true }
      }
      if (inflight && inflight.key === key) return inflight.promise
      if (now() - lastRequestAt < minIntervalMs) return none('too-soon')
      lastRequestAt = now()
      const promise = ask(key, body, report.questions)
      inflight = { key, promise }
      void promise.finally(() => {
        if (inflight?.promise === promise) inflight = null
      })
      return promise
    },
  }
}
