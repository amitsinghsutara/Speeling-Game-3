import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { answerEvents } from '../test/fixtures/events.ts'
import {
  DB_NAME,
  EVENTS_STORE,
  indexedDbLearningEventStore,
  memoryLearningEventStore,
  openDatabase,
  openLearningEventStore,
} from './learningEventStore.ts'

describe('IndexedDB learning event store', () => {
  it('stores events and reads them back, oldest first', async () => {
    const store = await openLearningEventStore(new IDBFactory())
    expect(store.persistent).toBe(true)
    const [first, second] = answerEvents({ itemId: 'item-001', picks: ['V', 'target'] })
    if (!first || !second) throw new Error('fixture')
    await store.append(second)
    await store.append(first)
    const { events, skipped } = await store.load()
    expect(events.map((e) => e.id)).toEqual([first.id, second.id])
    expect(skipped).toBe(0)
  })

  it('keeps events across reopening the database', async () => {
    const factory = new IDBFactory()
    const events = answerEvents({ itemId: 'item-001', picks: ['target'] })
    const first = await openLearningEventStore(factory)
    for (const e of events) await first.append(e)
    const reopened = await openLearningEventStore(factory)
    expect((await reopened.load()).events).toEqual(events)
  })

  it('skips corrupt or unknown-version records instead of failing', async () => {
    const factory = new IDBFactory()
    const db = await openDatabase(factory)
    const tx = db.transaction(EVENTS_STORE, 'readwrite')
    tx.objectStore(EVENTS_STORE).put({ id: 'bad-1', schemaVersion: 99 })
    tx.objectStore(EVENTS_STORE).put({ id: 'bad-2', at: 'yesterday' })
    await new Promise((resolve) => (tx.oncomplete = resolve))
    const store = indexedDbLearningEventStore(db)
    for (const event of answerEvents({ itemId: 'item-001', picks: ['target'] })) await store.append(event)
    const { events, skipped } = await store.load()
    expect(events).toHaveLength(1)
    expect(skipped).toBe(2)
  })

  it('clears all events (reset)', async () => {
    const store = await openLearningEventStore(new IDBFactory())
    for (const e of answerEvents({ itemId: 'item-001', picks: ['V', 'target'] })) await store.append(e)
    await store.clear()
    expect((await store.load()).events).toEqual([])
  })

  it('creates the store and indexes on first open', async () => {
    const db = await openDatabase(new IDBFactory())
    expect(db.name).toBe(DB_NAME)
    const store = db.transaction(EVENTS_STORE).objectStore(EVENTS_STORE)
    expect([...store.indexNames].sort()).toEqual(['by-at', 'by-item'])
  })
})

describe('fallbacks', () => {
  it('uses memory when IndexedDB is missing', async () => {
    const store = await openLearningEventStore(undefined)
    expect(store.persistent).toBe(false)
    const events = answerEvents({ itemId: 'item-001', picks: ['target'] })
    for (const e of events) await store.append(e)
    expect((await store.load()).events).toEqual(events)
  })

  it('uses memory when IndexedDB cannot open, and never rejects', async () => {
    const broken = {
      open: () => {
        throw new Error('SecurityError')
      },
    } as unknown as IDBFactory
    await expect(openLearningEventStore(broken)).resolves.toMatchObject({ persistent: false })
  })

  it('memory store copies events, so later mutation cannot change history', async () => {
    const store = memoryLearningEventStore()
    const [event] = answerEvents({ itemId: 'item-001', picks: ['target'] })
    if (!event) throw new Error('fixture')
    await store.append(event)
    ;(event as { chosenWord: string }).chosenWord = 'changed'
    expect((await store.load()).events[0]?.chosenWord).toBe('target')
  })
})
