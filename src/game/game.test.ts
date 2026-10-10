import { describe, expect, it } from 'vitest'
import { codebookEntry, loadContent } from '../content/loadContent.ts'
import type { Item } from '../content/schema.ts'
import { answer, mistakesIn, startQuestion } from './answer.ts'
import { buildPuzzles, chunk, levelStatuses, puzzleId, puzzleStatuses } from './progression.ts'
import { InvalidQuestionError, buildQuestion, easiestFoils } from './question.ts'
import { seededRandom, shuffle } from './random.ts'
import { bestStars, starsForMistakes } from './scoring.ts'

const content = loadContent()
const itemById = (id: string): Item => {
  const item = content.items.find((i) => i.id === id)
  if (!item) throw new Error(`no ${id}`)
  return item
}
const required = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error('fixture value missing')
  return value
}
const tierOf = (code: string) => codebookEntry(content, code)?.tier ?? Number.POSITIVE_INFINITY
const sat = itemById('item-001') // sat: sit (V), sap (FC), hat (IC)

describe('random', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    const values = Array.from({ length: 1000 }, () => a())
    expect(values).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
  })

  it('shuffles to a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffle(input, seededRandom(7))
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...output].sort()).toEqual(input)
  })
})

describe('buildQuestion', () => {
  it('for every approved item, includes the target exactly once with each foil once', () => {
    for (const item of content.items) {
      for (let seed = 0; seed < 5; seed++) {
        const { choices } = buildQuestion(item, { random: seededRandom(seed) })
        expect(choices.filter((c) => c.isTarget).map((c) => c.word)).toEqual([item.target])
        expect(choices.filter((c) => !c.isTarget).map((c) => c.word).sort()).toEqual(
          item.foils.map((f) => f.word).sort(),
        )
        expect(new Set(choices.map((c) => c.word)).size).toBe(choices.length)
      }
    }
  })

  it('does not fix the target to one position (checked over fixed seeds, not chance)', () => {
    const positions = new Set(
      Array.from({ length: 64 }, (_, seed) =>
        buildQuestion(sat, { random: seededRandom(seed) }).choices.findIndex((c) => c.isTarget),
      ),
    )
    expect(positions).toEqual(new Set([0, 1, 2, 3]))
  })

  it('carries each foil code for learning events', () => {
    const { choices } = buildQuestion(sat, { random: seededRandom(1) })
    expect(choices.find((c) => c.word === 'sap')?.foilCode).toBe('FC')
    expect(choices.find((c) => c.isTarget)?.foilCode).toBeUndefined()
  })

  it('presents a subset of the item’s own foils for scaffolding', () => {
    const { choices } = buildQuestion(sat, { random: seededRandom(1), foils: [required(sat.foils[0])] })
    expect(choices.map((c) => c.word).sort()).toEqual(['sat', 'sit'])
  })

  it('refuses foils that are not approved for the item, empty sets, and repeats', () => {
    const random = seededRandom(1)
    expect(() => buildQuestion(sat, { random, foils: [{ word: 'set', code: 'V' }] })).toThrow(InvalidQuestionError)
    expect(() => buildQuestion(sat, { random, foils: [{ word: 'sit', code: 'FC' }] })).toThrow(InvalidQuestionError)
    expect(() => buildQuestion(sat, { random, foils: [] })).toThrow(InvalidQuestionError)
    const first = required(sat.foils[0])
    expect(() => buildQuestion(sat, { random, foils: [first, first] })).toThrow(/repeated/)
  })
})

describe('easiestFoils', () => {
  it('orders by codebook tier, keeping spreadsheet order among equal tiers', () => {
    // sat: sit (V, tier 2), sap (FC, tier 1), hat (IC, tier 1)
    expect(easiestFoils(sat, tierOf, 2).map((f) => f.word)).toEqual(['sap', 'hat'])
    expect(easiestFoils(sat, tierOf, 3).map((f) => f.word)).toEqual(['sap', 'hat', 'sit'])
  })

  it('always keeps at least one foil', () => {
    expect(easiestFoils(sat, tierOf, 0)).toHaveLength(1)
  })

  it('drops pseudohomophones (tier 4) first when they exist', () => {
    const withPh = required(content.items.find((i) => i.foils.some((f) => f.code === 'PH')))
    expect(easiestFoils(withPh, tierOf, 2).map((f) => f.code)).not.toContain('PH')
  })
})

