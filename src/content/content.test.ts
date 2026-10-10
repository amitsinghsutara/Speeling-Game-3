import { describe, expect, it } from 'vitest'
import { validWorkbook, type FixtureWorkbook } from '../test/fixtures/workbook.ts'
import { hasErrors, type ContentIssue } from './issues.ts'
import { SHEETS, normalizeWorkbook, type Cell } from './normalize.ts'
import { validateDraft } from './validate.ts'

function run(workbook: FixtureWorkbook) {
  const { draft, summary, issues } = normalizeWorkbook(workbook)
  const all = draft ? [...issues, ...validateDraft(draft, summary)] : issues
  return { draft, issues: all, errors: all.filter((i) => i.severity === 'error') }
}

function setCell(rows: Cell[][], rowIndex: number, column: number, value: Cell): void {
  const row = rows[rowIndex]
  if (!row) throw new Error(`fixture has no row ${rowIndex}`)
  row[column] = value
}

const expectIssue = (issues: ContentIssue[], match: Partial<ContentIssue> & { message?: RegExp | string }) => {
  const { message, ...rest } = match
  expect(issues).toContainEqual(
    expect.objectContaining({
      ...rest,
      ...(message !== undefined && {
        message: typeof message === 'string' ? expect.stringContaining(message) : expect.stringMatching(message),
      }),
    }),
  )
}

// WordList columns, matching WORD_LIST_HEADER.
const COL = { level: 0, item: 1, seq: 2, skill: 3, target: 4, foil1: 5, type1: 6, foil2: 7, type3: 10, l1Count: 12 }

describe('normalizeWorkbook', () => {
  it('normalizes a consistent workbook with no issues', () => {
    const { draft, issues } = run(validWorkbook())
    expect(issues).toEqual([])
    expect(draft?.items).toHaveLength(3)
    expect(draft?.levels.map((l) => l.skillId)).toEqual(['level-1', 'level-2'])
  })

  it('preserves raw foil codes, stable IDs, source rows and design notes', () => {
    const item = run(validWorkbook()).draft?.items[2]
    expect(item).toMatchObject({
      id: 'item-003',
      sourceRow: 4,
      level: 2,
      sequenceInLevel: 1,
      target: 'cake',
      foils: [
        { word: 'kake', code: 'PH' },
        { word: 'coke', code: 'V' },
        { word: 'cave', code: 'FC' },
      ],
      designNote: 'Fixture note.',
    })
  })

  it('reads codebook tiers and L1 flags as data', () => {
    const codebook = run(validWorkbook()).draft?.foilCodebook ?? []
    expect(codebook.find((e) => e.code === 'PH')).toMatchObject({ tier: 4, tierLabel: 'Tier 4 (hardest)' })
    expect(codebook.filter((e) => e.isL1Transfer).map((e) => e.code)).toEqual(['L1-RL'])
  })

  it('keeps research notes in order and skips blank lines', () => {
    expect(run(validWorkbook()).draft?.researchNotes).toEqual(['Note one.', 'Note two.'])
  })

  it('reports a missing sheet', () => {
    const workbook: Partial<FixtureWorkbook> = validWorkbook()
    delete workbook[SHEETS.foilCodebook]
    const { draft, errors } = run(workbook as FixtureWorkbook)
    expect(draft).toBeNull()
    expectIssue(errors, { sheet: 'FoilCodebook', message: 'missing' })
  })

  it('reports a shifted header instead of misreading columns', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 0, COL.foil1, 'Foil A')
    const { draft, errors } = run(workbook)
    expect(draft).toBeNull()
    expectIssue(errors, { sheet: 'WordList', row: 1, field: 'column 6' })
  })

  it('reports an incomplete row by row and field and never makes it playable', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 2, COL.foil2, null)
    const { draft, errors } = run(workbook)
    expectIssue(errors, { sheet: 'WordList', row: 3, field: 'Foil 2', message: 'required' })
    expect(draft?.items.map((i) => i.target)).not.toContain('red')
  })

  it('reports a non-numeric level', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 1, COL.level, 'one')
    expectIssue(run(workbook).errors, { row: 2, field: 'Level', message: 'whole number' })
  })

  it('reports an unreadable difficulty tier', () => {
    const workbook = validWorkbook()
    setCell(workbook.FoilCodebook, 1, 5, 'Easy')
    expectIssue(run(workbook).errors, { sheet: 'FoilCodebook', row: 2, field: 'Difficulty tier' })
  })
})

describe('validateDraft', () => {
  it('rejects an unknown foil code', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 1, COL.type1, 'XX')
    expectIssue(run(workbook).errors, { row: 2, field: 'Type 1', message: 'unknown foil code "XX"' })
  })

  it('rejects duplicate answer choices, including a foil equal to the target', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 1, COL.foil1, 'sat')
    expectIssue(run(workbook).errors, { row: 2, message: 'not distinct: sat' })
  })

  it('rejects duplicate item numbers', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 2, COL.item, 1)
    expectIssue(run(workbook).errors, { row: 3, field: 'Item #', message: 'duplicate' })
  })

  it('warns, but does not fail, on a repeated target word', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 2, COL.target, 'sat')
    setCell(workbook.WordList, 2, COL.foil1, 'set')
    const { issues } = run(workbook)
    expectIssue(issues, { severity: 'warning', row: 3, message: 'also appears as item-001' })
  })

  it('rejects sequence gaps within a level', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 2, COL.seq, 3)
    expectIssue(run(workbook).errors, { field: 'Seq in level', message: 'level 1' })
  })

  it('rejects a skill pattern that disagrees with the LevelGuide', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 1, COL.skill, 'CVC')
    expectIssue(run(workbook).errors, { row: 2, field: 'Skill / spelling pattern' })
  })

  it('rejects a level word count that disagrees with the LevelGuide', () => {
    const workbook = validWorkbook()
    setCell(workbook.LevelGuide, 1, 2, 5)
    expectIssue(run(workbook).errors, { message: 'level 1 has 2 items but LevelGuide expects 5' })
  })

  it('rejects an L1-transfer count that disagrees with the foil codes', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 2, COL.l1Count, 0)
    expectIssue(run(workbook).errors, { row: 3, field: 'L1-transfer foils (count)' })
  })

  it('rejects words that are not lowercase letters instead of silently fixing them', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 1, COL.target, 'Sat')
    expect(hasErrors(run(workbook).issues)).toBe(true)
  })

  it('reconciles per-level foil-type counts with the Summary sheet', () => {
    const workbook = validWorkbook()
    setCell(workbook.WordList, 3, COL.type3, 'V') // cake: FC → V
    const { errors } = run(workbook)
    expectIssue(errors, { sheet: 'Summary', field: 'V', message: 'level 2: Summary says 1 "V" foils but WordList has 2' })
    expectIssue(errors, { sheet: 'Summary', field: 'FC', message: 'Total' })
  })

  it('reconciles the Summary footnote statistics', () => {
    const workbook = validWorkbook()
    setCell(workbook.Summary, 6, 3, 5) // "Foils with L1-transfer tag"
    expectIssue(run(workbook).errors, { field: 'Foils with L1-transfer tag', message: 'Summary says 5 but WordList gives 1' })
  })
})
