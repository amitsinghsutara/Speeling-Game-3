/**
 * Offline/update status shared between the service worker registration
 * (src/pwa/register.ts) and the app. A tiny external store, so App can read it
 * with useSyncExternalStore and tests can drive it without a real service worker.
 */
export interface PwaSnapshot {
  /** Everything needed to play offline is cached. */
  offlineReady: boolean
  /** A new version is downloaded and waiting. */
  updateReady: boolean
}

export interface PwaStatus {
  getSnapshot(): PwaSnapshot
  subscribe(listener: () => void): () => void
  /** Switch to the waiting version (reloads the page). Only call when it cannot interrupt play. */
  applyUpdate(): void
}

export interface PwaController extends PwaStatus {
  setOfflineReady(): void
  setUpdateReady(apply: () => void): void
}

export function createPwaStatus(): PwaController {
  let snapshot: PwaSnapshot = { offlineReady: false, updateReady: false }
  let apply: (() => void) | null = null
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
    setOfflineReady: () => set({ offlineReady: true }),
    setUpdateReady(fn) {
      apply = fn
      set({ updateReady: true })
    },
  }
}

/** For browsers without service workers, and for tests: never offline-ready, never updates. */
export const inertPwaStatus: PwaStatus = {
  getSnapshot: () => INERT_SNAPSHOT,
  subscribe: () => () => {},
  applyUpdate: () => {},
}
const INERT_SNAPSHOT: PwaSnapshot = { offlineReady: false, updateReady: false }
