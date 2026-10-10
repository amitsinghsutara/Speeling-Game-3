/**
 * Screen-to-screen game flow as a pure reducer. Randomness, time and ids arrive
 * in actions, so a whole play-through is reproducible in tests. Locked levels
 * and puzzles cannot be entered, whatever the UI sends.
 *
 * Every question comes from the adaptive policy: the puzzle's own new words in
 * curriculum order, plus a few policy-chosen extras that never cost stars.
 */
import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from '../adaptive/config.ts'
import type { AdaptiveDecision } from '../adaptive/decision.ts'
import { advanceRound, decideNext, startRound, type RoundState } from '../adaptive/policy.ts'
import { isAdviceUsable } from '../adviser/client.ts'
import type { ValidatedAdvice } from '../adviser/schema.ts'
import type { ContentDataset, Item } from '../content/schema.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG, type LearnerModelConfig } from '../learner/config.ts'
import { createLearningEvent, type LearningEvent } from '../learner/events.ts'
import { buildLearnerModel } from '../learner/model.ts'
import { emptyProgress, type SavedProgress } from '../persistence/progressRepository.ts'
import { answer, startQuestion, type AnswerOutcome, type QuestionState } from './answer.ts'
import { buildPuzzles, levelStatuses, puzzleStatuses, type Puzzle, type Status } from './progression.ts'
import { buildQuestion } from './question.ts'
import type { RandomSource } from './random.ts'
import { MAX_STARS, bestStars, starsForMistakes } from './scoring.ts'

export type Screen =
  | { name: 'welcome' }
  | { name: 'home' }
  | { name: 'grownUps' }
  | { name: 'puzzles'; level: number }
  | {
      name: 'question'
      level: number
      puzzleId: string
      round: RoundState
      decision: AdaptiveDecision
      question: QuestionState
      /** Wrong answers on the puzzle's own words (extras never cost stars). */
      mistakes: number
      lastOutcome: AnswerOutcome | null
    }
  | { name: 'puzzleComplete'; level: number; puzzleId: string; stars: number }
  | { name: 'levelComplete'; level: number; puzzleId: string; stars: number }

export interface GameState {
  screen: Screen
  progress: SavedProgress
  sessionId: string
  /** Every learning event known on this device, oldest first. */
  events: LearningEvent[]
  /** Decisions made in this session (persisted by the app). */
  decisions: AdaptiveDecision[]
  /** Latest validated adviser output, if any. The policy uses it only while fresh and for its level. */
  advice: ValidatedAdvice | null
}

/** What a step needs from the outside world, injected so steps stay pure. */
export interface StepEnv {
  random: RandomSource
  now: number
  newId: () => string
}

export type GameAction =
  | { type: 'play' }
  | { type: 'home' }
  | { type: 'openLevel'; level: number }
  | { type: 'startPuzzle'; puzzleId: string; env: StepEnv }
  | { type: 'answer'; word: string; env: StepEnv }
  | { type: 'next'; env: StepEnv }
  | { type: 'backToPuzzles' }
  | { type: 'nextPuzzle'; env: StepEnv }
  | { type: 'nextLevel' }
  | { type: 'openGrownUps' }
  /** Clears stars, unlocks, events, decisions and advice (storage is cleared by the app). */
  | { type: 'resetProgress' }
  /** Stored events finished loading; merge them under anything recorded meanwhile. */
  | { type: 'eventsLoaded'; events: readonly LearningEvent[] }
  /** Validated advice arrived in the background. */
  | { type: 'adviceReceived'; advice: ValidatedAdvice }

export interface GameModel {
  content: ContentDataset
  policyConfig: PolicyConfig
  learnerConfig: LearnerModelConfig
  puzzlesByLevel: Map<number, Puzzle[]>
  itemsById: Map<string, Item>
  levelStatus(progress: SavedProgress, level: number): Status
  puzzleStatus(progress: SavedProgress, puzzle: Puzzle): Status
  findPuzzle(puzzleId: string): Puzzle | undefined
  levelStars(progress: SavedProgress, level: number): { earned: number; max: number }
}

export interface ModelOptions {
  policyConfig?: PolicyConfig
  learnerConfig?: LearnerModelConfig
}

