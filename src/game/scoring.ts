/** Star rules adopted from Speeling Game 2 (spec Clarifications, 2026-10-10). */
export const MAX_STARS = 3

/** 0 mistakes → 3 stars, 1–3 → 2, 4 or more → 1. Completing always earns at least 1. */
export function starsForMistakes(mistakes: number): 1 | 2 | 3 {
  if (mistakes <= 0) return 3
  if (mistakes <= 3) return 2
  return 1
}

/** A replay never lowers a stored result. */
export const bestStars = (previous: number | undefined, next: number): number =>
  Math.max(previous ?? 0, next)
