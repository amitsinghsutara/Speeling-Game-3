/**
 * The adaptive policy: a pure, deterministic choice of the next question.
 *
 * Same content, learner model, round, config, clock and random source always
 * give the same decision. Strategies are tried in a fixed priority order; each
 * one that is skipped is recorded with why, so every decision explains itself.
 */
import type { ContentDataset, Item } from '../content/schema.ts'
import type { RandomSource } from '../game/random.ts'
import type { ValidatedAdvice } from '../adviser/schema.ts'
import type { LearnerModel } from '../learner/model.ts'
import type { PolicyConfig } from './config.ts'
import { DECISION_SCHEMA_VERSION, type AdaptiveDecision } from './decision.ts'
import { choosePresentation, tierLookup } from './presentation.ts'
import { REASON_CODES_VERSION, type SkipReason, type StrategyReason } from './reasons.ts'

/** One puzzle in progress. */
export interface RoundState {
  puzzleId: string
  level: number
  /** The puzzle's own new words not yet asked, in curriculum order. */
  queue: readonly string[]
  /** Words asked so far in this round. */
  asked: readonly { itemId: string; strategy: StrategyReason; firstTryCorrect: boolean }[]
  extrasUsed: number
  used: Readonly<Partial<Record<StrategyReason, number>>>
}

export const startRound = (puzzleId: string, level: number, itemIds: readonly string[]): RoundState => ({
  puzzleId,
  level,
  queue: [...itemIds],
  asked: [],
  extrasUsed: 0,
  used: {},
})

export interface PolicyInput {
  content: ContentDataset
  learner: LearnerModel
  round: RoundState
  config: PolicyConfig
  now: number
  random: RandomSource
  newId: () => string
  /** Validated, fresh adviser output for this level, if any. It can only choose among eligible options. */
  advice?: ValidatedAdvice | null
}

type Considered = AdaptiveDecision['considered']
type Pick = { item: Item; keepCode?: string; evidence?: AdaptiveDecision['evidence'] }

/**
 * Narrows candidates to those the adviser prefers, if any overlap; otherwise leaves them.
 * Advice can never add a candidate the policy did not already consider eligible.
 */
function preferAdvised<T extends { id: string }>(candidates: readonly T[], advised: readonly string[]): { list: readonly T[]; used: boolean } {
  const preferred = candidates.filter((c) => advised.includes(c.id))
  return preferred.length > 0 && preferred.length < candidates.length ? { list: preferred, used: true } : { list: candidates, used: false }
}

/** Deterministic pick: best by `rank` (lower first), seeded random among exact ties. */
function pickBest<T>(candidates: readonly T[], rank: (c: T) => number[], random: RandomSource): T | undefined {
  if (candidates.length === 0) return undefined
  const ranked = candidates.map((c) => ({ c, r: rank(c) }))
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  }
  ranked.sort((a, b) => compare(a.r, b.r))
  const best = ranked.filter((x) => compare(x.r, ranked[0]?.r ?? []) === 0)
  return best[Math.floor(random() * best.length)]?.c ?? ranked[0]?.c
}

