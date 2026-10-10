/**
 * Learning events and adaptive decisions in IndexedDB (they grow over time,
 * so not localStorage).
 * Reads are validated: a corrupt or unknown-version record is skipped, never
 * fatal. If IndexedDB is unavailable (some private modes and WebViews), an
 * in-memory store keeps the session working and reports `persistent: false`.
 */
import { adaptiveDecisionSchema, type AdaptiveDecision } from '../adaptive/decision.ts'
import { learningEventSchema, type LearningEvent } from '../learner/events.ts'

export const DB_NAME = 'spelling-adventure'
/** Bump with a migration step in `upgrade` whenever stores or indexes change. */
export const DB_VERSION = 2
export const EVENTS_STORE = 'learningEvents'
export const DECISIONS_STORE = 'adaptiveDecisions'

export interface LoadResult {
  events: LearningEvent[]
  /** Records that failed validation and were left out. */
  skipped: number
}

export interface LearningEventStore {
  readonly persistent: boolean
  append(event: LearningEvent): Promise<void>
  /** All valid events, oldest first. */
  load(): Promise<LoadResult>
  appendDecision(decision: AdaptiveDecision): Promise<void>
  /** All valid decisions, oldest first. */
  loadDecisions(): Promise<AdaptiveDecision[]>
  /** Reset: removes events and decisions. */
  clear(): Promise<void>
}

function parseAll(records: readonly unknown[]): LoadResult {
  const events: LearningEvent[] = []
  let skipped = 0
  for (const record of records) {
    const parsed = learningEventSchema.safeParse(record)
    if (parsed.success) events.push(parsed.data)
    else skipped++
  }
  events.sort((a, b) => a.at - b.at || a.attemptNumber - b.attemptNumber)
  return { events, skipped }
}

function parseDecisions(records: readonly unknown[]): AdaptiveDecision[] {
  return records
    .flatMap((r) => {
      const parsed = adaptiveDecisionSchema.safeParse(r)
      return parsed.success ? [parsed.data] : []
    })
    .sort((a, b) => a.at - b.at)
}

export function memoryLearningEventStore(): LearningEventStore {
  const records: unknown[] = []
  const decisions: unknown[] = []
  return {
    persistent: false,
    async append(event) {
      records.push(structuredClone(event))
    },
    async load() {
      return parseAll(records)
    },
    async appendDecision(decision) {
      decisions.push(structuredClone(decision))
    },
    async loadDecisions() {
      return parseDecisions(decisions)
    },
    async clear() {
      records.length = 0
      decisions.length = 0
    },
  }
}

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })

function upgrade(db: IDBDatabase, oldVersion: number): void {
  // Version 0 → 1: the events store, keyed by event id, indexed by time.
  if (oldVersion < 1) {
    const store = db.createObjectStore(EVENTS_STORE, { keyPath: 'id' })
    store.createIndex('by-at', 'at')
    store.createIndex('by-item', 'itemId')
  }
  // Version 1 → 2: adaptive decisions, keyed by decision id. Existing events are untouched.
  if (oldVersion < 2) {
    const store = db.createObjectStore(DECISIONS_STORE, { keyPath: 'id' })
    store.createIndex('by-at', 'at')
  }
}

export function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'))
  })
}

export function indexedDbLearningEventStore(db: IDBDatabase): LearningEventStore {
  const store = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name)
  return {
    persistent: true,
    async append(event) {
      await promisify(store(EVENTS_STORE, 'readwrite').put(event))
    },
    async load() {
      return parseAll(await promisify(store(EVENTS_STORE, 'readonly').getAll()))
    },
    async appendDecision(decision) {
      await promisify(store(DECISIONS_STORE, 'readwrite').put(decision))
    },
    async loadDecisions() {
      return parseDecisions(await promisify(store(DECISIONS_STORE, 'readonly').getAll()))
    },
    async clear() {
      await promisify(store(EVENTS_STORE, 'readwrite').clear())
      await promisify(store(DECISIONS_STORE, 'readwrite').clear())
    },
  }
}

/** Opens IndexedDB if it works here, otherwise falls back to memory. Never rejects. */
export async function openLearningEventStore(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<LearningEventStore> {
  if (!factory) return memoryLearningEventStore()
  try {
    return indexedDbLearningEventStore(await openDatabase(factory))
  } catch {
    return memoryLearningEventStore()
  }
}
