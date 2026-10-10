/**
 * Turns raw spreadsheet rows into the normalized content draft.
 *
 * Pure and xlsx-free: the import script reads the workbook into plain row
 * arrays and hands them here, so every rule is unit-testable with fixtures.
 * This is the only module that knows the spreadsheet's column layout.
 */
import type { ContentIssue } from './issues.ts'
import {
  L1_TRANSFER_CODE_PREFIX,
  itemIdFor,
  skillIdForLevel,
  type ContentDraft,
  type FoilCodebookEntry,
  type Item,
  type Level,
} from './schema.ts'

export type Cell = string | number | boolean | null
export type SheetRows = readonly (readonly Cell[])[]
export type RawWorkbook = Readonly<Record<string, SheetRows>>

export const SHEETS = {
  wordList: 'WordList',
  levelGuide: 'LevelGuide',
  foilCodebook: 'FoilCodebook',
  summary: 'Summary',
  researchBasis: 'ResearchBasis',
} as const

export const WORD_LIST_HEADER = [
  'Level',
  'Item #',
  'Seq in level',
  'Skill / spelling pattern',
  'Target word (audio)',
  'Foil 1',
  'Type 1',
  'Foil 2',
  'Type 2',
  'Foil 3',
  'Type 3',
  'Real-word foils (count)',
  'L1-transfer foils (count)',
  'Design note',
] as const

export const LEVEL_GUIDE_HEADER = [
  'Level',
  'Skill / spelling pattern',
  '# target words',
  'Foil design logic (what each foil is built to test)',
  'Research rationale',
] as const

export const FOIL_CODEBOOK_HEADER = [
  'Code',
  'Foil type',
  'Definition',
  'Example',
  'What it probes / research basis',
  'Difficulty tier',
] as const

/** The Summary sheet as data for cross-checking; it is not shipped to the app. */
export interface SummaryRow {
  row: number
  counts: Record<string, number>
  foilsInLevel: number
}

export interface SummarySheet {
  codes: string[]
  perLevel: Map<number, SummaryRow>
  total: SummaryRow | null
  realWordFoilShare: number | null
  l1TaggedFoilCount: number | null
  pseudohomophoneFoilCount: number | null
}

export interface NormalizeResult {
  draft: ContentDraft | null
  summary: SummarySheet | null
  issues: ContentIssue[]
}

const isBlank = (cell: Cell | undefined): boolean =>
  cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')

const isBlankRow = (row: readonly Cell[]): boolean => row.every(isBlank)

interface RowReader {
  int(index: number): number | null
  text(index: number): string | null
  optionalText(index: number): string | null
}

/** Reads typed cells, recording an issue instead of throwing. */
function rowReader(
  sheet: string,
  rowNumber: number,
  row: readonly Cell[],
  header: readonly string[],
  issues: ContentIssue[],
): RowReader {
  const report = (index: number, message: string) =>
    issues.push({
      severity: 'error',
      sheet,
      row: rowNumber,
      field: header[index] ?? `column ${index + 1}`,
      message,
    })

  return {
    int(index) {
      const cell = row[index]
      if (isBlank(cell)) {
        report(index, 'is required')
        return null
      }
      if (typeof cell !== 'number' || !Number.isInteger(cell)) {
        report(index, `must be a whole number (got ${JSON.stringify(cell)})`)
        return null
      }
      return cell
    },
    text(index) {
      const cell = row[index]
      if (isBlank(cell)) {
        report(index, 'is required')
        return null
      }
      return String(cell).trim()
    },
    optionalText(index) {
      const cell = row[index]
      return isBlank(cell) ? null : String(cell).trim()
    },
  }
}

function checkHeader(
  sheet: string,
  rows: SheetRows,
  expected: readonly string[],
  issues: ContentIssue[],
): boolean {
  const actual = rows[0] ?? []
  const mismatch = expected.findIndex((name, i) => String(actual[i] ?? '').trim() !== name)
  if (mismatch === -1) return true
  issues.push({
    severity: 'error',
    sheet,
    row: 1,
    field: `column ${mismatch + 1}`,
    message: `expected header "${expected[mismatch]}" but found ${JSON.stringify(actual[mismatch] ?? null)}`,
  })
  return false
}

