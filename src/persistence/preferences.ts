/**
 * Per-device preferences (not learning data). Invalid or missing values fall
 * back to defaults; storage errors never interrupt play.
 */
import { z } from 'zod'

export const PREFERENCES_KEY = 'spelling-adventure:preferences'

const preferencesSchema = z.object({
  schemaVersion: z.literal(1),
  soundEffects: z.boolean(),
})

export type Preferences = z.infer<typeof preferencesSchema>

export const defaultPreferences = (): Preferences => ({ schemaVersion: 1, soundEffects: true })

export interface PreferencesRepository {
  load(): Preferences
  save(preferences: Preferences): void
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function localPreferencesRepository(storage: StorageLike | null = defaultStorage()): PreferencesRepository {
  return {
    load() {
      try {
        const raw = storage?.getItem(PREFERENCES_KEY)
        if (!raw) return defaultPreferences()
        const parsed = preferencesSchema.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data : defaultPreferences()
      } catch {
        return defaultPreferences()
      }
    },
    save(preferences) {
      try {
        storage?.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
      } catch {
        // Ignore quota or access errors.
      }
    },
  }
}
