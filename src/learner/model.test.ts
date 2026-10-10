import { describe, expect, it } from 'vitest'
import { loadContent } from '../content/loadContent.ts'
import { answerEvents, correctAnswers } from '../test/fixtures/events.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG, learnerModelConfigSchema, type LearnerModelConfig } from './config.ts'
import { createLearningEvent } from './events.ts'
import { buildLearnerModel, groupQuestions } from './model.ts'

const content = loadContent()
const config = DEFAULT_LEARNER_MODEL_CONFIG
const model = (events: Parameters<typeof buildLearnerModel>[0], cfg: LearnerModelConfig = config) =>
  buildLearnerModel(events, content, cfg)

/** Level-1 item ids in order: item-001 … item-025. */
const items = content.items.filter((i) => i.level === 1).map((i) => i.id)
const item = (n: number): string => items[n] ?? 'missing'

describe('learning events', () => {
  it('records no foil code when the target was chosen', () => {
    const [event] = answerEvents({ itemId: item(0), picks: ['target'] })
    expect(event).toMatchObject({ correct: true, chosenFoilCode: null, attemptNumber: 1, decisionId: null })
  })

  it('rejects a malformed event at creation', () => {
    expect(() =>
      createLearningEvent({
        sessionId: '',
        questionId: 'q',
        at: 1,
        contentVersion: 'x',
        itemId: 'item-001',
        skillId: 'level-1',
        level: 1,
        puzzleId: 'p',
        presentedFoilCodes: [],
        chosenWord: 'sat',
        correct: true,
        attemptNumber: 1,
        elapsedMs: 5,
      }),
    ).toThrow(/sessionId/)
  })
})

describe('learner model config', () => {
  it('is marked provisional until confirmed', () => {
    expect(config.provisional).toBe(true)
  })

  it.each([
    ['a single mistake', { minErrors: 1 }],
    ['a single word', { minDistinctItems: 1 }],
    ['more errors than the window holds', { windowQuestions: 2, minErrors: 3 }],
  ])('refuses settings that would allow a pattern from %s', (_, override) => {
    const candidate = { ...config, errorPattern: { ...config.errorPattern, ...override } }
    expect(learnerModelConfigSchema.safeParse(candidate).success).toBe(false)
  })
})

describe('question grouping', () => {
  it('groups retries into one question and knows the first try', () => {
    const [q] = groupQuestions(answerEvents({ itemId: item(0), picks: ['V', 'FC', 'target'] }))
    expect(q).toMatchObject({ itemId: item(0), firstTryCorrect: false, solved: true })
    expect(q?.attempts).toHaveLength(3)
  })
})

describe('skill statistics', () => {
  it('counts first-try accuracy per skill', () => {
    const events = [
      ...correctAnswers([item(0), item(1), item(2)]),
      ...answerEvents({ itemId: item(3), picks: ['V', 'target'] }),
    ]
    expect(model(events).bySkill.get('level-1')).toMatchObject({
      questions: 4,
      firstTryCorrect: 3,
      firstTryAccuracy: 0.75,
      distinctItems: 4,
    })
  })

  it('says when there is not yet enough evidence, instead of implying mastery', () => {
    const few = model(correctAnswers([item(0), item(1)])).bySkill.get('level-1')
    expect(few).toMatchObject({ firstTryAccuracy: 1, evidence: 'insufficient' })
    const enough = model(correctAnswers(items.slice(0, config.minQuestionsForEvidence))).bySkill.get('level-1')
    expect(enough?.evidence).toBe('enough')
  })

  it('tracks recent accuracy separately from all-time accuracy', () => {
    const events = [
      ...items.slice(0, 10).flatMap((id) => answerEvents({ itemId: id, picks: ['V', 'target'] })),
      ...correctAnswers(items.slice(10, 20)),
    ]
    const stats = model(events).bySkill.get('level-1')
    expect(stats?.firstTryAccuracy).toBe(0.5)
    expect(stats?.recentFirstTryAccuracy).toBe(1)
  })
})

