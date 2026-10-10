/**
 * Registers the service worker (production builds only; vite-plugin-pwa gives
 * a no-op in dev) and feeds its state into a PwaStatus. Imported only by main.tsx.
 */
import { registerSW } from 'virtual:pwa-register'
import { notifyContainerCached } from '../platform/containerBridge.ts'
import { createPwaStatus, inertPwaStatus, type PwaStatus } from './status.ts'

export function startPwa(): PwaStatus {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return inertPwaStatus
  const status = createPwaStatus()

  // A worker from an earlier visit already controls the page: everything is cached.
  if (navigator.serviceWorker.controller) {
    status.setOfflineReady()
    notifyContainerCached()
  }

  const updateSW = registerSW({
    onOfflineReady() {
      status.setOfflineReady()
      notifyContainerCached()
    },
    onNeedRefresh() {
      status.setUpdateReady(() => void updateSW(true))
    },
  })
  return status
}
