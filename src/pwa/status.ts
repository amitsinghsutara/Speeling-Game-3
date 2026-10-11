/**
 * Offline and update status, shared between the service worker registration
 * (src/pwa/register.ts) and the app. A tiny external store, so App can read it
 * with useSyncExternalStore and tests can drive it without a real service worker.
 */
export type UpdateCheckResult = 'update-ready' | 'up-to-date' | 'offline' | 'error' | 'unsupported'

export interface PwaSnapshot {
  /** Everything needed to play offline is cached. */
  offlineReady: boolean
  /** A new version is downloaded and waiting. */
  updateReady: boolean
  /** An update check is running now. */
  checking: boolean
  /** The latest finished check, if any. */
  lastCheck: { at: number; result: UpdateCheckResult } | null
}

export interface PwaStatus {
  getSnapshot(): PwaSnapshot
  subscribe(listener: () => void): () => void
  /** Switch to the waiting version (reloads the page). Only call when it cannot interrupt play. */
  applyUpdate(): void
  /** Ask the server for a new version now. */
  checkForUpdates(): Promise<UpdateCheckResult>
}

export interface PwaController extends PwaStatus {
  setOfflineReady(): void
  setUpdateReady(apply: () => void): void
  /** Installs the real check (set once the service worker is registered). */
  setChecker(check: () => Promise<UpdateCheckResult>, now: () => number): void
}

const INITIAL: PwaSnapshot = { offlineReady: false, updateReady: false, checking: false, lastCheck: null }

export function createPwaStatus(): PwaController {
  let snapshot: PwaSnapshot = INITIAL
  let apply: (() => void) | null = null
  let checker: { check: () => Promise<UpdateCheckResult>; now: () => number } | null = null
  let running: Promise<UpdateCheckResult> | null = null
  const listeners = new Set<() => void>()
  const set = (next: Partial<PwaSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    applyUpdate() {
      const run = apply
      apply = null
      run?.()
    },
    async checkForUpdates() {
      if (!checker) return 'unsupported'
      // One check at a time; a second caller shares the first.
      if (running) return running
      const { check, now } = checker
      set({ checking: true })
      running = check()
        .catch((): UpdateCheckResult => 'error')
        .then((result) => {
          // A check can find an update before the worker reports it; either way it is ready.
          set({ checking: false, lastCheck: { at: now(), result }, ...(result === 'update-ready' && apply && { updateReady: true }) })
          running = null
          return result
        })
      return running
    },
    setOfflineReady: () => set({ offlineReady: true }),
    setUpdateReady(fn) {
      apply = fn
      set({ updateReady: true })
    },
    setChecker(check, now) {
      checker = { check, now }
    },
  }
}

/** For browsers without service workers, and for tests: never offline-ready, never updates. */
export const inertPwaStatus: PwaStatus = {
  getSnapshot: () => INITIAL,
  subscribe: () => () => {},
  applyUpdate: () => {},
  checkForUpdates: async () => 'unsupported',
}
