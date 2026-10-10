import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY_CONFIG } from '../adaptive/config.ts'
import { loadContent } from '../content/loadContent.ts'
import { answerEvents, correctAnswers } from '../test/fixtures/events.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from './config.ts'
import { buildLearnerModel } from './model.ts'
import { STATUS_TEXT, buildProgressReport, levelStatus, percent } from './report.ts'

const content = loadContent()
const report = (events: Parameters<typeof buildLearnerModel>[0]) =>
  buildProgressReport(buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG), content, DEFAULT_POLICY_CONFIG)
const level1 = content.items.filter((i) => i.level === 1).map((i) => i.id)

describe('grown-ups progress report', () => {
  it('is empty and honest for a new child', () => {
    const r = report([])
    expect(r).toMatchObject({ questions: 0, wordsPractised: 0, firstTryAccuracy: null, trickySpots: [], practiseWords: [], provisional: true })
    expect(r.levels.every((l) => l.status === 'not-started')).toBe(true)
    expect(r.levels).toHaveLength(10)
  })

  it('says "just getting started" until there is enough evidence, even when every answer was right', () => {
    const r = report(correctAnswers(level1.slice(0, 3)))
    expect(r.levels[0]).toMatchObject({ questions: 3, firstTryAccuracy: 1, status: 'just-started' })
  })

  it('says "doing well recently" only with enough evidence and high recent accuracy, otherwise "still practising"', () => {
    expect(report(correctAnswers(level1.slice(0, 10))).levels[0]?.status).toBe('doing-well')
    const mixed = level1.slice(0, 10).flatMap((id, i) => answerEvents({ itemId: id, picks: i % 2 ? ['target'] : ['V', 'target'] }))
    expect(report(mixed).levels[0]?.status).toBe('practising')
  })

  it('never uses the word "mastered" in any status', () => {
    expect(Object.values(STATUS_TEXT).join(' ').toLowerCase()).not.toMatch(/master/)
  })

  it('describes tricky spots with the codebook’s own name and example', () => {
    const events = ['item-002', 'item-003', 'item-004'].flatMap((itemId) => answerEvents({ itemId, picks: ['V', 'target'] }))
    expect(report(events).trickySpots).toEqual([{ code: 'V', name: 'Vowel substitution', example: 'cat > cot', chosen: 3, presentedIn: 3 }])
  })

  it('lists words to practise: wrong first time on their latest try, most recent first', () => {
    const events = [
      ...answerEvents({ itemId: 'item-001', picks: ['V', 'target'] }),
      ...answerEvents({ itemId: 'item-002', picks: ['V', 'target'] }),
      ...answerEvents({ itemId: 'item-002', picks: ['target'] }), // now right: drops off the list
      ...answerEvents({ itemId: 'item-003', picks: ['FC', 'target'] }),
    ]
    expect(report(events).practiseWords).toEqual(['cat', 'sat'])
  })

  it('formats percentages and missing values plainly', () => {
    expect(percent(0.756)).toBe('76%')
    expect(percent(null)).toBe('n/a')
    expect(levelStatus(0, null, 'none', 0.8)).toBe('not-started')
  })
})