export function createGameModel(content: ContentDataset, options: ModelOptions = {}): GameModel {
  const puzzlesByLevel = buildPuzzles(content)
  const itemsById = new Map(content.items.map((i) => [i.id, i]))
  const allPuzzles = [...puzzlesByLevel.values()].flat()
  const completed = (p: SavedProgress) => new Set(p.completedPuzzleIds)
  const levelStatus = (progress: SavedProgress, level: number): Status =>
    levelStatuses(puzzlesByLevel, completed(progress)).get(level) ?? 'locked'

  return {
    content,
    policyConfig: options.policyConfig ?? DEFAULT_POLICY_CONFIG,
    learnerConfig: options.learnerConfig ?? DEFAULT_LEARNER_MODEL_CONFIG,
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

export const initialGameState = (progress: SavedProgress, sessionId: string, events: LearningEvent[] = []): GameState => ({
  screen: { name: 'welcome' },
  progress,
  sessionId,
  events,
  decisions: [],
  advice: null,
})

/** Puzzle words still to ask, and how many of the puzzle's own words are done. */
export const roundProgress = (screen: Extract<Screen, { name: 'question' }>, puzzle: Puzzle | undefined) => {
  const total = puzzle?.itemIds.length ?? screen.round.queue.length
  return { done: total - screen.round.queue.length, total }
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
    ...state,
    progress,
    screen: { name: isLast ? 'levelComplete' : 'puzzleComplete', level: puzzle.level, puzzleId: puzzle.id, stars },
  }
}

/** Asks the policy for the next question, or completes the puzzle when it has none. */
function nextQuestion(model: GameModel, state: GameState, puzzle: Puzzle, round: RoundState, mistakes: number, env: StepEnv): GameState {
  const learner = buildLearnerModel(state.events, model.content, model.learnerConfig)
  const decision = decideNext({
    content: model.content,
    learner,
    round,
    config: model.policyConfig,
    now: env.now,
    random: env.random,
    newId: env.newId,
    advice: isAdviceUsable(state.advice, puzzle.level, env.now) ? state.advice : null,
  })
  if (!decision) return completePuzzle(model, state, puzzle, mistakes)
  const item = model.itemsById.get(decision.itemId)
  if (!item) return completePuzzle(model, state, puzzle, mistakes)
  const foils = item.foils.filter((f) => decision.foilWords.includes(f.word))
  return {
    ...state,
    decisions: [...state.decisions, decision],
    screen: {
      name: 'question',
      level: puzzle.level,
      puzzleId: puzzle.id,
      round,
      decision,
      question: startQuestion(buildQuestion(item, { random: env.random, foils }), env.now),
      mistakes,
      lastOutcome: null,
    },
  }
}

function startPuzzle(model: GameModel, state: GameState, puzzleId: string, env: StepEnv): GameState {
  const puzzle = model.findPuzzle(puzzleId)
  if (!puzzle || model.puzzleStatus(state.progress, puzzle) === 'locked') return state
  return nextQuestion(model, state, puzzle, startRound(puzzle.id, puzzle.level, puzzle.itemIds), 0, env)
}

function mergeEvents(stored: readonly LearningEvent[], session: readonly LearningEvent[]): LearningEvent[] {
  const ids = new Set(stored.map((e) => e.id))
  return [...stored, ...session.filter((e) => !ids.has(e.id))].sort((a, b) => a.at - b.at)
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
      return startPuzzle(model, state, action.puzzleId, action.env)

    case 'answer': {
      if (screen.name !== 'question') return state
      const result = answer(screen.question, action.word, action.env.now)
      if (result.outcome.kind === 'ignored') return state
      const { attempt } = result.outcome
      const item = model.itemsById.get(screen.decision.itemId)
      if (!item) return state
      const event = createLearningEvent(
        {
          sessionId: state.sessionId,
          questionId: screen.decision.id,
          at: action.env.now,
          contentVersion: model.content.contentVersion,
          itemId: item.id,
          skillId: item.skillId,
          level: item.level,
          puzzleId: screen.puzzleId,
          presentedFoilCodes: screen.decision.foilCodes,
          chosenWord: attempt.word,
          correct: attempt.correct,
          chosenFoilCode: attempt.foilCode,
          attemptNumber: attempt.attemptNumber,
          elapsedMs: attempt.elapsedMs,
          decisionId: screen.decision.id,
        },
        action.env.newId(),
      )
      const costsStar = !attempt.correct && screen.decision.countsForStars
      return {
        ...state,
        events: [...state.events, event],
        screen: {
          ...screen,
          question: result.state,
          mistakes: screen.mistakes + (costsStar ? 1 : 0),
          lastOutcome: result.outcome,
        },
      }
    }

    case 'next': {
      if (screen.name !== 'question' || screen.question.status !== 'correct') return state
      const puzzle = model.findPuzzle(screen.puzzleId)
      if (!puzzle) return state
      const firstTryCorrect = screen.question.attempts[0]?.correct ?? false
      const round = advanceRound(screen.round, screen.decision, firstTryCorrect)
      return nextQuestion(model, state, puzzle, round, screen.mistakes, action.env)
    }

    case 'backToPuzzles':
      if (screen.name === 'welcome' || screen.name === 'home' || screen.name === 'grownUps') return state
      return { ...state, screen: { name: 'puzzles', level: screen.level } }

    case 'nextPuzzle': {
      if (screen.name !== 'puzzleComplete') return state
      const current = model.findPuzzle(screen.puzzleId)
      const next = current && model.puzzlesByLevel.get(current.level)?.[current.number]
      return next ? startPuzzle(model, state, next.id, action.env) : state
    }

    case 'nextLevel': {
      if (screen.name !== 'levelComplete') return state
      return gameReducer(model, state, { type: 'openLevel', level: screen.level + 1 })
    }

    case 'openGrownUps':
      return screen.name === 'home' ? { ...state, screen: { name: 'grownUps' } } : state

    case 'resetProgress':
      if (screen.name !== 'grownUps') return state
      return { ...state, screen: { name: 'home' }, progress: emptyProgress(), events: [], decisions: [], advice: null }

    case 'eventsLoaded':
      return { ...state, events: mergeEvents(action.events, state.events) }

    case 'adviceReceived':
      return { ...state, advice: action.advice }
  }
}
