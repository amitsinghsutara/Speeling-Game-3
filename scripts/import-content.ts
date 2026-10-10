/**
 * Content pipeline: English_Spelling_Words_and_Foils.xlsx → src/content/content.generated.json
 *
 *   npm run gen:content            regenerate the dataset (fails on any validation error)
 *   npm run gen:content -- --check fail if the committed dataset is out of date
 *
 * The spreadsheet is read, never written.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { formatIssue, hasErrors, type ContentIssue } from '../src/content/issues.ts'
import { normalizeWorkbook, type Cell, type RawWorkbook } from '../src/content/normalize.ts'
import { contentDatasetSchema, type ContentDataset } from '../src/content/schema.ts'
import { validateDraft } from '../src/content/validate.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_PATH = resolve(ROOT, 'English_Spelling_Words_and_Foils.xlsx')
export const OUTPUT_PATH = resolve(ROOT, 'src/content/content.generated.json')

const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

function readWorkbook(bytes: Uint8Array): RawWorkbook {
  const workbook = XLSX.read(bytes, { type: 'buffer' })
  const sheets: Record<string, Cell[][]> = {}
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (sheet) sheets[name] = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null })
  }
  return sheets
}

export interface BuildResult {
  dataset: ContentDataset | null
  issues: ContentIssue[]
}

export function buildDataset(sourcePath: string = SOURCE_PATH): BuildResult {
  const bytes = readFileSync(sourcePath)
  const { draft, summary, issues } = normalizeWorkbook(readWorkbook(bytes))
  if (!draft) return { dataset: null, issues }

  issues.push(...validateDraft(draft, summary))
  if (hasErrors(issues)) return { dataset: null, issues }

  const dataset = contentDatasetSchema.parse({
    schemaVersion: draft.schemaVersion,
    contentVersion: sha256(
      JSON.stringify({ levels: draft.levels, foilCodebook: draft.foilCodebook, items: draft.items }),
    ),
    source: { file: basename(sourcePath), sha256: sha256(bytes) },
    levels: draft.levels,
    foilCodebook: draft.foilCodebook,
    items: draft.items,
    researchNotes: draft.researchNotes,
  })
  return { dataset, issues }
}

export const serialize = (dataset: ContentDataset): string => `${JSON.stringify(dataset, null, 2)}\n`

function main(argv: readonly string[]): number {
  const check = argv.includes('--check')
  const { dataset, issues } = buildDataset()
  for (const issue of issues) console.error(formatIssue(issue))
  if (!dataset) {
    console.error(`\nContent import failed with ${issues.filter((i) => i.severity === 'error').length} error(s). Nothing was written.`)
    return 1
  }

  const output = serialize(dataset)
  const target = relative(ROOT, OUTPUT_PATH)
  if (check) {
    let current = ''
    try {
      current = readFileSync(OUTPUT_PATH, 'utf8')
    } catch {
      // A missing file is reported as out of date below.
    }
    if (current !== output) {
      console.error(`${target} is out of date. Run: npm run gen:content`)
      return 1
    }
    console.log(`${target} is up to date (content ${dataset.contentVersion.slice(0, 12)}).`)
    return 0
  }

  writeFileSync(OUTPUT_PATH, output)
  console.log(
    `Wrote ${dataset.items.length} items, ${dataset.levels.length} levels, ` +
      `${dataset.foilCodebook.length} foil codes to ${target} (content ${dataset.contentVersion.slice(0, 12)}).`,
  )
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
