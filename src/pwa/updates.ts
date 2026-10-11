/**
 * Keeping long-running apps up to date. A service worker normally checks for a
 * new version only when the page loads; the container app may stay open for
 * days, so we also check on a timer, when the app returns to the foreground,
 * and when the device comes back online.
 */
import type { UpdateCheckResult } from './status.ts'

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
/** Do not re-check more often than this, whatever triggers it. */
export const MIN_CHECK_GAP_MS = 60 * 1000
/** How long to wait for a newly found version to finish downloading. */
export const INSTALL_WAIT_MS = 20 * 1000

/** The parts of ServiceWorkerRegistration we use (easy to fake in tests). */
export interface RegistrationLike {
  update(): Promise<unknown>
  readonly installing: { state: string; addEventListener(type: 'statechange', fn: () => void): void } | null
  readonly waiting: unknown
}

/** Asks the server for a new service worker and waits briefly for it to install. */
export async function checkRegistration(
  registration: RegistrationLike,
  isOnline: () => boolean,
  installWaitMs = INSTALL_WAIT_MS,
): Promise<UpdateCheckResult> {
  if (!isOnline()) return 'offline'
  try {
    await registration.update()
  } catch {
    return isOnline() ? 'error' : 'offline'
  }
  const installing = registration.installing
  if (installing && installing.state !== 'installed') {
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      const timer = setTimeout(done, installWaitMs)
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' || installing.state === 'redundant' || installing.state === 'activated') {
          clearTimeout(timer)
          done()
        }
      })
    })
  }
  return registration.waiting ? 'update-ready' : 'up-to-date'
}

export interface ScheduleOptions {
  check: () => Promise<unknown>
  now: () => number
  intervalMs?: number
  minGapMs?: number
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
}

/** Starts periodic and event-driven checks; returns a function that stops them. */
export function scheduleUpdateChecks({
  check,
  now,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  minGapMs = MIN_CHECK_GAP_MS,
  doc = document,
  win = window,
}: ScheduleOptions): () => void {
  let lastAt = now()
  const maybeCheck = () => {
    if (now() - lastAt < minGapMs) return
    lastAt = now()
    void check()
  }
  const onVisible = () => {
    if (doc.visibilityState === 'visible') maybeCheck()
  }
  const timer = win.setInterval(maybeCheck, intervalMs)
  doc.addEventListener('visibilitychange', onVisible)
  win.addEventListener('online', maybeCheck)
  return () => {
    win.clearInterval(timer)
    doc.removeEventListener('visibilitychange', onVisible)
    win.removeEventListener('online', maybeCheck)
  }
}
