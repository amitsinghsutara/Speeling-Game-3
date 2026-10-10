// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_POLICY_CONFIG } from '../adaptive/config.ts'
import { slidingWindowLimiter } from '../adviser/server.ts'
import { loadContent } from '../content/loadContent.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from '../learner/config.ts'
import { buildLearnerModel } from '../learner/model.ts'
import { buildProgressReport } from '../learner/report.ts'
import { answerEvents, correctAnswers } from '../test/fixtures/events.ts'
import { buildInsightsRequest, createInsightsClient } from './client.ts'
import type { RawInsights } from './schema.ts'
import { INSIGHTS_RESPONSE_SCHEMA, handleInsightsRequest, type InsightsEnv, type InsightsLogEntry } from './server.ts'
import { BANNED_TERMS, validateInsights } from './validate.ts'

const content = loadContent()
const NOW = 1_000_000_000
const level1 = content.items.filter((i) => i.level === 1).map((i) => i.id)

/** A child who is doing well on level 1 overall but keeps choosing vowel foils lately. */
function child() {
  const events = [
    ...correctAnswers(level1.slice(5, 15)),
    ...['item-002', 'item-003', 'item-004'].flatMap((itemId) => answerEvents({ itemId, picks: ['V', 'target'] })),
  ]
  const learner = buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG)
  const report = buildProgressReport(learner, content, DEFAULT_POLICY_CONFIG)
  return { learner, report, request: buildInsightsRequest(learner, report, content, DEFAULT_POLICY_CONFIG, NOW) }
}

const good: RawInsights = {
  summary: 'Your child has been practising short vowel words and gets many right first time.',
  strengths: [],
  focusAreas: [{ foilCode: 'V', tip: 'Say the word slowly and stretch the middle sound.' }],
  homeActivities: [{ title: 'Vowel hunt', description: 'Say a word, then swap the middle sound to make a new word.', words: ['sat', 'cat', 'map'] }],
}

describe('what is sent for grown-ups suggestions', () => {
  it('reuses the adviser aggregates and adds only the device’s own level labels', () => {
    const { request } = child()
    expect(Object.keys(request).sort()).toEqual(['levelStatuses', 'schemaVersion', 'stats'])
    expect(request.levelStatuses).toEqual([{ level: 1, status: 'practising' }])
    const text = JSON.stringify(request)
    for (const forbidden of ['learnerId', 'sessionId', 'questionId', 'evidenceEventIds', 'chosenWord', 'local-learner']) expect(text).not.toContain(forbidden)
  })
})

describe('safety checks on AI suggestions', () => {
  const check = (raw: unknown) => validateInsights(raw, content, child().request)

  it('keeps safe, curriculum-based suggestions', () => {
    expect(check(good)).toMatchObject({ kind: 'ok', insights: { focusAreas: [{ foilCode: 'V' }], homeActivities: [{ words: ['sat', 'cat', 'map'] }] } })
  })

  it.each([
    'Your child may have dyslexia.',
    'They seem a little behind for their age.',
    'This looks like a learning disorder.',
    'Your child has mastered short vowels!',
    'They are clearly gifted.',
    'Results are below average.',
  ])('discards everything when the text labels or diagnoses the child: %s', (summary) => {
    expect(check({ ...good, summary })).toEqual({ kind: 'rejected', reason: expect.stringMatching(/^unsafe-language:/) })
  })

  it('checks every text field, not just the summary', () => {
    expect(check({ ...good, focusAreas: [{ foilCode: 'V', tip: 'Ask a therapist about this.' }] }).kind).toBe('rejected')
    expect(check({ ...good, homeActivities: [{ title: 'ADHD-friendly game', description: 'x', words: ['sat'] }] }).kind).toBe('rejected')
  })

  it('discards links and contact details', () => {
    expect(check({ ...good, summary: 'See https://example.com for more.' })).toEqual({ kind: 'rejected', reason: 'link-or-contact' })
  })

  it('drops strengths the device does not agree with, and focus areas that are not detected patterns', () => {
    const result = check({ ...good, strengths: [{ level: 1, note: 'Great work on level 1.' }], focusAreas: [{ foilCode: 'PH', tip: 'x' }] })
    expect(result).toMatchObject({ kind: 'ok', insights: { strengths: [], focusAreas: [] } })
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.insights.removed).toHaveLength(2)
  })

  it('keeps only approved target words at or below the child’s level, and drops empty activities', () => {
    const result = check({
      ...good,
      homeActivities: [
        { title: 'Mixed', description: 'x', words: ['sat', 'sit', 'zzz', 'beautiful', 'cot'] }, // cot is a foil, beautiful is level 10
        { title: 'Nothing left', description: 'x', words: ['qqq'] },
      ],
    })
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.insights.homeActivities).toEqual([{ title: 'Mixed', description: 'x', words: ['sat', 'sit'] }])
  })

  it('trims long text instead of showing it all', () => {
    const result = check({ ...good, summary: 'Practise a little every day. '.repeat(40) })
    if (result.kind !== 'ok') throw new Error('expected ok')
    expect(result.insights.summary.length).toBeLessThanOrEqual(420)
    expect(result.insights.summary.endsWith('…')).toBe(true)
  })

  it('has a banned list covering diagnosis, labels and mastery claims', () => {
    for (const t of ['dyslex', 'adhd', 'autis', 'behind', 'master', 'disorder', 'delay']) expect(BANNED_TERMS).toContain(t)
  })
})

