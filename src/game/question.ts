/**
 * Builds the answer choices for one item. Only the item's own approved foils
 * can ever appear, and the target is never altered.
 */
import type { Foil, Item } from '../content/schema.ts'
import { shuffle, type RandomSource } from './random.ts'

export interface Choice {
  word: string
  isTarget: boolean
  /** FoilCodebook code; absent on the target. Never shown to the child. */
  foilCode?: string
}

export interface Question {
  itemId: string
  target: string
  choices: Choice[]
}

export class InvalidQuestionError extends Error {
  override name = 'InvalidQuestionError'
}

export interface BuildQuestionOptions {
  random: RandomSource
  /**
   * The foils to present, for scaffolding with fewer choices. Each must be one of
   * the item's own foils. Defaults to all of them.
   */
  foils?: readonly Foil[]
}

export function buildQuestion(item: Item, { random, foils = item.foils }: BuildQuestionOptions): Question {
  if (foils.length === 0) throw new InvalidQuestionError(`${item.id}: at least one foil is required`)
  const seen = new Set<string>()
  for (const foil of foils) {
    const approved = item.foils.some((f) => f.word === foil.word && f.code === foil.code)
    if (!approved) {
      throw new InvalidQuestionError(`${item.id}: "${foil.word}" is not an approved foil for this item`)
    }
    if (seen.has(foil.word)) throw new InvalidQuestionError(`${item.id}: foil "${foil.word}" is repeated`)
    seen.add(foil.word)
  }

  const choices: Choice[] = [
    { word: item.target, isTarget: true },
    ...foils.map((f) => ({ word: f.word, isTarget: false, foilCode: f.code })),
  ]
  return { itemId: item.id, target: item.target, choices: shuffle(choices, random) }
}

/**
 * The item's `count` easiest foils by codebook tier, keeping spreadsheet order
 * among equal tiers. Used for scaffolding; never invents an ordering the
 * codebook does not give.
 */
export function easiestFoils(item: Item, tierOf: (code: string) => number, count: number): Foil[] {
  return item.foils
    .map((foil, index) => ({ foil, index, tier: tierOf(foil.code) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .slice(0, Math.max(1, count))
    .map(({ foil }) => foil)
}
