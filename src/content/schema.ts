/**
 * Runtime schemas for the normalized content dataset.
 *
 * Shared by the import script (build time) and the app (load time), so the
 * JSON that ships is checked against the same contract it was written with.
 */
import { z } from 'zod'

export const CONTENT_SCHEMA_VERSION = 1

/** Every foil, per ResearchBasis note 6, has this prefix when it is an L1-transfer foil. */
export const L1_TRANSFER_CODE_PREFIX = 'L1-'

const word = z.string().regex(/^[a-z]+$/, 'must be lowercase letters a-z')

export const foilSchema = z.object({
  word,
  /** Raw FoilCodebook code (e.g. "V", "FC", "PH"). Meaning lives in the codebook, never in code. */
  code: z.string().min(1),
})

export const foilCodebookEntrySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  definition: z.string().min(1),
  example: z.string().min(1),
  probe: z.string().min(1),
  /** Parsed from the "Difficulty tier" column, e.g. "Tier 4 (hardest)" -> 4. */
  tier: z.number().int().positive(),
  tierLabel: z.string().min(1),
  isL1Transfer: z.boolean(),
})

export const levelSchema = z.object({
  level: z.number().int().positive(),
  skillId: z.string().min(1),
  skillPattern: z.string().min(1),
  targetWordCount: z.number().int().positive(),
  /** Developer/reviewer-facing only. Never shown to children. */
  foilDesignLogic: z.string(),
  researchRationale: z.string(),
})

export const itemSchema = z.object({
  id: z.string().regex(/^item-\d{3,}$/),
  /** 1-based WordList row the item was imported from, for traceability. */
  sourceRow: z.number().int().min(2),
  level: z.number().int().positive(),
  itemNumber: z.number().int().positive(),
  sequenceInLevel: z.number().int().positive(),
  skillId: z.string().min(1),
  skillPattern: z.string().min(1),
  target: word,
  foils: z.array(foilSchema).length(3),
  realWordFoilCount: z.number().int().min(0).max(3),
  l1TransferFoilCount: z.number().int().min(0).max(3),
  /** Developer/reviewer-facing only. Never shown to children. */
  designNote: z.string().nullable(),
})

export const contentDatasetSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  /** SHA-256 of the normalized levels, codebook and items. Stored on every learning event. */
  contentVersion: z.string().regex(/^[0-9a-f]{64}$/),
  source: z.object({
    file: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  levels: z.array(levelSchema).min(1),
  foilCodebook: z.array(foilCodebookEntrySchema).min(1),
  items: z.array(itemSchema).min(1),
  /** ResearchBasis sheet, one entry per line. Developer-facing only. */
  researchNotes: z.array(z.string()),
})

export type Foil = z.infer<typeof foilSchema>
export type FoilCodebookEntry = z.infer<typeof foilCodebookEntrySchema>
export type Level = z.infer<typeof levelSchema>
export type Item = z.infer<typeof itemSchema>
export type ContentDataset = z.infer<typeof contentDatasetSchema>

/** The dataset before build-time hashing adds `contentVersion` and `source`. */
export type ContentDraft = Omit<ContentDataset, 'contentVersion' | 'source'>

export const skillIdForLevel = (level: number): string => `level-${level}`

export const itemIdFor = (itemNumber: number): string =>
  `item-${String(itemNumber).padStart(3, '0')}`
