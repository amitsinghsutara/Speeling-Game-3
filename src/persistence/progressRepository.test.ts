import { describe, expect, it } from 'vitest'
import { PROGRESS_KEY, emptyProgress, localProgressRepository } from './progressRepository.ts'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('localProgressRepository', () => {
  it('round-trips saved progress', () => {
    const repo = localProgressRepository(memoryStorage())
    const progress = { ...emptyProgress(), completedPuzzleIds: ['level-1/puzzle-1'], starsByPuzzleId: { 'level-1/puzzle-1': 2 } }
    repo.save(progress)
    expect(repo.load()).toEqual(progress)
  })

  it('starts empty when nothing is saved', () => {
    expect(localProgressRepository(memoryStorage()).load()).toEqual(emptyProgress())
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['an unknown schema version', JSON.stringify({ ...emptyProgress(), schemaVersion: 99 })],
    ['out-of-range stars', JSON.stringify({ ...emptyProgress(), starsByPuzzleId: { a: 7 } })],
  ])('falls back to empty progress on %s', (_, raw) => {
    const storage = memoryStorage()
    storage.data.set(PROGRESS_KEY, raw)
    expect(localProgressRepository(storage).load()).toEqual(emptyProgress())
  })

  it('never throws when storage is unavailable or full', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const repo = localProgressRepository(broken)
    expect(repo.load()).toEqual(emptyProgress())
    expect(() => repo.save(emptyProgress())).not.toThrow()
    expect(() => repo.clear()).not.toThrow()
    expect(localProgressRepository(null).load()).toEqual(emptyProgress())
  })
})
