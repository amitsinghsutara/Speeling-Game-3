// @vitest-environment node
/**
 * WCAG contrast for every text/background pairing the UI uses, computed from
 * the real theme tokens (jsdom cannot measure contrast, so axe skips it).
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const UI = resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui')
const css = readFileSync(resolve(UI, 'styles/theme.css'), 'utf8')
const signCss = readFileSync(resolve(UI, 'components/Cartoon.module.css'), 'utf8')
const tokens = new Map([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1] ?? '', (m[2] ?? '').toLowerCase()]))
const colour = (name: string): string => {
  if (name.startsWith('#')) return name
  const value = tokens.get(name)
  if (!value) throw new Error(`no colour token --${name}`)
  return value
}

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(colour(a)), luminance(colour(b))].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

// [text, background, where it is used]
const BODY_TEXT: [string, string, string][] = [
  ['ink', 'paper', 'speech bubbles, cards, dialog'],
  ['ink', '#ffffff', 'speech bubble (plain)'],
  ['ink', 'yes-bg', 'speech bubble after a right answer'],
  ['ink', 'try-bg', 'speech bubble after a wrong answer'],
  ['ink-soft', 'paper', 'skill names, muted text'],
  ['ink-soft', '#efe9df', 'skill names on locked level cards'],
  ['ink', '#efe9df', 'titles on locked level cards'],
  ['ink', 'sky-bottom', 'text over the sky'],
]

// Answer words and button labels: large and bold, so the large-text threshold (3:1) applies,
// but we hold them to 4.5:1 anyway because they are what the child is reading.
const WORDS_AND_BUTTONS: [string, string, string][] = [
  ['ink', 'tangerine', 'answer tile'],
  ['ink', 'bubble', 'answer tile, speaker'],
  ['ink', 'berry', 'answer tile'],
  ['ink', 'grape', 'answer tile'],
  ['ink', 'yes', 'correct answer tile'],
  ['ink', 'lime', 'main buttons'],
  ['ink', 'lemon', 'puzzle stones, star badges'],
  ['ink', 'paper', 'secondary buttons'],
]

describe('colour contrast (WCAG 2.x)', () => {
  it.each(BODY_TEXT)('%s on %s meets 4.5:1 (%s)', (text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(WORDS_AND_BUTTONS)('%s on %s meets 4.5:1 (%s)', (text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps tried (crossed-out) answers readable at the large-text level, 3:1', () => {
    expect(contrast('ink-soft', '#e9e4dc')).toBeGreaterThanOrEqual(3)
  })

  it('outlines sign text in ink, because light text on wood alone would be too faint', () => {
    // Sign titles are paper-coloured with a thick ink outline (text-shadow). The outline
    // against the wood is what carries the contrast; the fill alone does not.
    expect(contrast('paper', 'wood')).toBeLessThan(3)
    expect(contrast('ink', 'wood')).toBeGreaterThanOrEqual(4.5)
    expect(signCss).toMatch(/text-shadow: 0 3px 0 var\(--ink\)/)
  })
})
