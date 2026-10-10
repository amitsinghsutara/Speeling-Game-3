/**
 * Per-question answer state: retry until correct. A wrong choice is disabled
 * and counted once. Taps after the correct answer, on disabled tiles, or on
 * words that are not choices are ignored, so rapid taps cannot double-count.
 */
import type { Question } from './question.ts'

export interface Attempt {
  word: string
  correct: boolean
  foilCode?: string
  /** 1-based attempt number within this question. */
  attemptNumber: number
  /** Milliseconds since the question was shown. */
  elapsedMs: number
}

export interface QuestionState {
  question: Question
  shownAt: number
  status: 'awaiting' | 'retry' | 'correct'
  disabledWords: readonly string[]
  attempts: readonly Attempt[]
}

export type AnswerOutcome =
  | { kind: 'correct'; attempt: Attempt }
  | { kind: 'incorrect'; attempt: Attempt }
  | { kind: 'ignored'; reason: 'already-correct' | 'already-tried' | 'not-a-choice' }

export const startQuestion = (question: Question, now: number): QuestionState => ({
  question,
  shownAt: now,
  status: 'awaiting',
  disabledWords: [],
  attempts: [],
})

export function answer(
  state: QuestionState,
  word: string,
  now: number,
): { state: QuestionState; outcome: AnswerOutcome } {
  if (state.status === 'correct') return { state, outcome: { kind: 'ignored', reason: 'already-correct' } }
  if (state.disabledWords.includes(word)) return { state, outcome: { kind: 'ignored', reason: 'already-tried' } }
  const choice = state.question.choices.find((c) => c.word === word)
  if (!choice) return { state, outcome: { kind: 'ignored', reason: 'not-a-choice' } }

  const attempt: Attempt = {
    word,
    correct: choice.isTarget,
    ...(choice.foilCode !== undefined && { foilCode: choice.foilCode }),
    attemptNumber: state.attempts.length + 1,
    elapsedMs: Math.max(0, now - state.shownAt),
  }
  const attempts = [...state.attempts, attempt]
  if (choice.isTarget) {
    return { state: { ...state, status: 'correct', attempts }, outcome: { kind: 'correct', attempt } }
  }
  return {
    state: { ...state, status: 'retry', attempts, disabledWords: [...state.disabledWords, word] },
    outcome: { kind: 'incorrect', attempt },
  }
}

export const mistakesIn = (state: QuestionState): number => state.attempts.filter((a) => !a.correct).length
