/**
 * Screen-to-screen game flow as a pure reducer. Randomness and time arrive in
 * actions, so every transition is reproducible in tests. Locked levels and
 * puzzles cannot be entered, whatever the UI sends.
 */
import type { ContentDataset, Item } from '../content/schema.ts'
import type { SavedProgress } from '../persistence/progressRepository.ts'
import { answer, mistakesIn, startQuestion, type AnswerOutcome, type QuestionState } from './answer.ts'
import { buildPuzzles, levelStatuses, puzzleStatuses, type Puzzle, type Status } from './progression.ts'
import { buildQuestion } from './question.ts'
import type { RandomSource } from './random.ts'
import { MAX_STARS, bestStars, starsForMistakes } from './scoring.ts'

export type Screen =
  | { name: 'welcome' }
  | { name: 'home' }
  | { name: 'puzzles'; level: number }
  | {
      name: 'question'
      level: number
      puzzleId: string
      index: number
      question: QuestionState
      /** Wrong answers across the whole puzzle so far. */
      mistakes: number
      lastOutcome: AnswerOutcome | null
    }
  | { name: 'puzzleComplete'; level: number; puzzleId: string; stars: number }
  | { name: 'levelComplete'; level: number; puzzleId: string; stars: number }

export interface GameState {
  screen: Screen
  progress: SavedProgress
}

export type GameAction =
  | { type: 'play' }
  | { type: 'home' }
  | { type: 'openLevel'; level: number }
  | { type: 'startPuzzle'; puzzleId: string; random: RandomSource; now: number }
  | { type: 'answer'; word: string; now: number }
  | { type: 'next'; random: RandomSource; now: number }
  | { type: 'backToPuzzles' }
  | { type: 'nextPuzzle'; random: RandomSource; now: number }
  | { type: 'nextLevel' }

export interface GameModel {
  content: ContentDataset
  puzzlesByLevel: Map<number, Puzzle[]>
  itemsById: Map<string, Item>
  levelStatus(progress: SavedProgress, level: number): Status
  puzzleStatus(progress: SavedProgress, puzzle: Puzzle): Status
  findPuzzle(puzzleId: string): Puzzle | undefined
  levelStars(progress: SavedProgress, level: number): { earned: number; max: number }
}

export function createGameModel(content: ContentDataset): GameModel {
  const puzzlesByLevel = buildPuzzles(content)
  const itemsById = new Map(content.items.map((i) => [i.id, i]))
  const allPuzzles = [...puzzlesByLevel.values()].flat()
  const completed = (p: SavedProgress) => new Set(p.completedPuzzleIds)
  const levelStatus = (progress: SavedProgress, level: number): Status =>
    levelStatuses(puzzlesByLevel, completed(progress)).get(level) ?? 'locked'

  return {
    content,
    puzzlesByLevel,
    itemsById,
    levelStatus,
    puzzleStatus(progress, puzzle) {
      const puzzles = puzzlesByLevel.get(puzzle.level) ?? []
      return (
        puzzleStatuses(puzzles, completed(progress), levelStatus(progress, puzzle.level)).get(puzzle.id) ??
        'locked'
      )
    },
    findPuzzle: (puzzleId) => allPuzzles.find((p) => p.id === puzzleId),
    levelStars(progress, level) {
      const puzzles = puzzlesByLevel.get(level) ?? []
      return {
        earned: puzzles.reduce((sum, p) => sum + (progress.starsByPuzzleId[p.id] ?? 0), 0),
        max: puzzles.length * MAX_STARS,
      }
    },
  }
}

export const initialGameState = (progress: SavedProgress): GameState => ({ screen: { name: 'welcome' }, progress })

function questionScreen(
  model: GameModel,
  puzzle: Puzzle,
  index: number,
  mistakes: number,
  random: RandomSource,
  now: number,
): Screen | null {
  const itemId = puzzle.itemIds[index]
  const item = itemId === undefined ? undefined : model.itemsById.get(itemId)
  if (!item) return null
  return {
    name: 'question',
    level: puzzle.level,
    puzzleId: puzzle.id,
    index,
    question: startQuestion(buildQuestion(item, { random }), now),
    mistakes,
    lastOutcome: null,
  }
}

function startPuzzle(model: GameModel, state: GameState, puzzleId: string, random: RandomSource, now: number) {
  const puzzle = model.findPuzzle(puzzleId)
  if (!puzzle || model.puzzleStatus(state.progress, puzzle) === 'locked') return state
  const screen = questionScreen(model, puzzle, 0, 0, random, now)
  return screen ? { ...state, screen } : state
}

function completePuzzle(model: GameModel, state: GameState, puzzle: Puzzle, mistakes: number): GameState {
  const stars = starsForMistakes(mistakes)
  const progress: SavedProgress = {
    ...state.progress,
    completedPuzzleIds: state.progress.completedPuzzleIds.includes(puzzle.id)
      ? state.progress.completedPuzzleIds
      : [...state.progress.completedPuzzleIds, puzzle.id],
    starsByPuzzleId: {
      ...state.progress.starsByPuzzleId,
      [puzzle.id]: bestStars(state.progress.starsByPuzzleId[puzzle.id], stars),
    },
  }
  const isLast = puzzle.number === (model.puzzlesByLevel.get(puzzle.level)?.length ?? 0)
  return {
    progress,
    screen: { name: isLast ? 'levelComplete' : 'puzzleComplete', level: puzzle.level, puzzleId: puzzle.id, stars },
  }
}

export function gameReducer(model: GameModel, state: GameState, action: GameAction): GameState {
  const { screen } = state
  switch (action.type) {
    case 'play':
    case 'home':
      return { ...state, screen: { name: 'home' } }

    case 'openLevel':
      if (!model.puzzlesByLevel.has(action.level)) return state
      if (model.levelStatus(state.progress, action.level) === 'locked') return state
      return { ...state, screen: { name: 'puzzles', level: action.level } }

    case 'startPuzzle':
      return startPuzzle(model, state, action.puzzleId, action.random, action.now)

    case 'answer': {
      if (screen.name !== 'question') return state
      const result = answer(screen.question, action.word, action.now)
      if (result.outcome.kind === 'ignored') return state
      const added = mistakesIn(result.state) - mistakesIn(screen.question)
      return {
        ...state,
        screen: { ...screen, question: result.state, mistakes: screen.mistakes + added, lastOutcome: result.outcome },
      }
    }

    case 'next': {
      if (screen.name !== 'question' || screen.question.status !== 'correct') return state
      const puzzle = model.findPuzzle(screen.puzzleId)
      if (!puzzle) return state
      if (screen.index + 1 >= puzzle.itemIds.length) return completePuzzle(model, state, puzzle, screen.mistakes)
      const next = questionScreen(model, puzzle, screen.index + 1, screen.mistakes, action.random, action.now)
      return next ? { ...state, screen: next } : state
    }

    case 'backToPuzzles':
      if (screen.name === 'welcome' || screen.name === 'home') return state
      return { ...state, screen: { name: 'puzzles', level: screen.level } }

    case 'nextPuzzle': {
      if (screen.name !== 'puzzleComplete') return state
      const current = model.findPuzzle(screen.puzzleId)
      const next = current && model.puzzlesByLevel.get(current.level)?.[current.number]
      return next ? startPuzzle(model, state, next.id, action.random, action.now) : state
    }

    case 'nextLevel': {
      if (screen.name !== 'levelComplete') return state
      return gameReducer(model, state, { type: 'openLevel', level: screen.level + 1 })
    }
  }
}
