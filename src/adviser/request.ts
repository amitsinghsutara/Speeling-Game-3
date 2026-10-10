/**
 * Builds the adviser request from the learner model: aggregates and approved
 * curriculum only. Kept separate so a test can pin exactly what leaves the device.
 */
import type { PolicyConfig } from '../adaptive/config.ts'
import type { ContentDataset } from '../content/schema.ts'
import type { LearnerModel } from '../learner/model.ts'
import { ADVICE_SCHEMA_VERSION, adviceRequestSchema, type AdviceRequest } from './schema.ts'

const round2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100)

export function buildAdviceRequest(
  learner: LearnerModel,
  content: ContentDataset,
  currentLevel: number,
  config: PolicyConfig,
  now: number,
): AdviceRequest {
  const skills = [...learner.bySkill.values()]
  return adviceRequestSchema.parse({
    schemaVersion: ADVICE_SCHEMA_VERSION,
    currentLevel,
    skills: skills.map((s) => ({
      skillId: s.skillId,
      level: s.level,
      questions: s.questions,
      firstTryAccuracy: round2(s.firstTryAccuracy),
      recentFirstTryAccuracy: round2(s.recentFirstTryAccuracy),
    })),
    foilTypes: [...learner.byFoilType.values()]
      .filter((f) => f.presentedIn > 0)
      .map((f) => ({ code: f.code, tier: f.tier, presentedIn: f.presentedIn, chosen: f.chosen })),
    errorPatterns: learner.errorPatterns.map((p) => ({ foilCode: p.foilCode, errorRate: round2(p.errorRate) ?? 0 })),
    dueReviewSkillIds: skills
      .filter((s) => s.level < currentLevel && s.lastSeenAt !== null && now - s.lastSeenAt >= config.review.dueAfterMs)
      .map((s) => s.skillId),
    approvedItems: content.items
      .filter((i) => i.level <= currentLevel)
      .map((i) => ({ itemId: i.id, level: i.level, target: i.target, foils: i.foils, seen: learner.byItem.has(i.id) })),
  })
}
