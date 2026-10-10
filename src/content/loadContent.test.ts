import { describe, expect, it } from 'vitest'
import generated from './content.generated.json'
import { ContentLoadError, codebookEntry, itemsForLevel, loadContent, parseContent } from './loadContent.ts'

describe('loadContent', () => {
  it('loads the full bundled dataset', () => {
    const content = loadContent()
    expect(content.items).toHaveLength(200)
    expect(content.levels).toHaveLength(10)
    expect(content.foilCodebook).toHaveLength(18)
  })

  it('returns a level in sequence order', () => {
    const level1 = itemsForLevel(loadContent(), 1)
    expect(level1).toHaveLength(25)
    expect(level1.map((i) => i.sequenceInLevel)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
  })

  it('resolves every foil code to a codebook entry', () => {
    const content = loadContent()
    for (const foil of content.items.flatMap((i) => i.foils)) {
      expect(codebookEntry(content, foil.code)).toBeDefined()
    }
  })

  it('rejects a dataset that fails the schema', () => {
    expect(() => parseContent({ ...generated, items: [] })).toThrow(ContentLoadError)
  })

  it('rejects a foil code missing from the codebook', () => {
    const [first, ...rest] = generated.items
    const broken = { ...first, foils: first?.foils.map((f) => ({ ...f, code: 'NOPE' })) }
    expect(() => parseContent({ ...generated, items: [broken, ...rest] })).toThrow(/NOPE/)
  })
})
