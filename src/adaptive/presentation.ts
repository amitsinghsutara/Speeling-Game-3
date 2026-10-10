/**
 * Chooses which of an item's own approved foils to show. Never adds a foil
 * from anywhere else, never changes the target, never shows fewer than minFoils.
 */
import type { ContentDataset, Foil, Item } from '../content/schema.ts'
import type { LearnerModel } from '../learner/model.ts'
import type { PolicyConfig } from './config.ts'
import type { PresentationReason } from './reasons.ts'

export interface Presentation {
  foils: Foil[]
  reason: PresentationReason
  heldFoilCodes: string[]
}

export const tierLookup = (content: ContentDataset) => {
  const tiers = new Map(content.foilCodebook.map((e) => [e.code, e.tier]))
  return (code: string): number => tiers.get(code) ?? Number.POSITIVE_INFINITY
}

/** Easiest first by codebook tier; spreadsheet order breaks ties. */
const byTier = (foils: readonly Foil[], tierOf: (code: string) => number): Foil[] =>
  foils
    .map((foil, index) => ({ foil, index }))
    .sort((a, b) => tierOf(a.foil.code) - tierOf(b.foil.code) || a.index - b.index)
    .map(({ foil }) => foil)

/** Back in the item's own order, so presentation never depends on how we sorted. */
const inItemOrder = (item: Item, chosen: readonly Foil[]): Foil[] => item.foils.filter((f) => chosen.includes(f))

export function skillQuestions(learner: LearnerModel, skillId: string) {
  return learner.questions.filter((q) => q.skillId === skillId)
}

export function isStruggling(learner: LearnerModel, skillId: string, config: PolicyConfig): boolean {
  const recent = skillQuestions(learner, skillId).slice(-config.scaffold.recentQuestions)
  return (
    recent.length === config.scaffold.recentQuestions &&
    recent.filter((q) => q.firstTryCorrect).length <= config.scaffold.maxFirstTryCorrect
  )
}

export function isReadyForHarderFoils(learner: LearnerModel, skillId: string, config: PolicyConfig): boolean {
  const questions = skillQuestions(learner, skillId)
  const accuracy = learner.bySkill.get(skillId)?.recentFirstTryAccuracy ?? null
  return questions.length >= config.tierGate.minQuestions && accuracy !== null && accuracy >= config.tierGate.minAccuracy
}

export function choosePresentation(
  item: Item,
  learner: LearnerModel,
  tierOf: (code: string) => number,
  config: PolicyConfig,
  /** A foil type that must stay on screen (focused practice on it). */
  keepCode?: string,
  /** Validated adviser suggestion: approved foil words to prefer when showing fewer choices. */
  preferFoilWords: readonly string[] = [],
): Presentation & { usedPreferredFoils: boolean } {
  const isHard = (f: Foil) => tierOf(f.code) >= config.tierGate.hardTierFrom
  const hard = item.foils.filter(isHard)
  let foils: Foil[] = [...item.foils]
  let reason: PresentationReason = 'FULL_SET'

  if (hard.length > 0) {
    if (isReadyForHarderFoils(learner, item.skillId, config)) {
      const seenHardBefore = skillQuestions(learner, item.skillId).some((q) =>
        q.presentedFoilCodes.some((code) => tierOf(code) >= config.tierGate.hardTierFrom),
      )
      if (!seenHardBefore) reason = 'INTRODUCE_NEW_CHALLENGE'
    } else {
      // Hold harder tiers back, but keep at least minFoils by returning the easiest held ones.
      const easy = item.foils.filter((f) => !isHard(f))
      const topUp = byTier(hard, tierOf).slice(0, Math.max(0, config.minFoils - easy.length))
      foils = inItemOrder(item, [...easy, ...topUp])
      if (foils.length < item.foils.length) reason = 'HOLD_HARDER_FOILS'
    }
  }

  let usedPreferredFoils = false
  if (isStruggling(learner, item.skillId, config) && foils.length > config.scaffold.foilCount) {
    // Advised foils first (only ones already allowed here), then the easiest by tier.
    const byDefault = byTier(foils, tierOf).slice(0, config.scaffold.foilCount)
    const preferred = foils.filter((f) => preferFoilWords.includes(f.word))
    const rest = byTier(
      foils.filter((f) => !preferred.includes(f)),
      tierOf,
    )
    const chosen = [...preferred, ...rest].slice(0, config.scaffold.foilCount)
    usedPreferredFoils = !byDefault.every((f) => chosen.includes(f))
    foils = inItemOrder(item, chosen)
    reason = 'SCAFFOLD_REDUCE_CHOICES'
  }

  // Focused practice must actually show the foil type being practised.
  const keep = keepCode === undefined ? undefined : item.foils.find((f) => f.code === keepCode)
  if (keep && !foils.includes(keep)) {
    const hardestShown = byTier(foils, tierOf).at(-1)
    foils = inItemOrder(item, [...foils.filter((f) => f !== hardestShown), keep])
  }

  return {
    foils,
    reason,
    heldFoilCodes: item.foils.filter((f) => !foils.includes(f)).map((f) => f.code),
    usedPreferredFoils,
  }
}