describe('foil type and item statistics', () => {
  it('counts how often each foil type was shown and chosen', () => {
    const events = [
      ...answerEvents({ itemId: item(0), picks: ['V', 'target'] }),
      ...answerEvents({ itemId: item(1), picks: ['target'] }),
    ]
    expect(model(events).byFoilType.get('V')).toMatchObject({ tier: 2, presentedIn: 2, chosen: 1, errorRate: 0.5 })
    expect(model(events).byFoilType.get('IC')).toMatchObject({ presentedIn: 2, chosen: 0, errorRate: 0 })
  })

  it('ignores retry choices when only first choices count', () => {
    const events = answerEvents({ itemId: item(0), picks: ['V', 'FC', 'target'] })
    expect(model(events).byFoilType.get('FC')?.chosen).toBe(0)
    expect(model(events, { ...config, firstChoiceOnly: false }).byFoilType.get('FC')?.chosen).toBe(1)
  })

  it('remembers when each item was last seen and how it went', () => {
    const events = [...answerEvents({ itemId: item(0), picks: ['V', 'target'] }), ...correctAnswers([item(0)])]
    expect(model(events).byItem.get(item(0))).toMatchObject({ timesSeen: 2, firstTryCorrect: 1, lastFirstTryCorrect: true })
  })

  it('ignores events for items no longer in the content', () => {
    const events = [...correctAnswers(['item-999']), ...correctAnswers([item(0)])]
    const m = model(events)
    expect(m.ignoredEvents).toBe(1)
    expect(m.questions).toHaveLength(1)
  })
})

describe('error pattern detection', () => {
  const vowelMistake = (n: number) => answerEvents({ itemId: item(n), picks: ['V', 'target'] })

  it('never reports a pattern from a single mistake', () => {
    expect(model(vowelMistake(0)).errorPatterns).toEqual([])
  })

  it('does not report a pattern from repeated mistakes on one word', () => {
    const events = [0, 0, 0, 0].flatMap((n) => vowelMistake(n))
    expect(model(events).errorPatterns).toEqual([])
  })

  it('reports a pattern from repeated mistakes across different words, citing its evidence', () => {
    const events = [...vowelMistake(0), ...correctAnswers([item(1)]), ...vowelMistake(2), ...vowelMistake(3)]
    const [pattern, ...rest] = model(events).errorPatterns
    expect(rest).toEqual([])
    expect(pattern).toMatchObject({ foilCode: 'V', errors: 3, distinctItems: 3, questionsInWindow: 4, errorRate: 0.75 })
    const vowelErrorIds = events.filter((e) => e.chosenFoilCode === 'V').map((e) => e.id)
    expect(pattern?.evidenceEventIds).toEqual(vowelErrorIds)
  })

  it('needs the error rate to stay high, not just a count', () => {
    const events = [...vowelMistake(0), ...correctAnswers(items.slice(1, 6)), ...vowelMistake(6), ...correctAnswers(items.slice(7, 9)), ...vowelMistake(9)]
    // 3 errors, but only 3 of the last 10 questions showing V (rate 0.3 = threshold).
    expect(model(events).errorPatterns.map((p) => p.foilCode)).toEqual(['V'])
    const stricter = { ...config, errorPattern: { ...config.errorPattern, minErrorRate: 0.31 } }
    expect(model(events, stricter).errorPatterns).toEqual([])
  })

  it('lets an old pattern fade once recent answers are right', () => {
    const events = [...vowelMistake(0), ...vowelMistake(1), ...vowelMistake(2), ...correctAnswers(items.slice(3, 13))]
    expect(model(events).errorPatterns).toEqual([])
  })

  it('only looks at questions where that foil type was actually on screen', () => {
    const noVowelFoil = ['FC', 'IC']
    const events = [
      ...vowelMistake(0),
      ...correctAnswers(items.slice(1, 12), noVowelFoil),
      ...vowelMistake(12),
      ...vowelMistake(13),
    ]
    expect(model(events).errorPatterns.map((p) => p.foilCode)).toEqual(['V'])
  })

  it('is deterministic: the same events always give the same model', () => {
    const events = [...vowelMistake(0), ...vowelMistake(2), ...vowelMistake(3)]
    expect(model(events)).toEqual(model([...events].reverse()))
  })
})
