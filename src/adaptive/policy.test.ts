import { describe, expect, it } from 'vitest'
import { itemsForLevel, loadContent } from '../content/loadContent.ts'
import { seededRandom } from '../game/random.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from '../learner/config.ts'
import type { LearningEvent } from '../learner/events.ts'
import { buildLearnerModel } from '../learner/model.ts'
import { answerEvents } from '../test/fixtures/events.ts'
import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from './config.ts'
import { decideNext, startRound, type RoundState } from './policy.ts'
import { tierLookup } from './presentation.ts'

const content = loadContent()
const tierOf = tierLookup(content)
const level = (n: number) => itemsForLevel(content, n)
const itemById = (id: string) => {
  const item = content.items.find((i) => i.id === id)
  if (!item) throw new Error(`no ${id}`)
  return item
}
const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

/** Events for an item, using its real foil codes, at a chosen time. */
function asked(itemId: string, picks: ('target' | 'wrong')[], at = NOW - 60_000, shownCodes?: string[]): LearningEvent[] {
  const item = itemById(itemId)
  const codes = shownCodes ?? item.foils.map((f) => f.code)
  const firstWrong = codes[0] ?? 'V'
  return answerEvents({
    itemId,
    skillId: item.skillId,
    level: item.level,
    shown: codes,
    picks: picks.map((p) => (p === 'target' ? 'target' : firstWrong)),
  }).map((e, i) => ({ ...e, at: at + i }))
}

/** A wrong first try choosing a specific foil code. */
function missed(itemId: string, code: string, at = NOW - 60_000): LearningEvent[] {
  const item = itemById(itemId)
  return answerEvents({ itemId, skillId: item.skillId, level: item.level, shown: item.foils.map((f) => f.code), picks: [code, 'target'] }).map(
    (e, i) => ({ ...e, at: at + i }),
  )
}

function decide(events: LearningEvent[], round: RoundState, config: PolicyConfig = DEFAULT_POLICY_CONFIG, seed = 1) {
  let n = 0
  return decideNext({
    content,
    learner: buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG),
    round,
    config,
    now: NOW,
    random: seededRandom(seed),
    newId: () => `d-${++n}`,
  })
}

const round = (levelNumber: number, queue: string[], extra: Partial<RoundState> = {}): RoundState => ({
  ...startRound(`level-${levelNumber}/puzzle-x`, levelNumber, queue),
  ...extra,
})
const level1Puzzle1 = level(1).slice(0, 5).map((i) => i.id)

describe('continue in curriculum order', () => {
  it('starts a fresh learner on the puzzle’s first word with every foil, explaining what it skipped', () => {
    const d = decide([], round(1, level1Puzzle1))
    expect(d).toMatchObject({
      strategy: 'CONTINUE_SEQUENCE',
      presentation: 'FULL_SET',
      itemId: 'item-001',
      foilWords: ['sit', 'sap', 'hat'],
      countsForStars: true,
      provisional: true,
      policyVersion: DEFAULT_POLICY_CONFIG.version,
    })
    expect(d?.considered).toEqual([
      { strategy: 'FOCUS_ERROR_PATTERN', skipped: 'NO_ERROR_PATTERN' },
      { strategy: 'SPACED_REVIEW', skipped: 'NOT_DUE' },
      { strategy: 'TRANSFER_CHECK', skipped: 'NOT_READY' },
    ])
  })
})

describe('focused practice on a repeated error pattern', () => {
  const vowelPattern = [...missed('item-002', 'V'), ...missed('item-003', 'V'), ...missed('item-004', 'V')]

  it('practises a word whose foils include the pattern’s foil type, and keeps that foil on screen', () => {
    const d = decide(vowelPattern, round(1, ['item-005'], { asked: [{ itemId: 'item-004', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: false }] }))
    expect(d?.strategy).toBe('FOCUS_ERROR_PATTERN')
    expect(d?.countsForStars).toBe(false)
    expect(d?.foilCodes).toContain('V')
    expect(d?.itemId).not.toBe('item-004') // never the word just answered
    expect(d?.itemId).not.toBe('item-005') // never steals the puzzle's next new word
    expect(d?.evidence.errorPattern?.foilCode).toBe('V')
    expect(d?.evidence.errorPattern?.evidenceEventIds).toHaveLength(3)
  })

  it('prefers familiar words for focused practice', () => {
    const d = decide(vowelPattern, round(1, []))
    expect(['item-002', 'item-003', 'item-004']).toContain(d?.itemId)
  })

  it('stops after its per-puzzle limit, and when the extra budget is used', () => {
    const limited = decide(vowelPattern, round(1, ['item-005'], { used: { FOCUS_ERROR_PATTERN: 2 } }))
    expect(limited?.strategy).toBe('CONTINUE_SEQUENCE')
    expect(limited?.considered[0]).toEqual({ strategy: 'FOCUS_ERROR_PATTERN', skipped: 'STRATEGY_LIMIT_REACHED' })
    const spent = decide(vowelPattern, round(1, ['item-005'], { extrasUsed: 3 }))
    expect(spent?.considered[0]).toEqual({ strategy: 'FOCUS_ERROR_PATTERN', skipped: 'EXTRA_BUDGET_USED' })
  })

  it('does not focus after a single mistake', () => {
    expect(decide(missed('item-002', 'V'), round(1, ['item-005']))?.strategy).toBe('CONTINUE_SEQUENCE')
  })
})

