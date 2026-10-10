/**
 * Curriculum validation of model output. Runs on the server and again in the
 * browser: anything not in the approved dataset, or not offered in the
 * request, is dropped and noted in `rejected`. Nothing is ever repaired or invented.
 */
import type { ContentDataset } from '../content/schema.ts'
import { ADVICE_SCHEMA_VERSION, LIMITS, rawAdviceSchema, type AdviceRequest, type ValidatedAdvice } from './schema.ts'

export interface ValidationContext {
  content: ContentDataset
  request: AdviceRequest
  adviceId: string
  receivedAt: number
}

export function validateAdvice(raw: unknown, { content, request, adviceId, receivedAt }: ValidationContext): ValidatedAdvice | null {
  const parsed = rawAdviceSchema.safeParse(raw)
  if (!parsed.success) return null
  const advice = parsed.data
  const rejected: string[] = []
  const items = new Map(content.items.map((i) => [i.id, i]))
  const offered = new Set(request.approvedItems.map((i) => i.itemId))
  const patterns = new Set(request.errorPatterns.map((p) => p.foilCode))
  const dueSkills = new Set(request.dueReviewSkillIds)

  let focusFoilCode = advice.focusFoilCode
  if (focusFoilCode !== null && !patterns.has(focusFoilCode)) {
    rejected.push(`focusFoilCode "${focusFoilCode}" is not a detected error pattern`)
    focusFoilCode = null
  }

  let reviewSkillId = advice.reviewSkillId
  if (reviewSkillId !== null && !dueSkills.has(reviewSkillId)) {
    rejected.push(`reviewSkillId "${reviewSkillId}" is not due for review`)
    reviewSkillId = null
  }

  const preferItemIds: string[] = []
  for (const id of advice.preferItemIds.slice(0, LIMITS.preferItemIds)) {
    const item = items.get(id)
    if (!item || !offered.has(id) || item.level > request.currentLevel) rejected.push(`item "${id}" is not an approved, offered word`)
    else if (!preferItemIds.includes(id)) preferItemIds.push(id)
  }

  const candidateFoils: ValidatedAdvice['candidateFoils'] = []
  for (const foil of advice.candidateFoils.slice(0, LIMITS.candidateFoils)) {
    const item = items.get(foil.itemId)
    const approved = item?.foils.some((f) => f.word === foil.word) ?? false
    if (!item || !offered.has(foil.itemId) || !approved) rejected.push(`foil "${foil.word}" is not an approved foil of "${foil.itemId}"`)
    else candidateFoils.push(foil)
  }

  return {
    schemaVersion: ADVICE_SCHEMA_VERSION,
    adviceId,
    receivedAt,
    level: request.currentLevel,
    focusFoilCode,
    reviewSkillId,
    preferItemIds,
    candidateFoils,
    rationale: advice.rationale.slice(0, LIMITS.rationaleChars),
    rejected,
  }
}