/** Data rows with their 1-based spreadsheet row number, skipping fully blank rows. */
function dataRows(rows: SheetRows): { rowNumber: number; row: readonly Cell[] }[] {
  return rows
    .map((row, index) => ({ rowNumber: index + 1, row }))
    .slice(1)
    .filter(({ row }) => !isBlankRow(row))
}

function normalizeCodebook(rows: SheetRows, issues: ContentIssue[]): FoilCodebookEntry[] {
  const sheet = SHEETS.foilCodebook
  const entries: FoilCodebookEntry[] = []
  for (const { rowNumber, row } of dataRows(rows)) {
    const r = rowReader(sheet, rowNumber, row, FOIL_CODEBOOK_HEADER, issues)
    const [code, name, definition, example, probe, tierLabel] = [0, 1, 2, 3, 4, 5].map((i) =>
      r.text(i),
    )
    if (!code || !name || !definition || !example || !probe || !tierLabel) continue
    const tierMatch = /^Tier\s+(\d+)\b/.exec(tierLabel)
    if (!tierMatch?.[1]) {
      issues.push({
        severity: 'error',
        sheet,
        row: rowNumber,
        field: 'Difficulty tier',
        message: `cannot read a tier number from "${tierLabel}"`,
      })
      continue
    }
    entries.push({
      code,
      name,
      definition,
      example,
      probe,
      tier: Number(tierMatch[1]),
      tierLabel,
      isL1Transfer: code.startsWith(L1_TRANSFER_CODE_PREFIX),
    })
  }
  return entries
}

interface LevelGuideResult {
  levels: Level[]
  total: { row: number; count: number } | null
}

function normalizeLevelGuide(rows: SheetRows, issues: ContentIssue[]): LevelGuideResult {
  const sheet = SHEETS.levelGuide
  const levels: Level[] = []
  let total: LevelGuideResult['total'] = null
  for (const { rowNumber, row } of dataRows(rows)) {
    // The guide ends with a "Total" row whose Level cell is blank.
    if (isBlank(row[0]) && String(row[1] ?? '').trim() === 'Total') {
      total = typeof row[2] === 'number' ? { row: rowNumber, count: row[2] } : null
      continue
    }
    const r = rowReader(sheet, rowNumber, row, LEVEL_GUIDE_HEADER, issues)
    const level = r.int(0)
    const skillPattern = r.text(1)
    const targetWordCount = r.int(2)
    if (level === null || skillPattern === null || targetWordCount === null) continue
    levels.push({
      level,
      skillId: skillIdForLevel(level),
      skillPattern,
      targetWordCount,
      foilDesignLogic: r.optionalText(3) ?? '',
      researchRationale: r.optionalText(4) ?? '',
    })
  }
  return { levels, total }
}

function normalizeWordList(rows: SheetRows, issues: ContentIssue[]): Item[] {
  const sheet = SHEETS.wordList
  const items: Item[] = []
  for (const { rowNumber, row } of dataRows(rows)) {
    const r = rowReader(sheet, rowNumber, row, WORD_LIST_HEADER, issues)
    const level = r.int(0)
    const itemNumber = r.int(1)
    const sequenceInLevel = r.int(2)
    const skillPattern = r.text(3)
    const target = r.text(4)
    const foils = [5, 7, 9].map((i) => ({ word: r.text(i), code: r.text(i + 1) }))
    const realWordFoilCount = r.int(11)
    const l1TransferFoilCount = r.int(12)
    const designNote = r.optionalText(13)

    if (
      level === null ||
      itemNumber === null ||
      sequenceInLevel === null ||
      skillPattern === null ||
      target === null ||
      realWordFoilCount === null ||
      l1TransferFoilCount === null ||
      foils.some((f) => f.word === null || f.code === null)
    ) {
      continue // Incomplete rows are reported above and never become playable items.
    }

    items.push({
      id: itemIdFor(itemNumber),
      sourceRow: rowNumber,
      level,
      itemNumber,
      sequenceInLevel,
      skillId: skillIdForLevel(level),
      skillPattern,
      target,
      foils: foils.map((f) => ({ word: f.word ?? '', code: f.code ?? '' })),
      realWordFoilCount,
      l1TransferFoilCount,
      designNote,
    })
  }
  return items
}

