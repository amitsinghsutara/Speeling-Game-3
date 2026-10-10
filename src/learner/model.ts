/**
 * The learner model: statistics derived purely from learning events.
 * Same events + content + config always give the same model, so adaptive
 * decisions made from it can be explained and replayed.
 */
import type { ContentDataset } from '../content/schema.ts'
import type { LearnerModelConfig } from './config.ts'
import type { LearningEvent } from './events.ts'

/** All attempts at one shown question. */
export interface QuestionRecord {
  questionId: string
  itemId: string
  skillId: string
  level: number
  /** Time of the first attempt. */
  at: number
  presentedFoilCodes: readonly string[]
  attempts: readonly LearningEvent[]
  firstTryCorrect: boolean
  solved: boolean
}

export type Evidence = 'none' | 'insufficient' | 'enough'

export interface SkillStats {
  skillId: string
  level: number
  questions: number
  firstTryCorrect: number
  /** Null until at least one question; read together with `evidence`. */
  firstTryAccuracy: number | null
  /** Accuracy over the most recent `errorPattern.windowQuestions` questions. */
  recentFirstTryAccuracy: number | null
  distinctItems: number
  lastSeenAt: number | null
  evidence: Evidence
}

export interface FoilTypeStats {
  code: string
  tier: number | null
  /** Questions in which this foil type was on screen. */
  presentedIn: number
  /** Times the child picked a foil of this type (per `firstChoiceOnly`). */
  chosen: number
  errorRate: number | null
}

export interface ItemStats {
  itemId: string
  timesSeen: number
  firstTryCorrect: number
  lastSeenAt: number
  lastFirstTryCorrect: boolean
}

export interface ErrorPattern {
  foilCode: string
  errors: number
  questionsInWindow: number
  distinctItems: number
  errorRate: number
  /** The events that make up the evidence, so a decision can cite them. */
  evidenceEventIds: string[]
}

export interface LearnerModel {
  configVersion: string
  provisional: boolean
  questions: QuestionRecord[]
  bySkill: Map<string, SkillStats>
  byFoilType: Map<string, FoilTypeStats>
  byItem: Map<string, ItemStats>
  errorPatterns: ErrorPattern[]
  /** Events left out because their item is no longer in the content. */
  ignoredEvents: number
}

const ratio = (part: number, whole: number): number | null => (whole === 0 ? null : part / whole)

export function groupQuestions(events: readonly LearningEvent[]): QuestionRecord[] {
  const byQuestion = new Map<string, LearningEvent[]>()
  for (const event of events) {
    const list = byQuestion.get(event.questionId)
    if (list) list.push(event)
    else byQuestion.set(event.questionId, [event])
  }
  const records: QuestionRecord[] = []
  for (const [questionId, list] of byQuestion) {
    const attempts = [...list].sort((a, b) => a.attemptNumber - b.attemptNumber || a.at - b.at)
    const first = attempts[0]
    if (!first) continue
    records.push({
      questionId,
      itemId: first.itemId,
      skillId: first.skillId,
      level: first.level,
      at: first.at,
      presentedFoilCodes: first.presentedFoilCodes,
      attempts,
      firstTryCorrect: first.attemptNumber === 1 && first.correct,
      solved: attempts.some((a) => a.correct),
    })
  }
  return records.sort((a, b) => a.at - b.at || a.questionId.localeCompare(b.questionId))
}

/** Wrong choices in a question that count as evidence, per config. */
const countedErrors = (q: QuestionRecord, config: LearnerModelConfig): LearningEvent[] =>
  q.attempts.filter((a) => !a.correct && (!config.firstChoiceOnly || a.attemptNumber === 1))

function skillStats(questions: readonly QuestionRecord[], config: LearnerModelConfig): Map<string, SkillStats> {
  const bySkill = new Map<string, QuestionRecord[]>()
  for (const q of questions) {
    const list = bySkill.get(q.skillId)
    if (list) list.push(q)
    else bySkill.set(q.skillId, [q])
  }
  const result = new Map<string, SkillStats>()
  for (const [skillId, list] of bySkill) {
    const firstTryCorrect = list.filter((q) => q.firstTryCorrect).length
    const recent = list.slice(-config.errorPattern.windowQuestions)
    result.set(skillId, {
      skillId,
      level: list[0]?.level ?? 0,
      questions: list.length,
      firstTryCorrect,
      firstTryAccuracy: ratio(firstTryCorrect, list.length),
      recentFirstTryAccuracy: ratio(recent.filter((q) => q.firstTryCorrect).length, recent.length),
      distinctItems: new Set(list.map((q) => q.itemId)).size,
      lastSeenAt: list.at(-1)?.at ?? null,
      evidence: list.length === 0 ? 'none' : list.length < config.minQuestionsForEvidence ? 'insufficient' : 'enough',
    })
  }
  return result
}

