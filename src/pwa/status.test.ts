import { describe, expect, it, vi } from 'vitest'
import { notifyContainerCached } from '../platform/containerBridge.ts'
import { createPwaStatus, inertPwaStatus } from './status.ts'

describe('PWA status', () => {
  it('starts not ready, then reports offline readiness and waiting updates to subscribers', () => {
    const status = createPwaStatus()
    const listener = vi.fn<() => void>()
    status.subscribe(listener)
    expect(status.getSnapshot()).toEqual({ offlineReady: false, updateReady: false })
    status.setOfflineReady()
    status.setUpdateReady(() => {})
    expect(status.getSnapshot()).toEqual({ offlineReady: true, updateReady: true })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('applies a waiting update once', () => {
    const status = createPwaStatus()
    const apply = vi.fn<() => void>()
    status.setUpdateReady(apply)
    status.applyUpdate()
    status.applyUpdate()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('keeps a stable snapshot between changes (required by useSyncExternalStore)', () => {
    const status = createPwaStatus()
    expect(status.getSnapshot()).toBe(status.getSnapshot())
    expect(inertPwaStatus.getSnapshot()).toBe(inertPwaStatus.getSnapshot())
  })

  it('unsubscribes', () => {
    const status = createPwaStatus()
    const listener = vi.fn<() => void>()
    status.subscribe(listener)()
    status.setOfflineReady()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('notifyContainerCached', () => {
  it('tells the container the game is cached, keeping the bridge as `this`', () => {
    const android: Record<string, unknown> = {}
    const cachedStatus = vi.fn<(cached: boolean) => void>(function (this: unknown) {
      expect(this).toBe(android)
    })
    android['cachedStatus'] = cachedStatus
    notifyContainerCached({ Android: android })
    expect(cachedStatus).toHaveBeenCalledWith(true)
  })

  it('does nothing in a normal browser and never throws', () => {
    expect(() => notifyContainerCached({})).not.toThrow()
    expect(() =>
      notifyContainerCached({
        Android: {
          cachedStatus: () => {
            throw new Error('nope')
          },
        },
      }),
    ).not.toThrow()
  })
})
