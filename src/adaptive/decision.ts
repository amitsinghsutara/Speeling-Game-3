/**
 * An adaptive decision: which word, which choices, and why. Stored locally,
 * referenced by the learning events it produces, and replayable from its inputs.
 */
import { z } from 'zod'
import { PRESENTATION_REASONS, REASON_CODES_VERSION, SKIP_REASONS, STRATEGY_REASONS } from './reasons.ts'

export const DECISION_SCHEMA_VERSION = 1

export const adaptiveDecisionSchema = z.object({
  schemaVersion: z.literal(DECISION_SCHEMA_VERSION),
  id: z.string().min(1),
  at: z.number().int().nonnegative(),
  policyVersion: z.string().min(1),
  learnerModelVersion: z.string().min(1),
  reasonCodesVersion: z.literal(REASON_CODES_VERSION),
  /** True while any setting behind this decision is unconfirmed. */
  provisional: z.boolean(),
  puzzleId: z.string().min(1),
  itemId: z.string().min(1),
  skillId: z.string().min(1),
  /** Foils presented, in the item's order (on-screen order is shuffled separately). */
  foilWords: z.array(z.string().min(1)).min(1),
  /** Their codes, same order. Words are needed too: 12 items have two foils with one code. */
  foilCodes: z.array(z.string().min(1)).min(1),
  strategy: z.enum(STRATEGY_REASONS),
  presentation: z.enum(PRESENTATION_REASONS),
  /** Whether this question counts toward the puzzle's stars (only its own new words do). */
  countsForStars: z.boolean(),
  evidence: z.object({
    errorPattern: z
      .object({ foilCode: z.string(), errorRate: z.number(), evidenceEventIds: z.array(z.string()) })
      .optional(),
    skillRecentAccuracy: z.number().nullable().optional(),
    skillQuestions: z.number().int().optional(),
    reviewSkillLastSeenAt: z.number().optional(),
    heldFoilCodes: z.array(z.string()).optional(),
  }),
  /** Strategies looked at before this one, and why each was not used. */
  considered: z.array(z.object({ strategy: z.enum(STRATEGY_REASONS), skipped: z.enum(SKIP_REASONS) })),
})

export type AdaptiveDecision = z.infer<typeof adaptiveDecisionSchema>
