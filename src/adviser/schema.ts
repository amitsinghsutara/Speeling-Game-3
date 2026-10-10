/**
 * Wire formats for the optional AI adviser, shared by the browser and the
 * server function. Both sides validate with these at runtime.
 *
 * Privacy (constitution VI): the request carries aggregates only: no learner
 * id, no event ids, no timestamps, no free text. Words are curriculum words.
 */
import { z } from 'zod'

export const ADVICE_SCHEMA_VERSION = 1

/** Hard caps so neither side can be flooded. */
export const LIMITS = {
  requestBytes: 32_000,
  preferItemIds: 6,
  candidateFoils: 6,
  rationaleChars: 300,
} as const

const rate = z.number().min(0).max(1)

export const adviceRequestSchema = z
  .object({
    schemaVersion: z.literal(ADVICE_SCHEMA_VERSION),
    currentLevel: z.number().int().positive(),
    skills: z
      .array(
        z.object({
          skillId: z.string(),
          level: z.number().int().positive(),
          questions: z.number().int().nonnegative(),
          firstTryAccuracy: rate.nullable(),
          recentFirstTryAccuracy: rate.nullable(),
        }),
      )
      .max(20),
    foilTypes: z
      .array(z.object({ code: z.string(), tier: z.number().int().nullable(), presentedIn: z.number().int(), chosen: z.number().int() }))
      .max(40),
    errorPatterns: z.array(z.object({ foilCode: z.string(), errorRate: rate })).max(20),
    /** Skills the policy considers due for review (the adviser may pick one). */
    dueReviewSkillIds: z.array(z.string()).max(20),
    /** Approved words the adviser may choose from: levels up to the current one. */
    approvedItems: z
      .array(
        z.object({
          itemId: z.string(),
          level: z.number().int().positive(),
          target: z.string(),
          foils: z.array(z.object({ word: z.string(), code: z.string() })).max(3),
          seen: z.boolean(),
        }),
      )
      .max(200),
  })
  .strict()

export type AdviceRequest = z.infer<typeof adviceRequestSchema>

/** What the model must return (also sent to Gemini as the response schema). */
export const rawAdviceSchema = z.object({
  focusFoilCode: z.string().nullable(),
  reviewSkillId: z.string().nullable(),
  preferItemIds: z.array(z.string()).max(LIMITS.preferItemIds),
  candidateFoils: z.array(z.object({ itemId: z.string(), word: z.string() })).max(LIMITS.candidateFoils),
  rationale: z.string().max(LIMITS.rationaleChars),
})

export type RawAdvice = z.infer<typeof rawAdviceSchema>

/** Advice after curriculum validation; only this ever reaches the policy. */
export const validatedAdviceSchema = z.object({
  schemaVersion: z.literal(ADVICE_SCHEMA_VERSION),
  adviceId: z.string().min(1),
  receivedAt: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  focusFoilCode: z.string().nullable(),
  reviewSkillId: z.string().nullable(),
  preferItemIds: z.array(z.string()),
  candidateFoils: z.array(z.object({ itemId: z.string(), word: z.string() })),
  /** Developer-facing only; never shown to a child. */
  rationale: z.string(),
  /** Suggestions removed during validation, and why. */
  rejected: z.array(z.string()),
})

export type ValidatedAdvice = z.infer<typeof validatedAdviceSchema>

export const adviceResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), advice: rawAdviceSchema, model: z.string().optional() }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
])

export type AdviceResponse = z.infer<typeof adviceResponseSchema>
