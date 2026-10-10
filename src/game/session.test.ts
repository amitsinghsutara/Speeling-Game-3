import { describe, expect, it } from 'vitest'
import { loadContent } from '../content/loadContent.ts'
import { emptyProgress, type SavedProgress } from '../persistence/progressRepository.ts'
import { seededRandom } from './random.ts'
import { createGameModel, gameReducer, initialGameState, roundProgress, type GameAction, type GameState } from './session.ts'

const model = createGameModel(loadContent())
const random = seededRandom(9)
let ids = 0
const env = (now: number) => ({ random, now, newId: () => `id-${++ids}` })
const run = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(model, s, a), state)
const start = (progress: SavedProgress = emptyProgress()) => run(initialGameState(progress, 'session-1'), { type: 'play' })
const open = (state: GameState, puzzleId = 'level-1/puzzle-1') =>
  run(state, { type: 'openLevel', level: Number(/level-(\d+)/.exec(puzzleId)?.[1]) }, { type: 'startPuzzle', puzzleId, env: env(1000) })

const question = (state: GameState) => {
  if (state.screen.name !== 'question') throw new Error(`not on a question: ${state.screen.name}`)
  return state.screen
}
const targetOf = (state: GameState): string => question(state).question.question.target
const wrongOf = (state: GameState, n = 0): string => {
  const foil = question(state).question.question.choices.filter((c) => !c.isTarget)[n]
  if (!foil) throw new Error('no foil')
  return foil.word
}

/**
 * Answers every question in the round, making `mistakes` wrong taps on the first
 * of the puzzle's own words (extras chosen by the policy never cost stars).
 */
function finishPuzzle(state: GameState, mistakes = 0): GameState {
  let s = state
  let t = 2000
  while (s.screen.name === 'question' && !s.screen.decision.countsForStars) {
    s = run(s, { type: 'answer', word: targetOf(s), env: env((t += 500)) }, { type: 'next', env: env((t += 500)) })
  }
  for (let m = 0; m < mistakes; m++) s = run(s, { type: 'answer', word: wrongOf(s, m % 2), env: env((t += 500)) })
  for (let guard = 0; s.screen.name === 'question' && guard < 20; guard++) {
    s = run(s, { type: 'answer', word: targetOf(s), env: env((t += 500)) }, { type: 'next', env: env((t += 500)) })
  }
  return s
}

const puzzleIds = (level: number) => (model.puzzlesByLevel.get(level) ?? []).map((p) => p.id)

