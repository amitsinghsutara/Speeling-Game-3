/**
 * A learning event is one attempt at one question: immutable, local, and
 * minimal. No names or free text; only what the learner model needs.
 */
import { z } from 'zod'

export const LEARNING_EVENT_SCHEMA_VERSION = 1

export const learningEventSchema = z.object({
  schemaVersion: z.literal(LEARNING_EVENT_SCHEMA_VERSION),
  id: z.string().min(1),
  /** Pseudonymous, device-local learner. One learner per device for now. */
  learnerId: z.string().min(1),
  sessionId: z.string().min(1),
  /** Groups the attempts made on one shown question. */
  questionId: z.string().min(1),
  /** Epoch milliseconds. */
  at: z.number().int().nonnegative(),
  contentVersion: z.string().min(1),
  itemId: z.string().min(1),
  skillId: z.string().min(1),
  level: z.number().int().positive(),
  puzzleId: z.string().min(1),
  /** Foil codes on screen for this question (scaffolding may show fewer than three). */
  presentedFoilCodes: z.array(z.string().min(1)),
  chosenWord: z.string().min(1),
  correct: z.boolean(),
  /** Codebook code of the chosen foil; null when the target was chosen. */
  chosenFoilCode: z.string().min(1).nullable(),
  /** 1 for the first try at this question. */
  attemptNumber: z.number().int().positive(),
  /** Milliseconds from the question appearing to this choice. */
  elapsedMs: z.number().int().nonnegative(),
  /** The adaptive decision that produced this question (Phase 6); null until then. */
  decisionId: z.string().min(1).nullable(),
})

export type LearningEvent = z.infer<typeof learningEventSchema>

export const LOCAL_LEARNER_ID = 'local-learner'

/** Random id; falls back for older WebViews without crypto.randomUUID. */
export function newId(): string {
  const c = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export interface AttemptFacts {
  sessionId: string
  questionId: string
  at: number
  contentVersion: string
  itemId: string
  skillId: string
  level: number
  puzzleId: string
  presentedFoilCodes: readonly string[]
  chosenWord: string
  correct: boolean
  chosenFoilCode?: string | undefined
  attemptNumber: number
  elapsedMs: number
  decisionId?: string | null | undefined
}

export function createLearningEvent(facts: AttemptFacts, id: string = newId()): LearningEvent {
  return learningEventSchema.parse({
    schemaVersion: LEARNING_EVENT_SCHEMA_VERSION,
    id,
    learnerId: LOCAL_LEARNER_ID,
    sessionId: facts.sessionId,
    questionId: facts.questionId,
    at: Math.round(facts.at),
    contentVersion: facts.contentVersion,
    itemId: facts.itemId,
    skillId: facts.skillId,
    level: facts.level,
    puzzleId: facts.puzzleId,
    presentedFoilCodes: [...facts.presentedFoilCodes],
    chosenWord: facts.chosenWord,
    correct: facts.correct,
    chosenFoilCode: facts.correct ? null : (facts.chosenFoilCode ?? null),
    attemptNumber: facts.attemptNumber,
    elapsedMs: Math.round(facts.elapsedMs),
    decisionId: facts.decisionId ?? null,
  })
}
