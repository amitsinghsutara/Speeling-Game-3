import { createLearningEvent, type LearningEvent } from '../../learner/events.ts'

let clock = 1_000_000
let counter = 0

export interface AnswerSpec {
  itemId: string
  /** Codes shown on screen; defaults to a typical CVC set. */
  shown?: string[]
  /** Foil code picked on each attempt, in order; 'target' for the right answer. */
  picks: (string | 'target')[]
  skillId?: string
  level?: number
}

/** Builds the events for one question, attempts in order, ending however `picks` ends. */
export function answerEvents({ itemId, shown = ['V', 'FC', 'IC'], picks, skillId = 'level-1', level = 1 }: AnswerSpec): LearningEvent[] {
  // Zero-padded so string order matches creation order (equal timestamps sort by id).
  const questionId = `q-${String(++counter).padStart(5, '0')}`
  const shownAt = (clock += 10_000)
  return picks.map((pick, i) =>
    createLearningEvent(
      {
        sessionId: 's-1',
        questionId,
        at: shownAt + (i + 1) * 1000,
        contentVersion: 'test',
        itemId,
        skillId,
        level,
        puzzleId: `level-${level}/puzzle-1`,
        presentedFoilCodes: shown,
        chosenWord: pick === 'target' ? 'target' : `foil-${pick}`,
        correct: pick === 'target',
        chosenFoilCode: pick === 'target' ? undefined : pick,
        attemptNumber: i + 1,
        elapsedMs: (i + 1) * 1000,
      },
      `${questionId}-a${i + 1}`,
    ),
  )
}

/** Many questions answered right first time. */
export const correctAnswers = (itemIds: string[], shown?: string[]): LearningEvent[] =>
  itemIds.flatMap((itemId) => answerEvents({ itemId, picks: ['target'], ...(shown && { shown }) }))
