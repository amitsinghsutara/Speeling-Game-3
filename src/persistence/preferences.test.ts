import { expect, it } from 'vitest'
import { PREFERENCES_KEY, defaultPreferences, localPreferencesRepository } from './preferences.ts'

const memory = () => {
  const data = new Map<string, string>()
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

it('defaults to sound effects on', () => {
  expect(localPreferencesRepository(memory()).load()).toEqual({ schemaVersion: 1, soundEffects: true })
})

it('remembers sound effects being turned off', () => {
  const storage = memory()
  localPreferencesRepository(storage).save({ schemaVersion: 1, soundEffects: false })
  expect(localPreferencesRepository(storage).load().soundEffects).toBe(false)
})

it('falls back to defaults on bad data or broken storage', () => {
  const storage = memory()
  storage.data.set(PREFERENCES_KEY, '{"soundEffects":"loud"}')
  expect(localPreferencesRepository(storage).load()).toEqual(defaultPreferences())
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  expect(localPreferencesRepository(broken).load()).toEqual(defaultPreferences())
  expect(() => localPreferencesRepository(broken).save(defaultPreferences())).not.toThrow()
})
