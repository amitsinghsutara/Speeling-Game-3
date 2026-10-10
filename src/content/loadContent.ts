/**
 * Runtime entry point for content. The JSON is bundled with the app, so this
 * never touches the network; it re-validates the shape so a hand-edited or
 * stale file fails loudly in development instead of misbehaving in play.
 */
import generated from './content.generated.json'
import { contentDatasetSchema, type ContentDataset, type FoilCodebookEntry, type Item } from './schema.ts'

export class ContentLoadError extends Error {
  override name = 'ContentLoadError'
}

export function parseContent(raw: unknown): ContentDataset {
  const result = contentDatasetSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ContentLoadError(
      `Content dataset is invalid at "${first?.path.join('.') ?? ''}": ${first?.message ?? 'unknown error'}`,
    )
  }
  const codes = new Set(result.data.foilCodebook.map((e) => e.code))
  const unknown = result.data.items.flatMap((i) => i.foils).find((f) => !codes.has(f.code))
  if (unknown) throw new ContentLoadError(`Foil code "${unknown.code}" is not in the codebook`)
  return result.data
}

let cached: ContentDataset | null = null

export function loadContent(): ContentDataset {
  cached ??= parseContent(generated)
  return cached
}

export const itemsForLevel = (content: ContentDataset, level: number): Item[] =>
  content.items
    .filter((item) => item.level === level)
    .sort((a, b) => a.sequenceInLevel - b.sequenceInLevel)

export const codebookEntry = (
  content: ContentDataset,
  code: string,
): FoilCodebookEntry | undefined => content.foilCodebook.find((e) => e.code === code)