describe('scaffolding', () => {
  // Three hard questions in a row, each a different foil type (so no error pattern).
  const struggling = [...missed('item-002', 'V'), ...missed('item-003', 'FC'), ...missed('item-004', 'IC')]

  it('shows fewer choices, the easiest approved foils by tier, when recent answers were hard', () => {
    const d = decide(struggling, round(1, ['item-001']))
    expect(d?.presentation).toBe('SCAFFOLD_REDUCE_CHOICES')
    // sat: sit (V, tier 2), sap (FC, tier 1), hat (IC, tier 1)
    expect(d?.foilWords).toEqual(['sap', 'hat'])
    expect(d?.evidence.heldFoilCodes).toEqual(['V'])
  })

  it('goes back to every choice once answers recover', () => {
    const recovered = [...struggling, ...asked('item-006', ['target']), ...asked('item-007', ['target'])]
    expect(decide(recovered, round(1, ['item-001']))?.presentation).toBe('FULL_SET')
  })
})

describe('gradual introduction of harder foil tiers', () => {
  const level4 = level(4)
  const withPh = level4.find((i) => i.foils.some((f) => f.code === 'PH') && i.foils.filter((f) => tierOf(f.code) < 3).length >= 2)
  if (!withPh) throw new Error('fixture: no level-4 item with PH and two easier foils')

  it('holds harder tiers back until the child shows readiness in the skill', () => {
    const d = decide([], round(4, [withPh.id]))
    expect(d?.presentation).toBe('HOLD_HARDER_FOILS')
    expect(d?.foilCodes.every((c) => tierOf(c) < 3)).toBe(true)
    expect(d?.evidence.heldFoilCodes).toContain('PH')
  })

  it('never drops below the minimum number of foils', () => {
    const mostlyHard = content.items.find((i) => i.foils.filter((f) => tierOf(f.code) >= 3).length >= 2)
    if (!mostlyHard) throw new Error('fixture')
    const d = decide([], round(mostlyHard.level, [mostlyHard.id]))
    expect(d?.foilWords.length).toBeGreaterThanOrEqual(DEFAULT_POLICY_CONFIG.minFoils)
  })

  it('introduces them once readiness is reached, then treats them as normal', () => {
    const others = level4.filter((i) => i.id !== withPh.id).slice(0, 4)
    const easyCodes = (id: string) => itemById(id).foils.map((f) => f.code).filter((c) => tierOf(c) < 3)
    const ready = others.flatMap((i, n) => asked(i.id, ['target'], NOW - 60_000 + n * 10, easyCodes(i.id)))
    const introduced = decide(ready, round(4, [withPh.id]))
    expect(introduced?.presentation).toBe('INTRODUCE_NEW_CHALLENGE')
    expect(introduced?.foilCodes).toContain('PH')

    const afterIntro = [...ready, ...asked(others[0]?.id ?? '', ['target'], NOW - 1000)]
    expect(decide(afterIntro, round(4, [withPh.id]))?.presentation).toBe('FULL_SET')
  })
})

describe('spaced review', () => {
  it('reviews an earlier skill that has not been practised for the configured interval', () => {
    const longAgo = NOW - 2 * DAY
    const history = [...asked('item-001', ['target'], longAgo), ...asked('item-002', ['wrong', 'target'], longAgo + 100)]
    const d = decide(history, round(2, level(2).slice(0, 5).map((i) => i.id)))
    expect(d).toMatchObject({ strategy: 'SPACED_REVIEW', countsForStars: false })
    expect(d?.itemId).toBe('item-002') // the weaker word first
  })

  it('does not review a skill practised recently', () => {
    const history = asked('item-001', ['target'], NOW - 60_000)
    expect(decide(history, round(2, [level(2)[0]?.id ?? '']))?.considered).toContainEqual({
      strategy: 'SPACED_REVIEW',
      skipped: 'NOT_DUE',
    })
  })
})

