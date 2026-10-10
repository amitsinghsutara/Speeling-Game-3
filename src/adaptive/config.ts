/**
 * Adaptive policy settings, versioned and stored with every decision.
 *
 * PROVISIONAL: engineering placeholders, not confirmed by the curriculum owner
 * (spec FR-025). The only source-backed rule is the shape of the tier gate:
 * the spreadsheet's ResearchBasis suggests Tier 1-2 foils while unsure and
 * Tier 3-4 after accuracy passes a threshold. The numbers are still ours.
 */
import { z } from 'zod'

export const policyConfigSchema = z
  .object({
    version: z.string().min(1),
    provisional: z.boolean(),
    /** Extra (non-curriculum-order) questions allowed per puzzle. */
    maxExtraQuestionsPerPuzzle: z.number().int().min(0),
    /** Fewest foils ever shown: a question always has at least this many wrong choices. */
    minFoils: z.number().int().min(1),
    focus: z.object({ maxPerPuzzle: z.number().int().min(0) }),
    scaffold: z.object({
      /** Look at this many most recent questions in the skill... */
      recentQuestions: z.number().int().positive(),
      /** ...and scaffold if at most this many were right on the first try. */
      maxFirstTryCorrect: z.number().int().min(0),
      /** How many foils a scaffolded question shows. */
      foilCount: z.number().int().min(1),
    }),
    tierGate: z.object({
      /** Foils at or above this codebook tier are "harder". */
      hardTierFrom: z.number().int().positive(),
      /** Questions needed in the skill before harder tiers can be introduced. */
      minQuestions: z.number().int().positive(),
      /** Recent first-try accuracy needed in the skill. */
      minAccuracy: z.number().min(0).max(1),
    }),
    transfer: z.object({
      maxPerPuzzle: z.number().int().min(0),
      /** Recent first-try accuracy needed before testing transfer to an unseen word. */
      minAccuracy: z.number().min(0).max(1),
    }),
    review: z.object({
      maxPerPuzzle: z.number().int().min(0),
      /** An earlier skill is due once it has not been practised for this long. */
      dueAfterMs: z.number().int().positive(),
    }),
    mixed: z.object({ maxPerPuzzle: z.number().int().min(0) }),
    consolidate: z.object({ maxPerPuzzle: z.number().int().min(0) }),
  })
  .refine((c) => c.scaffold.foilCount >= c.minFoils, {
    message: 'scaffold.foilCount must be at least minFoils',
    path: ['scaffold', 'foilCount'],
  })

export type PolicyConfig = z.infer<typeof policyConfigSchema>

const DAY_MS = 24 * 60 * 60 * 1000

export const DEFAULT_POLICY_CONFIG: PolicyConfig = policyConfigSchema.parse({
  version: 'adaptive-policy/1-provisional',
  provisional: true,
  maxExtraQuestionsPerPuzzle: 3,
  minFoils: 2,
  focus: { maxPerPuzzle: 2 },
  scaffold: { recentQuestions: 3, maxFirstTryCorrect: 1, foilCount: 2 },
  tierGate: { hardTierFrom: 3, minQuestions: 4, minAccuracy: 0.75 },
  transfer: { maxPerPuzzle: 1, minAccuracy: 0.8 },
  review: { maxPerPuzzle: 1, dueAfterMs: DAY_MS },
  mixed: { maxPerPuzzle: 1 },
  consolidate: { maxPerPuzzle: 1 },
})