describe('answer', () => {
  const question = buildQuestion(sat, { random: seededRandom(3) })

  it('disables a wrong choice, counts it once, and stays on the question', () => {
    const first = answer(startQuestion(question, 1000), 'sit', 1800)
    expect(first.outcome).toEqual({
      kind: 'incorrect',
      attempt: { word: 'sit', correct: false, foilCode: 'V', attemptNumber: 1, elapsedMs: 800 },
    })
    expect(first.state.status).toBe('retry')
    expect(first.state.disabledWords).toEqual(['sit'])

    const repeat = answer(first.state, 'sit', 1900)
    expect(repeat.outcome).toEqual({ kind: 'ignored', reason: 'already-tried' })
    expect(mistakesIn(repeat.state)).toBe(1)
  })

  it('accepts the target, then ignores every further tap', () => {
    const wrong = answer(startQuestion(question, 0), 'hat', 10)
    const right = answer(wrong.state, 'sat', 20)
    expect(right.outcome).toMatchObject({ kind: 'correct', attempt: { attemptNumber: 2 } })
    expect(right.state.status).toBe('correct')

    const again = answer(right.state, 'sat', 30)
    const late = answer(again.state, 'sap', 40)
    expect(again.outcome).toEqual({ kind: 'ignored', reason: 'already-correct' })
    expect(late.outcome).toEqual({ kind: 'ignored', reason: 'already-correct' })
    expect(late.state.attempts).toHaveLength(2)
  })

  it('ignores words that are not on screen', () => {
    expect(answer(startQuestion(question, 0), 'cat', 5).outcome).toEqual({ kind: 'ignored', reason: 'not-a-choice' })
  })
})

describe('scoring', () => {
  it('awards stars by mistakes in the puzzle', () => {
    expect([0, 1, 3, 4, 20].map(starsForMistakes)).toEqual([3, 2, 2, 1, 1])
  })

  it('never lowers a stored result', () => {
    expect(bestStars(undefined, 1)).toBe(1)
    expect(bestStars(3, 1)).toBe(3)
    expect(bestStars(2, 3)).toBe(3)
  })
})

describe('progression', () => {
  it('chunks as evenly as possible with the remainder first', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5).map((c) => c.length)).toEqual([2, 2, 1, 1, 1])
    expect(chunk([1, 2], 5).map((c) => c.length)).toEqual([1, 1])
    expect(chunk([], 5)).toEqual([])
  })

  it('splits every level into puzzles covering every item once, in sequence', () => {
    const puzzles = buildPuzzles(content)
    const allIds = [...puzzles.values()].flat().flatMap((p) => p.itemIds)
    expect(allIds).toHaveLength(200)
    expect(new Set(allIds).size).toBe(200)
    expect(puzzles.get(1)?.map((p) => p.itemIds.length)).toEqual([5, 5, 5, 5, 5])
    expect(puzzles.get(9)?.map((p) => p.itemIds.length)).toEqual([2, 2, 2, 2, 2])
    expect(puzzles.get(1)?.[0]?.itemIds.slice(0, 2)).toEqual(['item-001', 'item-002'])
  })

  it('unlocks levels only after the previous level is fully complete', () => {
    const puzzles = buildPuzzles(content)
    const level1 = (puzzles.get(1) ?? []).map((p) => p.id)
    expect(levelStatuses(puzzles, new Set()).get(1)).toBe('available')
    expect(levelStatuses(puzzles, new Set()).get(2)).toBe('locked')
    expect(levelStatuses(puzzles, new Set(level1.slice(0, 4))).get(2)).toBe('locked')

    const statuses = levelStatuses(puzzles, new Set(level1))
    expect(statuses.get(1)).toBe('completed')
    expect(statuses.get(2)).toBe('available')
    expect(statuses.get(3)).toBe('locked')
  })

  it('unlocks puzzles one after another, and none in a locked level', () => {
    const level1 = buildPuzzles(content).get(1) ?? []
    const statuses = puzzleStatuses(level1, new Set([puzzleId(1, 1)]), 'available')
    expect([...statuses.values()]).toEqual(['completed', 'available', 'locked', 'locked', 'locked'])
    expect([...puzzleStatuses(level1, new Set(), 'locked').values()].every((s) => s === 'locked')).toBe(true)
  })
})
