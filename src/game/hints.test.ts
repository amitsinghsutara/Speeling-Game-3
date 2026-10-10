import { expect, it } from 'vitest'
import { loadContent } from '../content/loadContent.ts'
import { DEFAULT_HINT, hasHint, hintFor } from './hints.ts'

it('has a child-facing hint for every codebook code, so a new code is noticed', () => {
  const missing = loadContent().foilCodebook.filter((e) => !hasHint(e.code)).map((e) => e.code)
  expect(missing).toEqual([])
})

it('falls back to a gentle default', () => {
  expect(hintFor(undefined)).toBe(DEFAULT_HINT)
  expect(hintFor('NOT-A-CODE')).toBe(DEFAULT_HINT)
  expect(hintFor('V')).toBe('Listen to the middle sound.')
})
