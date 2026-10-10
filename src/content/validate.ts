/**
 * Cross-row validation of a normalized content draft.
 *
 * Row-level shape problems are caught in normalize.ts; this checks the
 * relationships between rows and sheets, including the spreadsheet's own
 * Summary sheet, which is treated as an independent tally to reconcile against.
 */
import type { ContentIssue } from './issues.ts'
import type { SummaryRow, SummarySheet } from './normalize.ts'
import { SHEETS } from './normalize.ts'
import { contentDatasetSchema, type ContentDraft, type Item } from './schema.ts'

/** Exact for small tallies; tolerates rounding in the Summary sheet's share column. */
const SHARE_TOLERANCE = 1e-6

function checkCodebook(draft: ContentDraft, issues: ContentIssue[]): void {
  const seen = new Set<string>()
  for (const entry of draft.foilCodebook) {
    if (seen.has(entry.code)) {
      issues.push({
        severity: 'error',
        sheet: SHEETS.foilCodebook,
        field: 'Code',
        message: `duplicate code "${entry.code}"`,
      })
    }
    seen.add(entry.code)
  }
}

function checkLevels(draft: ContentDraft, issues: ContentIssue[]): void {
  const numbers = draft.levels.map((l) => l.level)
  numbers.forEach((n, i) => {
    if (n !== i + 1) {
      issues.push({
        severity: 'error',
        sheet: SHEETS.levelGuide,
        field: 'Level',
        message: `levels must be numbered 1..N in order; position ${i + 1} is level ${n}`,
      })
    }
  })
}

function checkItems(draft: ContentDraft, issues: ContentIssue[]): void {
  const sheet = SHEETS.wordList
  const codes = new Map(draft.foilCodebook.map((e) => [e.code, e]))
  const levels = new Map(draft.levels.map((l) => [l.level, l]))
  const ids = new Map<string, Item>()
  const targets = new Map<string, Item>()

  for (const item of draft.items) {
    const issue = (field: string, message: string, severity: 'error' | 'warning' = 'error') =>
      issues.push({ severity, sheet, row: item.sourceRow, field, message })

    if (ids.has(item.id)) issue('Item #', `duplicate item number ${item.itemNumber}`)
    ids.set(item.id, item)

    const previousTarget = targets.get(item.target)
    if (previousTarget) {
      issue(
        'Target word (audio)',
        `target "${item.target}" also appears as ${previousTarget.id}`,
        'warning',
      )
    }
    targets.set(item.target, item)

    const level = levels.get(item.level)
    if (!level) {
      issue('Level', `level ${item.level} is not in the LevelGuide`)
    } else if (level.skillPattern !== item.skillPattern) {
      issue(
        'Skill / spelling pattern',
        `"${item.skillPattern}" does not match LevelGuide "${level.skillPattern}" for level ${item.level}`,
      )
    }

    const choices = [item.target, ...item.foils.map((f) => f.word)]
    const duplicates = choices.filter((w, i) => choices.indexOf(w) !== i)
    if (duplicates.length > 0) {
      issue('Foil', `answer choices are not distinct: ${[...new Set(duplicates)].join(', ')}`)
    }

    item.foils.forEach((foil, i) => {
      if (!codes.has(foil.code)) issue(`Type ${i + 1}`, `unknown foil code "${foil.code}"`)
    })

    const l1Count = item.foils.filter((f) => codes.get(f.code)?.isL1Transfer).length
    if (l1Count !== item.l1TransferFoilCount) {
      issue(
        'L1-transfer foils (count)',
        `says ${item.l1TransferFoilCount} but ${l1Count} foil(s) carry an L1 code`,
      )
    }
  }

  for (const level of draft.levels) {
    const inLevel = draft.items.filter((i) => i.level === level.level)
    if (inLevel.length !== level.targetWordCount) {
      issues.push({
        severity: 'error',
        sheet,
        field: 'Level',
        message: `level ${level.level} has ${inLevel.length} items but LevelGuide expects ${level.targetWordCount}`,
      })
    }
    const sequences = inLevel.map((i) => i.sequenceInLevel).sort((a, b) => a - b)
    sequences.forEach((seq, i) => {
      if (seq !== i + 1) {
        issues.push({
          severity: 'error',
          sheet,
          field: 'Seq in level',
          message: `level ${level.level} sequence must run 1..${inLevel.length} without gaps or repeats`,
        })
      }
    })
  }
}

