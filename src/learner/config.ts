/**
 * Learner-model settings, versioned so every derived result can say which
 * settings produced it.
 *
 * PROVISIONAL: these numbers are engineering placeholders, not confirmed by
 * the curriculum owner (spec FR-025). They are kept in one place, flagged, and
 * validated so they can be replaced without code changes.
 */
import { z } from 'zod'

export const learnerModelConfigSchema = z
  .object({
    version: z.string().min(1),
    /** True until a curriculum owner confirms every value below. */
    provisional: z.boolean(),
    errorPattern: z.object({
      /** Look only at the most recent N questions in which the foil type was on screen. */
      windowQuestions: z.number().int().positive(),
      /** Minimum times the child picked that foil type in the window. */
      minErrors: z.number().int(),
      /** The errors must come from at least this many different words. */
      minDistinctItems: z.number().int(),
      /** Errors as a share of the questions in the window that showed that foil type. */
      minErrorRate: z.number().min(0).max(1),
    }),
    /**
     * Count only the first choice in each question. Later choices come after
     * a wrong tile is disabled, so they say less about what the child knows.
     */
    firstChoiceOnly: z.boolean(),
    /** Fewer questions than this in a skill means "not enough evidence yet". */
    minQuestionsForEvidence: z.number().int().positive(),
  })
  // Constitution VIII: an error pattern must never come from a single mistake.
  .refine((c) => c.errorPattern.minErrors >= 2, {
    message: 'errorPattern.minErrors must be at least 2 (a single mistake is never a pattern)',
    path: ['errorPattern', 'minErrors'],
  })
  .refine((c) => c.errorPattern.minDistinctItems >= 2, {
    message: 'errorPattern.minDistinctItems must be at least 2 (one tricky word is not a pattern)',
    path: ['errorPattern', 'minDistinctItems'],
  })
  .refine((c) => c.errorPattern.minErrors <= c.errorPattern.windowQuestions, {
    message: 'errorPattern.minErrors cannot exceed windowQuestions',
    path: ['errorPattern', 'minErrors'],
  })

export type LearnerModelConfig = z.infer<typeof learnerModelConfigSchema>

export const DEFAULT_LEARNER_MODEL_CONFIG: LearnerModelConfig = learnerModelConfigSchema.parse({
  version: 'learner-model/1-provisional',
  provisional: true,
  errorPattern: {
    windowQuestions: 10,
    minErrors: 3,
    minDistinctItems: 2,
    minErrorRate: 0.3,
  },
  firstChoiceOnly: true,
  minQuestionsForEvidence: 8,
})
