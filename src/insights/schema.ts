/**
 * Wire formats for the grown-ups' AI suggestions. The request reuses the
 * adviser's aggregate-only data, plus the device's own level labels so the AI
 * cannot contradict them. Both sides validate at runtime.
 */
import { z } from 'zod'
import { adviceRequestSchema } from '../adviser/schema.ts'

export const INSIGHTS_SCHEMA_VERSION = 1

export const INSIGHT_LIMITS = {
  summaryChars: 420,
  strengths: 2,
  strengthChars: 140,
  focusAreas: 3,
  tipChars: 180,
  activities: 3,
  titleChars: 60,
  descriptionChars: 220,
  wordsPerActivity: 6,
} as const

const LEVEL_STATUSES = ['not-started', 'just-started', 'practising', 'doing-well'] as const

export const insightsRequestSchema = z
  .object({
    schemaVersion: z.literal(INSIGHTS_SCHEMA_VERSION),
    stats: adviceRequestSchema,
    /** The device's own labels (from the rules-based report); the AI must not contradict these. */
    levelStatuses: z.array(z.object({ level: z.number().int().positive(), status: z.enum(LEVEL_STATUSES) })).max(20),
  })
  .strict()

export type InsightsRequest = z.infer<typeof insightsRequestSchema>

/** What the model returns (mirrors the Gemini response schema in server.ts). */
export const rawInsightsSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.object({ level: z.number().int(), note: z.string() })),
  focusAreas: z.array(z.object({ foilCode: z.string(), tip: z.string() })),
  homeActivities: z.array(z.object({ title: z.string(), description: z.string(), words: z.array(z.string()) })),
})

export type RawInsights = z.infer<typeof rawInsightsSchema>

/** After safety and curriculum checks: the only shape the screen ever shows. */
export const insightsSchema = z.object({
  summary: z.string().max(INSIGHT_LIMITS.summaryChars),
  strengths: z.array(z.object({ level: z.number().int(), note: z.string().max(INSIGHT_LIMITS.strengthChars) })).max(INSIGHT_LIMITS.strengths),
  focusAreas: z.array(z.object({ foilCode: z.string(), tip: z.string().max(INSIGHT_LIMITS.tipChars) })).max(INSIGHT_LIMITS.focusAreas),
  homeActivities: z
    .array(
      z.object({
        title: z.string().max(INSIGHT_LIMITS.titleChars),
        description: z.string().max(INSIGHT_LIMITS.descriptionChars),
        words: z.array(z.string()).max(INSIGHT_LIMITS.wordsPerActivity),
      }),
    )
    .max(INSIGHT_LIMITS.activities),
  /** What the checks removed, for the developer console. */
  removed: z.array(z.string()),
})

export type Insights = z.infer<typeof insightsSchema>

export const insightsResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), insights: insightsSchema, model: z.string().optional() }),
  z.object({ status: z.literal('unavailable'), reason: z.string() }),
])

export type InsightsResponse = z.infer<typeof insightsResponseSchema>