function countCodes(items: readonly Item[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const foil of item.foils) counts.set(foil.code, (counts.get(foil.code) ?? 0) + 1)
  }
  return counts
}

function checkSummary(draft: ContentDraft, summary: SummarySheet, issues: ContentIssue[]): void {
  const sheet = SHEETS.summary
  const codebookCodes = new Set(draft.foilCodebook.map((e) => e.code))
  for (const code of summary.codes) {
    if (!codebookCodes.has(code)) {
      issues.push({ severity: 'error', sheet, row: 1, message: `column "${code}" is not a codebook code` })
    }
  }

  const compare = (row: number, label: string, expected: SummaryRow, items: readonly Item[]) => {
    const actual = countCodes(items)
    for (const code of summary.codes) {
      const want = expected.counts[code]
      const got = actual.get(code) ?? 0
      if (want !== got) {
        issues.push({
          severity: 'error',
          sheet,
          row,
          field: code,
          message: `${label}: Summary says ${want} "${code}" foils but WordList has ${got}`,
        })
      }
    }
    for (const code of actual.keys()) {
      if (!summary.codes.includes(code)) {
        issues.push({ severity: 'error', sheet, row, message: `${label}: no Summary column for "${code}"` })
      }
    }
    const foils = items.length * 3
    if (expected.foilsInLevel !== foils) {
      issues.push({
        severity: 'error',
        sheet,
        row,
        field: 'Foils in level',
        message: `${label}: Summary says ${expected.foilsInLevel} foils but WordList has ${foils}`,
      })
    }
  }

  for (const level of draft.levels) {
    const expected = summary.perLevel.get(level.level)
    if (!expected) {
      issues.push({ severity: 'error', sheet, message: `no Summary row for level ${level.level}` })
      continue
    }
    compare(expected.row, `level ${level.level}`, expected, draft.items.filter((i) => i.level === level.level))
  }
  if (summary.total) compare(summary.total.row, 'Total', summary.total, draft.items)
  else issues.push({ severity: 'error', sheet, message: 'missing "Total" row' })

  const allFoils = draft.items.length * 3
  const checks: [string, number | null, number][] = [
    [
      'Real-word foils (share of all foils)',
      summary.realWordFoilShare,
      draft.items.reduce((sum, i) => sum + i.realWordFoilCount, 0) / allFoils,
    ],
    [
      'Foils with L1-transfer tag',
      summary.l1TaggedFoilCount,
      draft.items.reduce((sum, i) => sum + i.l1TransferFoilCount, 0),
    ],
    ['Pseudohomophone foils (PH)', summary.pseudohomophoneFoilCount, countCodes(draft.items).get('PH') ?? 0],
  ]
  for (const [label, expected, actual] of checks) {
    if (expected === null) {
      issues.push({ severity: 'warning', sheet, field: label, message: 'statistic not found; not checked' })
    } else if (Math.abs(expected - actual) > SHARE_TOLERANCE) {
      issues.push({
        severity: 'error',
        sheet,
        field: label,
        message: `Summary says ${expected} but WordList gives ${actual}`,
      })
    }
  }
}

/** Validates a draft against its own sheets. `summary` is required at import time. */
export function validateDraft(draft: ContentDraft, summary: SummarySheet | null): ContentIssue[] {
  const issues: ContentIssue[] = []
  const shape = contentDatasetSchema
    .omit({ contentVersion: true, source: true })
    .safeParse(draft)
  if (!shape.success) {
    for (const problem of shape.error.issues) {
      issues.push({
        severity: 'error',
        sheet: 'dataset',
        field: problem.path.join('.'),
        message: problem.message,
      })
    }
  }
  checkCodebook(draft, issues)
  checkLevels(draft, issues)
  checkItems(draft, issues)
  if (summary) checkSummary(draft, summary, issues)
  else issues.push({ severity: 'error', sheet: SHEETS.summary, message: 'Summary sheet could not be read' })
  return issues
}