describe('game session', () => {
  it('goes welcome → home → level map → the puzzle’s first word, chosen by the policy', () => {
    const s = open(start())
    expect(targetOf(s)).toBe('sat')
    expect(question(s).decision).toMatchObject({ strategy: 'CONTINUE_SEQUENCE', itemId: 'item-001', countsForStars: true })
    expect(s.decisions).toHaveLength(1)
  })

  it('refuses locked levels and puzzles', () => {
    const home = start()
    expect(run(home, { type: 'openLevel', level: 2 })).toBe(home)
    const map = run(home, { type: 'openLevel', level: 1 })
    expect(run(map, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-2', env: env(0) })).toBe(map)
    expect(run(map, { type: 'startPuzzle', puzzleId: 'level-2/puzzle-1', env: env(0) })).toBe(map)
  })

  it('only moves on once the question is answered correctly', () => {
    const q = open(start())
    expect(run(q, { type: 'next', env: env(1) })).toBe(q)
    const wrong = run(q, { type: 'answer', word: wrongOf(q), env: env(1500) })
    expect(run(wrong, { type: 'next', env: env(2) })).toBe(wrong)
    expect(wrong.screen).toMatchObject({ mistakes: 1, lastOutcome: { kind: 'incorrect' } })
  })

  it('records one learning event per real attempt, linked to its decision', () => {
    const q = open(start())
    const word = wrongOf(q)
    const s = run(
      q,
      { type: 'answer', word, env: env(1500) },
      { type: 'answer', word, env: env(1600) },
      { type: 'answer', word: 'sat', env: env(1900) },
    )
    const decisionId = question(q).decision.id
    expect(s.events.map((e) => [e.correct, e.attemptNumber, e.decisionId, e.questionId])).toEqual([
      [false, 1, decisionId, decisionId],
      [true, 2, decisionId, decisionId],
    ])
    expect(s.events[0]).toMatchObject({ elapsedMs: 500, chosenWord: word, presentedFoilCodes: question(q).decision.foilCodes })
    expect(question(s).mistakes).toBe(1)
  })

  it('completes a flawless puzzle with 3 stars and saves it', () => {
    const done = finishPuzzle(open(start()))
    expect(done.screen).toEqual({ name: 'puzzleComplete', level: 1, puzzleId: 'level-1/puzzle-1', stars: 3 })
    expect(done.progress.completedPuzzleIds).toEqual(['level-1/puzzle-1'])
    expect(done.decisions.filter((d) => d.strategy === 'CONTINUE_SEQUENCE').map((d) => d.itemId)).toEqual(
      model.findPuzzle('level-1/puzzle-1')?.itemIds,
    )
  })

  it('consolidates a missed word before the puzzle ends, without costing extra stars', () => {
    const done = finishPuzzle(open(start()), 2)
    const strategies = done.decisions.map((d) => d.strategy)
    expect(strategies.filter((s) => s === 'CONTINUE_SEQUENCE')).toHaveLength(5)
    expect(done.decisions.find((d) => d.strategy === 'CONSOLIDATE')?.itemId).toBe('item-001')
    expect(done.screen).toMatchObject({ name: 'puzzleComplete', stars: 2 })
  })

  it('keeps the best stars on replay', () => {
    const first = finishPuzzle(open(start()), 2)
    const replay = finishPuzzle(open(run(first, { type: 'home' })), 0)
    expect(replay.progress.starsByPuzzleId['level-1/puzzle-1']).toBe(3)
    const worse = finishPuzzle(open(run(replay, { type: 'home' })), 2)
    expect(worse.screen).toMatchObject({ stars: 2 })
    // By now level 1 looks secure, so the policy tested transfer to an unseen level-1 word.
    expect(worse.decisions.some((d) => d.strategy === 'TRANSFER_CHECK')).toBe(true)
    expect(worse.progress.starsByPuzzleId['level-1/puzzle-1']).toBe(3)
    expect(worse.progress.completedPuzzleIds).toEqual(['level-1/puzzle-1'])
  })

  it('shows progress through the puzzle’s own words only', () => {
    const q = open(start())
    expect(roundProgress(question(q), model.findPuzzle('level-1/puzzle-1'))).toEqual({ done: 0, total: 5 })
    const next = run(q, { type: 'answer', word: 'sat', env: env(1500) }, { type: 'next', env: env(1600) })
    expect(roundProgress(question(next), model.findPuzzle('level-1/puzzle-1'))).toEqual({ done: 1, total: 5 })
  })

  it('goes on to the next puzzle, and ends the level on its last puzzle', () => {
    const next = run(finishPuzzle(open(start())), { type: 'nextPuzzle', env: env(9000) })
    expect(question(next).puzzleId).toBe('level-1/puzzle-2')

    const progress: SavedProgress = { ...emptyProgress(), completedPuzzleIds: puzzleIds(1).slice(0, 4) }
    const ended = finishPuzzle(open(start(progress), puzzleIds(1).at(-1)))
    expect(ended.screen).toMatchObject({ name: 'levelComplete', level: 1 })
    expect(model.levelStatus(ended.progress, 2)).toBe('available')
    expect(run(ended, { type: 'nextLevel' }).screen).toEqual({ name: 'puzzles', level: 2 })
  })

  it('merges stored events under the session’s own, without duplicates', () => {
    const s = run(open(start()), { type: 'answer', word: 'sat', env: env(1500) })
    const [own] = s.events
    if (!own) throw new Error('no event')
    const stored = { ...own, id: 'stored-1', at: 10 }
    const merged = run(s, { type: 'eventsLoaded', events: [stored, own] })
    expect(merged.events.map((e) => e.id)).toEqual(['stored-1', own.id])
  })

  it('reports level stars as earned out of the maximum', () => {
    const progress = { ...emptyProgress(), starsByPuzzleId: { 'level-1/puzzle-1': 2, 'level-1/puzzle-2': 3 } }
    expect(model.levelStars(progress, 1)).toEqual({ earned: 5, max: 15 })
  })
})
