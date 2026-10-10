/**
 * Saved puzzle completion and stars, in localStorage. Stored data is
 * versioned and validated; anything missing, corrupt or from an unknown
 * version falls back to empty progress instead of crashing the game.
 */
import { z } from 'zod'

export const PROGRESS_KEY = 'spelling-adventure:progress'
export const PROGRESS_SCHEMA_VERSION = 1

const progressSchema = z.object({
  schemaVersion: z.literal(PROGRESS_SCHEMA_VERSION),
  completedPuzzleIds: z.array(z.string()),
  starsByPuzzleId: z.record(z.string(), z.number().int().min(1).max(3)),
})

export type SavedProgress = z.infer<typeof progressSchema>

export const emptyProgress = (): SavedProgress => ({
  schemaVersion: PROGRESS_SCHEMA_VERSION,
  completedPuzzleIds: [],
  starsByPuzzleId: {},
})

export interface ProgressRepository {
  load(): SavedProgress
  save(progress: SavedProgress): void
  clear(): void
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // Access can throw in private modes or sandboxed WebViews.
  }
}

export function localProgressRepository(storage: StorageLike | null = defaultStorage()): ProgressRepository {
  return {
    load() {
      try {
        const raw = storage?.getItem(PROGRESS_KEY)
        if (!raw) return emptyProgress()
        const parsed = progressSchema.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data : emptyProgress()
      } catch {
        return emptyProgress()
      }
    },
    save(progress) {
      try {
        storage?.setItem(PROGRESS_KEY, JSON.stringify(progress))
      } catch {
        // Quota or access errors must never interrupt play.
      }
    },
    clear() {
      try {
        storage?.removeItem(PROGRESS_KEY)
      } catch {
        // Ignore, as above.
      }
    },
  }
}
