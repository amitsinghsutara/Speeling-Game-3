import { describe, expect, it } from 'vitest'
import { loadContent } from '../content/loadContent.ts'
import { emptyProgress, type SavedProgress } from '../persistence/progressRepository.ts'
import { seededRandom } from './random.ts'
import { createGameModel, gameReducer, initialGameState, type GameAction, type GameState } from './session.ts'

const model = createGameModel(loadContent())
const random = seededRandom(9)
const run = (state: GameState, ...actions: GameAction[]) => actions.reduce((s, a) => gameReducer(model, s, a), state)
const start = (progress: SavedProgress = emptyProgress()) => run(initialGameState(progress), { type: 'play' })

const targetOf = (state: GameState): string => {
  if (state.screen.name !== 'question') throw new Error(`not on a question: ${state.screen.name}`)
  return state.screen.question.question.target
}
const wrongOf = (state: GameState, n = 0): string => {
  if (state.screen.name !== 'question') throw new Error('not on a question')
  const foil = state.screen.question.question.choices.filter((c) => !c.isTarget)[n]
  if (!foil) throw new Error('no foil')
  return foil.word
}

/** Answers every question in the current puzzle, making `mistakes` wrong taps on the first question. */
function finishPuzzle(state: GameState, mistakes = 0): GameState {
  let s = state
  for (let m = 0; m < mistakes; m++) s = run(s, { type: 'answer', word: wrongOf(s, m % 3), now: 1 })
  while (s.screen.name === 'question') {
    s = run(s, { type: 'answer', word: targetOf(s), now: 2 }, { type: 'next', random, now: 3 })
  }
  return s
}

const level1 = model.puzzlesByLevel.get(1) ?? []
const puzzleIds = (level: number) => (model.puzzlesByLevel.get(level) ?? []).map((p) => p.id)

describe('game session', () => {
  it('goes welcome → home → level map → first question of the puzzle', () => {
    const s = run(start(), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 })
    expect(s.screen).toMatchObject({ name: 'question', level: 1, index: 0 })
    expect(targetOf(s)).toBe('sat')
  })

  it('refuses locked levels and puzzles', () => {
    const home = start()
    expect(run(home, { type: 'openLevel', level: 2 })).toBe(home)
    const map = run(home, { type: 'openLevel', level: 1 })
    expect(run(map, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-2', random, now: 0 })).toBe(map)
    expect(run(map, { type: 'startPuzzle', puzzleId: 'level-2/puzzle-1', random, now: 0 })).toBe(map)
  })

  it('only moves on once the question is answered correctly', () => {
    const q = run(start(), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 })
    expect(run(q, { type: 'next', random, now: 1 })).toBe(q)
    const wrong = run(q, { type: 'answer', word: wrongOf(q), now: 1 })
    expect(run(wrong, { type: 'next', random, now: 2 })).toBe(wrong)
    expect(wrong.screen).toMatchObject({ mistakes: 1, lastOutcome: { kind: 'incorrect' } })
  })

  it('does not count a repeated tap on the same wrong tile', () => {
    const q = run(start(), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 })
    const word = wrongOf(q)
    const twice = run(q, { type: 'answer', word, now: 1 }, { type: 'answer', word, now: 2 })
    expect(twice.screen).toMatchObject({ mistakes: 1 })
  })

  it('completes a flawless puzzle with 3 stars and saves it', () => {
    const q = run(start(), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 })
    const done = finishPuzzle(q)
    expect(done.screen).toEqual({ name: 'puzzleComplete', level: 1, puzzleId: 'level-1/puzzle-1', stars: 3 })
    expect(done.progress.completedPuzzleIds).toEqual(['level-1/puzzle-1'])
    expect(done.progress.starsByPuzzleId).toEqual({ 'level-1/puzzle-1': 3 })
  })

  it('awards stars by mistakes across the puzzle, keeping the best on replay', () => {
    const open = (s: GameState) => run(s, { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 })
    const first = finishPuzzle(open(start()), 3)
    expect(first.screen).toMatchObject({ stars: 2 })
    const replay = finishPuzzle(open(run(first, { type: 'home' })), 0)
    expect(replay.progress.starsByPuzzleId['level-1/puzzle-1']).toBe(3)
    const worse = finishPuzzle(open(run(replay, { type: 'home' })), 3)
    expect(worse.screen).toMatchObject({ stars: 2 })
    expect(worse.progress.starsByPuzzleId['level-1/puzzle-1']).toBe(3)
    expect(worse.progress.completedPuzzleIds).toEqual(['level-1/puzzle-1'])
  })

  it('goes on to the next puzzle, and ends the level on its last puzzle', () => {
    const progress: SavedProgress = {
      ...emptyProgress(),
      completedPuzzleIds: puzzleIds(1).slice(0, 4),
      starsByPuzzleId: Object.fromEntries(puzzleIds(1).slice(0, 4).map((id) => [id, 3])),
    }
    const firstDone = finishPuzzle(run(start(), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: 'level-1/puzzle-1', random, now: 0 }))
    const next = run(firstDone, { type: 'nextPuzzle', random, now: 0 })
    expect(next.screen).toMatchObject({ name: 'question', puzzleId: 'level-1/puzzle-2', index: 0 })

    const last = level1.at(-1)
    const ended = finishPuzzle(run(start(progress), { type: 'openLevel', level: 1 }, { type: 'startPuzzle', puzzleId: last?.id ?? '', random, now: 0 }))
    expect(ended.screen).toMatchObject({ name: 'levelComplete', level: 1 })
    expect(model.levelStatus(ended.progress, 2)).toBe('available')
    expect(run(ended, { type: 'nextLevel' }).screen).toEqual({ name: 'puzzles', level: 2 })
  })

  it('reports level stars as earned out of the maximum', () => {
    const progress = { ...emptyProgress(), starsByPuzzleId: { 'level-1/puzzle-1': 2, 'level-1/puzzle-2': 3 } }
    expect(model.levelStars(progress, 1)).toEqual({ earned: 5, max: 15 })
  })
})
