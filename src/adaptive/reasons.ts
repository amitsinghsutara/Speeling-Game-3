/**
 * Closed, versioned vocabulary for adaptive decisions. Every decision carries
 * a strategy reason (why this word) and a presentation reason (why these choices).
 * Add codes by bumping REASON_CODES_VERSION; never reuse or rename a code.
 */
export const REASON_CODES_VERSION = 1

export const STRATEGY_REASONS = [
  /** The next new word in curriculum order. */
  'CONTINUE_SEQUENCE',
  /** A repeated error pattern was detected; practise words with that foil type. */
  'FOCUS_ERROR_PATTERN',
  /** Re-ask a word from this puzzle that was not right on the first try. */
  'CONSOLIDATE',
  /** An earlier skill is due for review after the configured interval. */
  'SPACED_REVIEW',
  /** Interleave a word from an earlier skill. */
  'MIXED_PRACTICE',
  /** The skill looks secure: try an approved word of the same skill not seen before. */
  'TRANSFER_CHECK',
] as const

export const PRESENTATION_REASONS = [
  /** All of the word's approved foils. */
  'FULL_SET',
  /** Fewer choices (the easiest approved foils) because recent answers in this skill were hard. */
  'SCAFFOLD_REDUCE_CHOICES',
  /** Harder foil tiers held back until the child shows readiness in this skill. */
  'HOLD_HARDER_FOILS',
  /** Harder foil tiers shown for the first time in this skill, because readiness was reached. */
  'INTRODUCE_NEW_CHALLENGE',
] as const

/** Why a strategy was considered but not used; recorded so decisions explain themselves. */
export const SKIP_REASONS = [
  'NO_ERROR_PATTERN',
  'NO_CANDIDATE_WORD',
  'EXTRA_BUDGET_USED',
  'STRATEGY_LIMIT_REACHED',
  'NOT_DUE',
  'NOT_READY',
  'TRANSFER_UNAVAILABLE',
  'NO_EARLIER_SKILL',
  'NOTHING_TO_CONSOLIDATE',
  'NEW_WORDS_REMAIN',
] as const

export type StrategyReason = (typeof STRATEGY_REASONS)[number]
export type PresentationReason = (typeof PRESENTATION_REASONS)[number]
export type SkipReason = (typeof SKIP_REASONS)[number]