describe('insights server function', () => {
  const env: InsightsEnv = { INSIGHTS_ENABLED: 'true', GEMINI_API_KEY: 'secret-key', GEMINI_MODEL: 'main-model', GEMINI_FALLBACK_MODEL: 'backup-model' }
  const reply = (raw: unknown) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(raw) }] } }] })
  const post = () =>
    new Request('https://example.test/api/insights', { method: 'POST', body: JSON.stringify(child().request), headers: { 'cf-connecting-ip': '198.51.100.9' } })
  const deps = (f: typeof fetch, log?: (e: InsightsLogEntry) => void) => ({
    fetch: f,
    now: () => NOW,
    newId: () => 'x',
    content,
    rateLimiter: slidingWindowLimiter(99, 1000),
    ...(log && { log }),
  })

  it('has its own switch, separate from the adviser', async () => {
    const f = vi.fn<typeof fetch>()
    const { INSIGHTS_ENABLED: _off, ...adviserOnly } = env
    const off = await handleInsightsRequest(post(), { ...adviserOnly, ADVISER_ENABLED: 'true' }, deps(f))
    expect(off.status).toBe(503)
    expect(f).not.toHaveBeenCalled()
  })

  it('returns checked suggestions and asks Gemini for the insights schema', async () => {
    const f = vi.fn<typeof fetch>(async () => reply(good))
    const response = await handleInsightsRequest(post(), env, deps(f))
    expect(await response.json()).toMatchObject({ status: 'ok', model: 'main-model', insights: { focusAreas: [{ foilCode: 'V' }] } })
    expect(JSON.parse(String(f.mock.calls[0]?.[1]?.body)).generationConfig.responseSchema).toEqual(INSIGHTS_RESPONSE_SCHEMA)
  })

  it('tries the fallback when the main model says something unsafe, and reports why if both do', async () => {
    const unsafe = { ...good, summary: 'Your child might be dyslexic.' }
    const f = vi.fn<typeof fetch>(async (url) => reply(String(url).includes('main-model') ? unsafe : good))
    expect(await (await handleInsightsRequest(post(), env, deps(f))).json()).toMatchObject({ status: 'ok', model: 'backup-model' })

    const both = vi.fn<typeof fetch>(async () => reply(unsafe))
    const response = await handleInsightsRequest(post(), env, deps(both))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'invalid-insights:unsafe-language:dyslex' })
  })

  it('logs metadata only: never the suggestions, the request, the IP or the key', async () => {
    const entries: InsightsLogEntry[] = []
    await handleInsightsRequest(post(), env, deps(vi.fn<typeof fetch>(async () => reply(good)), (e) => entries.push(e)))
    expect(entries).toEqual([
      { event: 'insights', outcome: 'ok', model: 'main-model', fallbackUsed: false, attempts: [{ model: 'main-model', outcome: 'ok', ms: 0 }], removedItems: 0, totalMs: 0 },
    ])
    const text = JSON.stringify(entries)
    for (const leak of ['198.51.100.9', 'secret-key', 'Vowel hunt', 'levelStatuses']) expect(text).not.toContain(leak)
  })
})

describe('insights browser client', () => {
  it('asks only with data, online, and not twice in quick succession', async () => {
    const { learner, report } = child()
    const f = vi.fn<typeof fetch>(async () => Response.json({ status: 'ok', model: 'm', insights: { ...good, removed: [] } }))
    const client = createInsightsClient({ enabled: true, content, policy: DEFAULT_POLICY_CONFIG, fetch: f, now: () => NOW, isOnline: () => true, log: () => {} })
    expect((await client.request(learner, report)).kind).toBe('insights')
    expect(await client.request(learner, report)).toEqual({ kind: 'none', reason: 'too-soon' })
    const empty = buildProgressReport(buildLearnerModel([], content, DEFAULT_LEARNER_MODEL_CONFIG), content, DEFAULT_POLICY_CONFIG)
    expect(await createInsightsClient({ enabled: true, content, policy: DEFAULT_POLICY_CONFIG, fetch: f, log: () => {} }).request(learner, empty)).toEqual({ kind: 'none', reason: 'no-data' })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('re-checks in the browser, even if the server let something unsafe through', async () => {
    const { learner, report } = child()
    const compromised = vi.fn<typeof fetch>(async () =>
      Response.json({ status: 'ok', insights: { ...good, summary: 'Possible ADHD.', removed: [] } }),
    )
    const client = createInsightsClient({ enabled: true, content, policy: DEFAULT_POLICY_CONFIG, fetch: compromised, now: () => NOW, isOnline: () => true, log: () => {} })
    expect(await client.request(learner, report)).toEqual({ kind: 'none', reason: 'invalid' })
  })
})
