/**
 * Browser side of the adviser. Advice is fetched in the background and cached;
 * the policy only ever reads the cache, so the adviser can never delay a child.
 * Never throws: any problem simply means "no advice", and local rules decide.
 */
import type { ContentDataset } from '../content/schema.ts'
import { consoleLog, type LogFn } from '../debug/log.ts'
import { adviceResponseSchema, type AdviceRequest, type ValidatedAdvice } from './schema.ts'
import { validateAdvice } from './validate.ts'

export const CLIENT_TIMEOUT_MS = 8000
/** At most one request per this interval, whatever the UI does. */
export const MIN_REQUEST_INTERVAL_MS = 2 * 60 * 1000
/** Advice older than this is ignored: the learner has moved on. */
export const ADVICE_MAX_AGE_MS = 30 * 60 * 1000

export type AdviceOutcome =
  | { kind: 'advice'; advice: ValidatedAdvice }
  | { kind: 'none'; reason: 'disabled' | 'offline' | 'throttled' | 'timeout' | 'error' | 'unavailable' | 'invalid' }

export interface AdviserClient {
  readonly enabled: boolean
  request(body: AdviceRequest): Promise<AdviceOutcome>
}

export interface AdviserClientOptions {
  enabled: boolean
  content: ContentDataset
  endpoint?: string
  fetch?: typeof fetch
  now?: () => number
  newId?: () => string
  isOnline?: () => boolean
  timeoutMs?: number
  minIntervalMs?: number
  /** Console messages; defaults to `[adviser] …` in the browser console. */
  log?: LogFn
}

export function createAdviserClient(options: AdviserClientOptions): AdviserClient {
  const {
    enabled,
    content,
    endpoint = '/api/advice',
    fetch: doFetch = (...args: Parameters<typeof fetch>) => fetch(...args),
    now = Date.now,
    newId = () => `advice-${now()}`,
    isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
    timeoutMs = CLIENT_TIMEOUT_MS,
    minIntervalMs = MIN_REQUEST_INTERVAL_MS,
    log = consoleLog('adviser'),
  } = options
  let lastRequestAt = Number.NEGATIVE_INFINITY

  return {
    enabled,
    async request(body) {
      const none = (reason: Extract<AdviceOutcome, { kind: 'none' }>['reason'], details?: unknown): AdviceOutcome => {
        log(`no advice (${reason}); local rules decide`, details)
        return { kind: 'none', reason }
      }
      if (!enabled) return { kind: 'none', reason: 'disabled' }
      if (!isOnline()) return none('offline')
      if (now() - lastRequestAt < minIntervalMs) return none('throttled')
      lastRequestAt = now()
      const started = now()
      log(`asking for advice: level ${body.currentLevel}, ${body.errorPatterns.length} error pattern(s)`, {
        errorPatterns: body.errorPatterns,
        skills: body.skills,
      })
      try {
        const response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        const parsed = adviceResponseSchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success) return none('invalid', { httpStatus: response.status })
        if (parsed.data.status !== 'ok') return none('unavailable', { httpStatus: response.status, serverReason: parsed.data.reason })
        const advice = validateAdvice(parsed.data.advice, { content, request: body, adviceId: newId(), receivedAt: now() })
        if (!advice) return none('invalid')
        log(`advice from ${parsed.data.model ?? 'the model'} in ${now() - started} ms`, {
          focusFoilCode: advice.focusFoilCode,
          reviewSkillId: advice.reviewSkillId,
          preferItemIds: advice.preferItemIds,
          candidateFoils: advice.candidateFoils,
          rationale: advice.rationale,
          removedByServer: parsed.data.rejected ?? [],
          removedInBrowser: advice.rejected,
        })
        return { kind: 'advice', advice }
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
        return none(timedOut ? 'timeout' : 'error', timedOut ? undefined : String(error))
      }
    },
  }
}

/** Advice is usable only for the level it was made for, and only while fresh. */
export const isAdviceUsable = (advice: ValidatedAdvice | null, level: number, now: number): advice is ValidatedAdvice =>
  advice !== null && advice.level === level && now - advice.receivedAt <= ADVICE_MAX_AGE_MS
