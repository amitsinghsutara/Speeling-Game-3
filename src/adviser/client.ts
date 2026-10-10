/**
 * Browser side of the adviser. Advice is fetched in the background and cached;
 * the policy only ever reads the cache, so the adviser can never delay a child.
 * Never throws: any problem simply means "no advice", and local rules decide.
 */
import type { ContentDataset } from '../content/schema.ts'
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
  } = options
  let lastRequestAt = Number.NEGATIVE_INFINITY

  return {
    enabled,
    async request(body) {
      if (!enabled) return { kind: 'none', reason: 'disabled' }
      if (!isOnline()) return { kind: 'none', reason: 'offline' }
      if (now() - lastRequestAt < minIntervalMs) return { kind: 'none', reason: 'throttled' }
      lastRequestAt = now()
      try {
        const response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        const parsed = adviceResponseSchema.safeParse(await response.json().catch(() => null))
        if (!parsed.success) return { kind: 'none', reason: 'invalid' }
        if (parsed.data.status !== 'ok') return { kind: 'none', reason: 'unavailable' }
        const advice = validateAdvice(parsed.data.advice, { content, request: body, adviceId: newId(), receivedAt: now() })
        return advice ? { kind: 'advice', advice } : { kind: 'none', reason: 'invalid' }
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
        return { kind: 'none', reason: timedOut ? 'timeout' : 'error' }
      }
    },
  }
}

/** Advice is usable only for the level it was made for, and only while fresh. */
export const isAdviceUsable = (advice: ValidatedAdvice | null, level: number, now: number): advice is ValidatedAdvice =>
  advice !== null && advice.level === level && now - advice.receivedAt <= ADVICE_MAX_AGE_MS
