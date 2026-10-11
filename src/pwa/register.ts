/**
 * Registers the service worker (production builds only; vite-plugin-pwa gives
 * a no-op in dev) and feeds its state into a PwaStatus. Imported only by main.tsx.
 *
 * Update mechanism:
 * - checks for a new version on load, every 30 minutes, when the app returns to
 *   the foreground, and when the device comes back online (src/pwa/updates.ts);
 * - a new version waits; the app offers it on the Welcome and level screens and
 *   never interrupts a puzzle; it also installs itself on the next launch;
 * - if a newer worker takes control while this page still runs old code (for
 *   example another tab updated), the page is marked as needing a reload;
 * - applying an update reloads the page ourselves. The plugin only reloads for
 *   updates Workbox found itself, and treats ones found by our periodic checks
 *   as "external", so relying on it left pages running old code.
 */

import { registerSW } from 'virtual:pwa-register'
import { consoleLog } from '../debug/log.ts'
import { notifyContainerCached } from '../platform/containerBridge.ts'
import { BUILD, describeBuild } from './buildInfo.ts'
import { createPwaStatus, inertPwaStatus, type PwaStatus } from './status.ts'
import { checkRegistration, scheduleUpdateChecks } from './updates.ts'

/** If the new version is already in charge, no takeover event comes: reload after this. */
export const RELOAD_FALLBACK_MS = 3000

const log = consoleLog('updates')
const isOnline = () => navigator.onLine !== false

export function startPwa(): PwaStatus {
  log(`running version ${describeBuild(BUILD)}`)
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return inertPwaStatus
  const status = createPwaStatus()

  // A worker from an earlier visit already controls the page: everything is cached.
  const hadController = !!navigator.serviceWorker.controller
  if (hadController) {
    status.setOfflineReady()
    notifyContainerCached()
  }

  let reloadingOnPurpose = false
  const reload = () => window.location.reload()
  // Ask the waiting worker to take over, then load the new code: on takeover, or after a
  // short wait if the new worker is already in charge.
  const applyNewVersion = () => {
    if (reloadingOnPurpose) return
    reloadingOnPurpose = true
    log('updating to the new version')
    void updateSW(true)
    window.setTimeout(reload, RELOAD_FALLBACK_MS)
  }
  const updateSW = registerSW({
    onOfflineReady() {
      status.setOfflineReady()
      notifyContainerCached()
    },
    onNeedRefresh() {
      log('a new version is ready')
      status.setUpdateReady(applyNewVersion)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      status.setChecker(async () => {
        const result = await checkRegistration(registration, isOnline)
        log(`update check: ${result}`)
        return result
      }, Date.now)
      scheduleUpdateChecks({ check: () => status.checkForUpdates(), now: Date.now })
    },
    onRegisterError(error) {
      log('service worker registration failed', String(error))
    },
  })

  // A newer worker took over while this page still runs the old code.
  // (On a first visit the first worker also takes control; that is not an update.)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingOnPurpose) {
      reload()
      return
    }
    if (!hadController) return
    log('a newer version took over; reload to use it')
    status.setUpdateReady(applyNewVersion)
  })

  return status
}