function normalizeSummary(rows: SheetRows, issues: ContentIssue[]): SummarySheet | null {
  const sheet = SHEETS.summary
  const header = (rows[0] ?? []).map((cell) => String(cell ?? '').trim())
  const foilsColumn = header.indexOf('Foils in level')
  if (header[0] !== 'Level' || foilsColumn < 2) {
    issues.push({
      severity: 'error',
      sheet,
      row: 1,
      message: 'expected a header of "Level", foil codes…, "Foils in level"',
    })
    return null
  }
  const codes = header.slice(1, foilsColumn)
  const summary: SummarySheet = {
    codes,
    perLevel: new Map(),
    total: null,
    realWordFoilShare: null,
    l1TaggedFoilCount: null,
    pseudohomophoneFoilCount: null,
  }

  for (const { rowNumber, row } of dataRows(rows)) {
    const label = row[0]
    const counts: Record<string, number> = {}
    codes.forEach((code, i) => {
      const cell = row[i + 1]
      counts[code] = typeof cell === 'number' ? cell : Number.NaN
    })
    const foilsInLevel = typeof row[foilsColumn] === 'number' ? row[foilsColumn] : Number.NaN

    if (typeof label === 'number') {
      summary.perLevel.set(label, { row: rowNumber, counts, foilsInLevel })
    } else if (label === 'Total') {
      summary.total = { row: rowNumber, counts, foilsInLevel }
    } else if (typeof label === 'string') {
      // Footnote statistics: the label is in column A and the value in the first numeric cell.
      const value = row.find((cell): cell is number => typeof cell === 'number') ?? null
      if (label.startsWith('Real-word foils')) summary.realWordFoilShare = value
      else if (label.startsWith('Foils with L1-transfer tag')) summary.l1TaggedFoilCount = value
      else if (label.startsWith('Pseudohomophone foils')) summary.pseudohomophoneFoilCount = value
    }
  }
  return summary
}

export function normalizeWorkbook(workbook: RawWorkbook): NormalizeResult {
  const issues: ContentIssue[] = []
  const sheetRows = (name: string): SheetRows | null => {
    const rows = workbook[name]
    if (!rows) {
      issues.push({ severity: 'error', sheet: name, message: 'sheet is missing from the workbook' })
      return null
    }
    return rows
  }

  const wordListRows = sheetRows(SHEETS.wordList)
  const levelGuideRows = sheetRows(SHEETS.levelGuide)
  const codebookRows = sheetRows(SHEETS.foilCodebook)
  const summaryRows = sheetRows(SHEETS.summary)
  const researchRows = sheetRows(SHEETS.researchBasis)
  if (!wordListRows || !levelGuideRows || !codebookRows || !summaryRows || !researchRows) {
    return { draft: null, summary: null, issues }
  }

  const headersOk = [
    checkHeader(SHEETS.wordList, wordListRows, WORD_LIST_HEADER, issues),
    checkHeader(SHEETS.levelGuide, levelGuideRows, LEVEL_GUIDE_HEADER, issues),
    checkHeader(SHEETS.foilCodebook, codebookRows, FOIL_CODEBOOK_HEADER, issues),
  ].every(Boolean)
  if (!headersOk) return { draft: null, summary: null, issues }

  const { levels, total } = normalizeLevelGuide(levelGuideRows, issues)
  if (total && total.count !== levels.reduce((sum, l) => sum + l.targetWordCount, 0)) {
    issues.push({
      severity: 'error',
      sheet: SHEETS.levelGuide,
      row: total.row,
      field: '# target words',
      message: `Total ${total.count} does not equal the sum of level word counts`,
    })
  }

  const draft: ContentDraft = {
    schemaVersion: 1,
    levels,
    foilCodebook: normalizeCodebook(codebookRows, issues),
    items: normalizeWordList(wordListRows, issues),
    researchNotes: dataRows(researchRows).map(({ row }) => String(row[0]).trim()),
  }
  return { draft, summary: normalizeSummary(summaryRows, issues), issues }
}
