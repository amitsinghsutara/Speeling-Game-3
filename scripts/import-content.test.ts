// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OUTPUT_PATH, buildDataset, serialize } from './import-content.ts'

describe('import-content (authoritative spreadsheet)', () => {
  const { dataset, issues } = buildDataset()

  it('imports with no errors or warnings', () => {
    expect(issues).toEqual([])
    expect(dataset).not.toBeNull()
  })

  it('imports every row: 200 items across 10 levels with 3 foils each', () => {
    expect(dataset?.items).toHaveLength(200)
    expect(dataset?.levels.map((l) => l.targetWordCount)).toEqual([25, 25, 25, 20, 30, 20, 20, 15, 10, 10])
    expect(dataset?.items.every((i) => i.foils.length === 3)).toBe(true)
  })

  it('matches the committed generated dataset', () => {
    expect(dataset && serialize(dataset)).toBe(readFileSync(OUTPUT_PATH, 'utf8'))
  })
})