function foilTypeStats(
  questions: readonly QuestionRecord[],
  content: ContentDataset,
  config: LearnerModelConfig,
): Map<string, FoilTypeStats> {
  const result = new Map<string, FoilTypeStats>()
  for (const entry of content.foilCodebook) {
    result.set(entry.code, { code: entry.code, tier: entry.tier, presentedIn: 0, chosen: 0, errorRate: null })
  }
  for (const q of questions) {
    for (const code of new Set(q.presentedFoilCodes)) {
      const stats = result.get(code) ?? { code, tier: null, presentedIn: 0, chosen: 0, errorRate: null }
      stats.presentedIn++
      result.set(code, stats)
    }
    for (const error of countedErrors(q, config)) {
      const code = error.chosenFoilCode
      const stats = code === null ? undefined : result.get(code)
      if (stats) stats.chosen++
    }
  }
  for (const stats of result.values()) stats.errorRate = ratio(stats.chosen, stats.presentedIn)
  return result
}

function itemStats(questions: readonly QuestionRecord[]): Map<string, ItemStats> {
  const result = new Map<string, ItemStats>()
  for (const q of questions) {
    const previous = result.get(q.itemId)
    result.set(q.itemId, {
      itemId: q.itemId,
      timesSeen: (previous?.timesSeen ?? 0) + 1,
      firstTryCorrect: (previous?.firstTryCorrect ?? 0) + (q.firstTryCorrect ? 1 : 0),
      lastSeenAt: q.at,
      lastFirstTryCorrect: q.firstTryCorrect,
    })
  }
  return result
}

/**
 * A foil type is an error pattern only with repeated evidence: in the most recent
 * questions that showed it, the child picked it at least `minErrors` times, across
 * at least `minDistinctItems` different words, at or above `minErrorRate`.
 */
export function detectErrorPatterns(questions: readonly QuestionRecord[], config: LearnerModelConfig): ErrorPattern[] {
  const { windowQuestions, minErrors, minDistinctItems, minErrorRate } = config.errorPattern
  const codes = new Set(questions.flatMap((q) => q.presentedFoilCodes))
  const patterns: ErrorPattern[] = []
  for (const code of [...codes].sort()) {
    const window = questions.filter((q) => q.presentedFoilCodes.includes(code)).slice(-windowQuestions)
    const errorEvents = window.flatMap((q) => countedErrors(q, config).filter((e) => e.chosenFoilCode === code))
    const errorQuestions = new Set(errorEvents.map((e) => e.questionId)).size
    const distinctItems = new Set(errorEvents.map((e) => e.itemId)).size
    const errorRate = window.length === 0 ? 0 : errorQuestions / window.length
    if (errorEvents.length >= minErrors && distinctItems >= minDistinctItems && errorRate >= minErrorRate) {
      patterns.push({
        foilCode: code,
        errors: errorEvents.length,
        questionsInWindow: window.length,
        distinctItems,
        errorRate,
        evidenceEventIds: errorEvents.map((e) => e.id),
      })
    }
  }
  return patterns
}

export function buildLearnerModel(
  events: readonly LearningEvent[],
  content: ContentDataset,
  config: LearnerModelConfig,
): LearnerModel {
  const knownItems = new Set(content.items.map((i) => i.id))
  const usable = events.filter((e) => knownItems.has(e.itemId))
  const questions = groupQuestions(usable)
  return {
    configVersion: config.version,
    provisional: config.provisional,
    questions,
    bySkill: skillStats(questions, config),
    byFoilType: foilTypeStats(questions, content, config),
    byItem: itemStats(questions),
    errorPatterns: detectErrorPatterns(questions, config),
    ignoredEvents: events.length - usable.length,
  }
}