export function decideNext(input: PolicyInput): AdaptiveDecision | null {
  const { content, learner, round, config, random } = input
  const advice = input.advice ?? null
  const advised = advice?.preferItemIds ?? []
  let adviceUsed = false
  const tierOf = tierLookup(content)
  const itemsById = new Map(content.items.map((i) => [i.id, i]))
  const skillId = `level-${round.level}`
  const lastItemId = round.asked.at(-1)?.itemId
  const considered: Considered = []
  const seen = (id: string) => learner.byItem.has(id)
  const usedCount = (s: StrategyReason) => round.used[s] ?? 0
  const budgetLeft = round.extrasUsed < config.maxExtraQuestionsPerPuzzle
  const notQueued = (i: Item) => !round.queue.includes(i.id)
  const notLast = (i: Item) => i.id !== lastItemId
  const recency = (i: Item) => learner.byItem.get(i.id)?.lastSeenAt ?? 0

  /** Tries an extra (non-sequence) strategy, honouring the shared budget and its own limit. */
  const skip = (strategy: StrategyReason, skipped: SkipReason): null => {
    considered.push({ strategy, skipped })
    return null
  }
  const tryExtra = (strategy: StrategyReason, limit: number, find: () => Pick | SkipReason): Pick | null => {
    if (!budgetLeft) return skip(strategy, 'EXTRA_BUDGET_USED')
    if (usedCount(strategy) >= limit) return skip(strategy, 'STRATEGY_LIMIT_REACHED')
    const result = find()
    return typeof result === 'string' ? skip(strategy, result) : result
  }

  const decide = (strategy: StrategyReason, pick: Pick, countsForStars: boolean): AdaptiveDecision => {
    const preferFoils = (advice?.candidateFoils ?? []).filter((f) => f.itemId === pick.item.id).map((f) => f.word)
    const presentation = choosePresentation(pick.item, learner, tierOf, config, pick.keepCode, preferFoils)
    if (presentation.usedPreferredFoils) adviceUsed = true
    const stats = learner.bySkill.get(pick.item.skillId)
    return {
      schemaVersion: DECISION_SCHEMA_VERSION,
      id: input.newId(),
      at: Math.round(input.now),
      policyVersion: config.version,
      learnerModelVersion: learner.configVersion,
      reasonCodesVersion: REASON_CODES_VERSION,
      provisional: config.provisional || learner.provisional,
      puzzleId: round.puzzleId,
      itemId: pick.item.id,
      skillId: pick.item.skillId,
      foilWords: presentation.foils.map((f) => f.word),
      foilCodes: presentation.foils.map((f) => f.code),
      strategy,
      presentation: presentation.reason,
      countsForStars,
      evidence: {
        ...pick.evidence,
        skillRecentAccuracy: stats?.recentFirstTryAccuracy ?? null,
        skillQuestions: stats?.questions ?? 0,
        ...(presentation.heldFoilCodes.length > 0 && { heldFoilCodes: presentation.heldFoilCodes }),
      },
      adviser: advice
        ? {
            status: adviceUsed ? 'ADVISER_ACCEPTED' : 'ADVISER_NOT_APPLICABLE',
            adviceId: advice.adviceId,
            ...(advice.rejected.length > 0 && { rejected: advice.rejected }),
          }
        : { status: 'ADVISER_UNAVAILABLE' },
      considered,
    }
  }

  // 1. Focused practice on a repeated error pattern, from words up to this level.
  const focus = tryExtra('FOCUS_ERROR_PATTERN', config.focus.maxPerPuzzle, () => {
    const ranked = [...learner.errorPatterns].sort((a, b) => b.errorRate - a.errorRate || a.foilCode.localeCompare(b.foilCode))
    // The adviser may choose which detected pattern to practise first; it cannot create one.
    const advisedPattern = ranked.find((p) => p.foilCode === advice?.focusFoilCode)
    if (advisedPattern && advisedPattern !== ranked[0]) adviceUsed = true
    const pattern = advisedPattern ?? ranked[0]
    if (!pattern) return 'NO_ERROR_PATTERN'
    const candidates = content.items.filter(
      (i) => i.level <= round.level && notLast(i) && notQueued(i) && i.foils.some((f) => f.code === pattern.foilCode),
    )
    // Familiar words first (practise the pattern, not new vocabulary), then least recently seen.
    const narrowed = preferAdvised(candidates, advised)
    if (narrowed.used) adviceUsed = true
    const item = pickBest(narrowed.list, (i) => [seen(i.id) ? 0 : 1, recency(i)], random)
    if (!item) return 'NO_CANDIDATE_WORD'
    return {
      item,
      keepCode: pattern.foilCode,
      evidence: {
        errorPattern: { foilCode: pattern.foilCode, errorRate: pattern.errorRate, evidenceEventIds: pattern.evidenceEventIds },
      },
    }
  })
  if (focus) return decide('FOCUS_ERROR_PATTERN', focus, false)

  // 2. Spaced review of an earlier skill that has not been practised for a while.
  const review = tryExtra('SPACED_REVIEW', config.review.maxPerPuzzle, () => {
    const due = [...learner.bySkill.values()].filter(
      (s) => s.level < round.level && s.lastSeenAt !== null && input.now - s.lastSeenAt >= config.review.dueAfterMs,
    )
    const defaultSkill = pickBest(due, (s) => [s.lastSeenAt ?? 0], random)
    const advisedSkill = due.find((s) => s.skillId === advice?.reviewSkillId)
    if (advisedSkill && advisedSkill !== defaultSkill) adviceUsed = true
    const skill = advisedSkill ?? defaultSkill
    if (!skill) return 'NOT_DUE'
    const eligible = content.items.filter((i) => i.skillId === skill.skillId && seen(i.id) && notLast(i))
    const narrowed = preferAdvised(eligible, advised)
    if (narrowed.used) adviceUsed = true
    const candidates = narrowed.list
    // Weakest first, then the one seen longest ago.
    const item = pickBest(
      candidates,
      (i) => {
        const s = learner.byItem.get(i.id)
        return [s?.lastFirstTryCorrect ? 1 : 0, s?.lastSeenAt ?? 0]
      },
      random,
    )
    if (!item) return 'NO_CANDIDATE_WORD'
    return { item, evidence: { reviewSkillLastSeenAt: skill.lastSeenAt ?? 0 } }
  })
  if (review) return decide('SPACED_REVIEW', review, false)

  // 3. Transfer: the skill looks secure, so try an approved word of the same skill never seen before.
  const transfer = tryExtra('TRANSFER_CHECK', config.transfer.maxPerPuzzle, () => {
    const stats = learner.bySkill.get(skillId)
    const ready =
      stats?.evidence === 'enough' && stats.recentFirstTryAccuracy !== null && stats.recentFirstTryAccuracy >= config.transfer.minAccuracy
    if (!ready) return 'NOT_READY'
    const unseen = content.items
      .filter((i) => i.skillId === skillId && !seen(i.id) && notQueued(i) && notLast(i))
      .sort((a, b) => a.sequenceInLevel - b.sequenceInLevel)
    const item = unseen[0]
    return item ? { item } : 'TRANSFER_UNAVAILABLE'
  })
  if (transfer) return decide('TRANSFER_CHECK', transfer, false)

  // 4. The next new word in curriculum order.
  const nextId = round.queue[0]
  const next = nextId === undefined ? undefined : itemsById.get(nextId)
  if (next) return decide('CONTINUE_SEQUENCE', { item: next }, true)
  skip('CONTINUE_SEQUENCE', 'NO_CANDIDATE_WORD')

  // 5. Consolidate a word from this puzzle that was not right first time.
  const consolidate = tryExtra('CONSOLIDATE', config.consolidate.maxPerPuzzle, () => {
    const missed = round.asked.filter((a) => a.strategy === 'CONTINUE_SEQUENCE' && !a.firstTryCorrect).map((a) => a.itemId)
    const candidates = missed.flatMap((id) => {
      const item = itemsById.get(id)
      return item && notLast(item) ? [item] : []
    })
    const item = candidates[0]
    return item ? { item } : 'NOTHING_TO_CONSOLIDATE'
  })
  if (consolidate) return decide('CONSOLIDATE', consolidate, false)

  // 6. Mixed practice: one familiar word from an earlier skill.
  const mixed = tryExtra('MIXED_PRACTICE', config.mixed.maxPerPuzzle, () => {
    const earlier = content.items.filter((i) => i.level < round.level && seen(i.id) && notLast(i))
    if (earlier.length === 0) return 'NO_EARLIER_SKILL'
    const narrowed = preferAdvised(earlier, advised)
    if (narrowed.used) adviceUsed = true
    const item = pickBest(narrowed.list, (i) => [recency(i)], random)
    return item ? { item } : 'NO_CANDIDATE_WORD'
  })
  if (mixed) return decide('MIXED_PRACTICE', mixed, false)

  return null
}

/** The round after a decision's question has been answered. */
export function advanceRound(round: RoundState, decision: AdaptiveDecision, firstTryCorrect: boolean): RoundState {
  const isSequence = decision.strategy === 'CONTINUE_SEQUENCE'
  return {
    ...round,
    queue: isSequence ? round.queue.filter((id) => id !== decision.itemId) : round.queue,
    asked: [...round.asked, { itemId: decision.itemId, strategy: decision.strategy, firstTryCorrect }],
    extrasUsed: round.extrasUsed + (isSequence ? 0 : 1),
    used: { ...round.used, [decision.strategy]: (round.used[decision.strategy] ?? 0) + 1 },
  }
}
