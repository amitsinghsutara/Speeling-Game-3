// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_POLICY_CONFIG } from '../adaptive/config.ts'
import { loadContent } from '../content/loadContent.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from '../learner/config.ts'
import { buildLearnerModel } from '../learner/model.ts'
import { answerEvents } from '../test/fixtures/events.ts'
import { createAdviserClient, isAdviceUsable, ADVICE_MAX_AGE_MS } from './client.ts'
import { buildAdviceRequest } from './request.ts'
import type { AdviceRequest, RawAdvice } from './schema.ts'
import { GEMINI_RESPONSE_SCHEMA, handleAdviceRequest, slidingWindowLimiter, type AdviserEnv, type ServerDeps } from './server.ts'
import { validateAdvice } from './validate.ts'

const content = loadContent()
const NOW = 1_000_000_000

function learnerWithVowelPattern() {
  const events = ['item-002', 'item-003', 'item-004'].flatMap((itemId) => answerEvents({ itemId, picks: ['V', 'target'] }))
  return buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG)
}
const request = (): AdviceRequest => buildAdviceRequest(learnerWithVowelPattern(), content, 1, DEFAULT_POLICY_CONFIG, NOW)

const goodAdvice: RawAdvice = {
  focusFoilCode: 'V',
  reviewSkillId: null,
  preferItemIds: ['item-003'],
  candidateFoils: [{ itemId: 'item-001', word: 'sit' }],
  rationale: 'Vowel foils are being chosen across several words.',
}

describe('what leaves the device', () => {
  it('sends only aggregates and approved curriculum: no ids, events, timestamps or free text', () => {
    const body = request()
    expect(Object.keys(body).sort()).toEqual(['approvedItems', 'currentLevel', 'dueReviewSkillIds', 'errorPatterns', 'foilTypes', 'schemaVersion', 'skills'])
    const text = JSON.stringify(body)
    for (const forbidden of ['learnerId', 'sessionId', 'questionId', 'eventId', 'local-learner', '"at"', 'evidenceEventIds', 'chosenWord']) {
      expect(text).not.toContain(forbidden)
    }
    expect(body.errorPatterns).toEqual([{ foilCode: 'V', errorRate: 1 }])
    expect(body.approvedItems.every((i) => i.level <= 1)).toBe(true)
  })
})

describe('curriculum validation of advice', () => {
  const validate = (raw: unknown, req = request()) => validateAdvice(raw, { content, request: req, adviceId: 'a1', receivedAt: NOW })

  it('keeps advice that only uses approved, offered content', () => {
    expect(validate(goodAdvice)).toMatchObject({ focusFoilCode: 'V', preferItemIds: ['item-003'], candidateFoils: [{ itemId: 'item-001', word: 'sit' }], rejected: [] })
  })

  it('drops invented words, unapproved foils, undetected patterns and words above the level', () => {
    const v = validate({
      focusFoilCode: 'PH',
      reviewSkillId: 'level-9',
      preferItemIds: ['item-999', 'item-150', 'item-003', 'item-003'],
      candidateFoils: [
        { itemId: 'item-001', word: 'sot' },
        { itemId: 'item-001', word: 'sit' },
      ],
      rationale: 'x',
    })
    expect(v).toMatchObject({ focusFoilCode: null, reviewSkillId: null, preferItemIds: ['item-003'], candidateFoils: [{ itemId: 'item-001', word: 'sit' }] })
    expect(v?.rejected).toHaveLength(5)
  })

  it('rejects malformed advice entirely', () => {
    expect(validate(null)).toBeNull()
    expect(validate({ focusFoilCode: 3 })).toBeNull()
    expect(validate({ ...goodAdvice, preferItemIds: Array.from({ length: 50 }, () => 'item-001') })).toBeNull()
  })
})