describe('transfer to unseen words', () => {
  const secure = (ids: string[]) => ids.flatMap((id, n) => asked(id, ['target'], NOW - 60_000 + n * 10))

  it('tries an approved word of the same skill that the child has never seen', () => {
    const history = secure([...level1Puzzle1, 'item-011', 'item-012', 'item-013'])
    const d = decide(history, round(1, level1Puzzle1.slice(1)))
    expect(d).toMatchObject({ strategy: 'TRANSFER_CHECK', itemId: 'item-006', countsForStars: false })
  })

  it('records when no unseen word is left', () => {
    const history = secure(level(1).map((i) => i.id))
    expect(decide(history, round(1, ['item-001']))?.considered).toContainEqual({ strategy: 'TRANSFER_CHECK', skipped: 'TRANSFER_UNAVAILABLE' })
  })

  it('waits until there is enough evidence', () => {
    const d = decide(secure(['item-001', 'item-002']), round(1, ['item-003']))
    expect(d?.considered).toContainEqual({ strategy: 'TRANSFER_CHECK', skipped: 'NOT_READY' })
  })
})

describe('end of the puzzle', () => {
  it('consolidates a word the child missed on the first try', () => {
    const r = round(1, [], {
      asked: [
        { itemId: 'item-001', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: false },
        { itemId: 'item-002', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: true },
      ],
    })
    expect(decide([], r)).toMatchObject({ strategy: 'CONSOLIDATE', itemId: 'item-001', countsForStars: false })
  })

  it('never re-asks the word that was just answered, even when it would otherwise be chosen', () => {
    // item-001 is the only missed word, but it is also the one just answered.
    const r = round(1, [], {
      asked: [
        { itemId: 'item-002', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: true },
        { itemId: 'item-001', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: false },
      ],
    })
    // Nothing else to do, so the puzzle ends rather than repeating the same word.
    expect(decide([], r)).toBeNull()

    // Focused practice: the oldest familiar word with the pattern is the one just answered.
    const pattern = [...missed('item-002', 'V', NOW - 9000), ...missed('item-003', 'V', NOW - 5000), ...missed('item-004', 'V', NOW - 1000)]
    const focus = decide(pattern, round(1, ['item-005'], { asked: [{ itemId: 'item-002', strategy: 'CONTINUE_SEQUENCE', firstTryCorrect: false }] }))
    expect(focus?.strategy).toBe('FOCUS_ERROR_PATTERN')
    expect(focus?.itemId).not.toBe('item-002')
  })

  it('mixes in a familiar word from an earlier skill', () => {
    const history = asked('item-003', ['target'], NOW - 60_000)
    expect(decide(history, round(2, []))).toMatchObject({ strategy: 'MIXED_PRACTICE', itemId: 'item-003' })
  })

  it('finishes when there is nothing left to do', () => {
    expect(decide([], round(1, []))).toBeNull()
    expect(decide([], round(1, [], { extrasUsed: 3 }))).toBeNull()
  })
})

describe('policy guarantees', () => {
  it('is deterministic for the same inputs and seed', () => {
    const history = [...missed('item-002', 'V'), ...missed('item-003', 'V'), ...missed('item-004', 'V')]
    expect(decide(history, round(1, ['item-005']), DEFAULT_POLICY_CONFIG, 7)).toEqual(
      decide(history, round(1, ['item-005']), DEFAULT_POLICY_CONFIG, 7),
    )
  })

  it('only ever presents approved words with their own approved foils', () => {
    const random = seededRandom(42)
    for (let trial = 0; trial < 150; trial++) {
      const lvl = 1 + Math.floor(random() * 10)
      const pool = content.items.filter((i) => i.level <= lvl)
      const history = Array.from({ length: Math.floor(random() * 25) }, (_, n) => {
        const item = pool[Math.floor(random() * pool.length)] ?? pool[0]
        const code = item?.foils[Math.floor(random() * 3)]?.code ?? 'V'
        return random() < 0.5 ? missed(item?.id ?? '', code, NOW - (n + 1) * DAY * random()) : asked(item?.id ?? '', ['target'], NOW - n * 1000)
      }).flat()
      const queue = level(lvl).slice(0, Math.floor(random() * 5)).map((i) => i.id)
      const d = decide(history, round(lvl, queue, { extrasUsed: Math.floor(random() * 4) }), DEFAULT_POLICY_CONFIG, trial)
      if (!d) continue
      const item = itemById(d.itemId)
      expect(item.level).toBeLessThanOrEqual(lvl)
      expect(d.foilWords.every((w) => item.foils.some((f) => f.word === w))).toBe(true)
      expect(d.foilWords.length).toBeGreaterThanOrEqual(DEFAULT_POLICY_CONFIG.minFoils)
      expect(d.foilCodes).toEqual(d.foilWords.map((w) => item.foils.find((f) => f.word === w)?.code))
      // A sequence step is always the puzzle's next new word.
      expect(d.strategy !== 'CONTINUE_SEQUENCE' || d.itemId === queue[0]).toBe(true)
    }
  })
})