describe('server function', () => {
  const env: AdviserEnv = { ADVISER_ENABLED: 'true', GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'test-model' }
  const geminiReturning = (advice: unknown) =>
    vi.fn<typeof fetch>(async () => Response.json({ candidates: [{ content: { parts: [{ text: typeof advice === 'string' ? advice : JSON.stringify(advice) }] } }] }))
  const deps = (fetchImpl: typeof fetch, overrides: Partial<ServerDeps> = {}): ServerDeps => ({
    fetch: fetchImpl,
    now: () => NOW,
    newId: () => 'advice-1',
    content,
    rateLimiter: slidingWindowLimiter(100, 60_000),
    ...overrides,
  })
  const post = (body: unknown) =>
    new Request('https://example.test/api/advice', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'cf-connecting-ip': '203.0.113.7' } })

  it('is off unless explicitly enabled and configured', async () => {
    const gemini = geminiReturning(goodAdvice)
    expect((await handleAdviceRequest(post(request()), {}, deps(gemini))).status).toBe(503)
    expect((await handleAdviceRequest(post(request()), { ADVISER_ENABLED: 'true' }, deps(gemini))).status).toBe(503)
    expect((await handleAdviceRequest(post(request()), { ...env, ADVISER_ENABLED: 'yes' }, deps(gemini))).status).toBe(503)
    expect(gemini).not.toHaveBeenCalled()
  })

  it('calls Gemini with the key in a header (never the body) and a JSON response schema', async () => {
    const gemini = geminiReturning(goodAdvice)
    const response = await handleAdviceRequest(post(request()), env, deps(gemini))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', advice: { focusFoilCode: 'V' } })
    const [url, init] = gemini.mock.calls[0] ?? []
    expect(String(url)).toContain('/models/test-model:generateContent')
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key')
    expect(String(init?.body)).not.toContain('test-key')
    expect(JSON.parse(String(init?.body)).generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: GEMINI_RESPONSE_SCHEMA })
  })

  it('strips invented content from model output before it leaves the server', async () => {
    const gemini = geminiReturning({ ...goodAdvice, preferItemIds: ['item-999', 'item-003'], candidateFoils: [{ itemId: 'item-001', word: 'zzz' }] })
    const body = await (await handleAdviceRequest(post(request()), env, deps(gemini))).json()
    expect(body.advice).toMatchObject({ preferItemIds: ['item-003'], candidateFoils: [] })
  })

  it.each([
    ['not JSON at all', 'I think the child should practise vowels!'],
    ['the wrong shape', { advice: 'practise vowels' }],
  ])('fails safe when the model returns %s', async (_, output) => {
    const response = await handleAdviceRequest(post(request()), env, deps(geminiReturning(output)))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'invalid-advice' })
  })

  it('fails safe on upstream errors and timeouts', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('busy', { status: 500 }))
    expect((await handleAdviceRequest(post(request()), env, deps(down))).status).toBe(502)
    const slow = vi.fn<typeof fetch>(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    const timedOut = await handleAdviceRequest(post(request()), env, deps(slow))
    expect(timedOut.status).toBe(504)
    expect(await timedOut.json()).toEqual({ status: 'unavailable', reason: 'upstream-timeout' })
  })

  it('rejects bad, oversized or unexpected requests without calling Gemini', async () => {
    const gemini = geminiReturning(goodAdvice)
    expect((await handleAdviceRequest(post('{nope'), env, deps(gemini))).status).toBe(400)
    expect((await handleAdviceRequest(post({ ...request(), learnerName: 'Sam' }), env, deps(gemini))).status).toBe(400)
    expect((await handleAdviceRequest(post('x'.repeat(40_000)), env, deps(gemini))).status).toBe(413)
    expect((await handleAdviceRequest(new Request('https://example.test/api/advice'), env, deps(gemini))).status).toBe(405)
    expect(gemini).not.toHaveBeenCalled()
  })

  it('rate-limits per device', async () => {
    const d = deps(geminiReturning(goodAdvice), { rateLimiter: slidingWindowLimiter(2, 60_000) })
    expect((await handleAdviceRequest(post(request()), env, d)).status).toBe(200)
    expect((await handleAdviceRequest(post(request()), env, d)).status).toBe(200)
    expect((await handleAdviceRequest(post(request()), env, d)).status).toBe(429)
  })
})

describe('browser client', () => {
  const ok = (advice: unknown) => vi.fn<typeof fetch>(async () => Response.json({ status: 'ok', advice }))
  const client = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createAdviserClient>[0]> = {}) =>
    createAdviserClient({ enabled: true, content, fetch: fetchImpl, now: () => NOW, newId: () => 'adv-1', isOnline: () => true, ...extra })

  it('never calls the network when disabled or offline', async () => {
    const f = ok(goodAdvice)
    expect(await createAdviserClient({ enabled: false, content, fetch: f }).request(request())).toEqual({ kind: 'none', reason: 'disabled' })
    expect(await client(f, { isOnline: () => false }).request(request())).toEqual({ kind: 'none', reason: 'offline' })
    expect(f).not.toHaveBeenCalled()
  })

  it('validates again in the browser, even if the server let something through', async () => {
    const compromised = ok({ ...goodAdvice, preferItemIds: ['item-999'], focusFoilCode: 'PH' })
    const outcome = await client(compromised).request(request())
    expect(outcome.kind).toBe('advice')
    if (outcome.kind !== 'advice') throw new Error('expected advice')
    expect(outcome.advice).toMatchObject({ preferItemIds: [], focusFoilCode: null, adviceId: 'adv-1' })
    expect(outcome.advice.rejected.length).toBeGreaterThan(0)
  })

  it('throttles requests', async () => {
    const f = ok(goodAdvice)
    const c = client(f)
    await c.request(request())
    expect(await c.request(request())).toEqual({ kind: 'none', reason: 'throttled' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('turns timeouts, outages and junk into "no advice", never an error', async () => {
    const timeout = vi.fn<typeof fetch>(() => Promise.reject(new DOMException('slow', 'TimeoutError')))
    expect(await client(timeout).request(request())).toEqual({ kind: 'none', reason: 'timeout' })
    const broken = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('network')))
    expect(await client(broken).request(request())).toEqual({ kind: 'none', reason: 'error' })
    const unavailable = vi.fn<typeof fetch>(async () => Response.json({ status: 'unavailable', reason: 'disabled' }, { status: 503 }))
    expect(await client(unavailable).request(request())).toEqual({ kind: 'none', reason: 'unavailable' })
    const junk = vi.fn<typeof fetch>(async () => new Response('<html>oops</html>'))
    expect(await client(junk).request(request())).toEqual({ kind: 'none', reason: 'invalid' })
  })

  it('treats advice as usable only for its level and while fresh', () => {
    const advice = validateAdvice(goodAdvice, { content, request: request(), adviceId: 'a', receivedAt: NOW })
    expect(isAdviceUsable(advice, 1, NOW + 1000)).toBe(true)
    expect(isAdviceUsable(advice, 2, NOW + 1000)).toBe(false)
    expect(isAdviceUsable(advice, 1, NOW + ADVICE_MAX_AGE_MS + 1)).toBe(false)
    expect(isAdviceUsable(null, 1, NOW)).toBe(false)
  })
})
