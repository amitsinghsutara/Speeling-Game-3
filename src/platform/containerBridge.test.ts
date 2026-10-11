import { describe, expect, it, vi } from 'vitest'
import { EXIT_METHOD_CANDIDATES, describeContainer, detectExitBridge } from './containerBridge.ts'

describe('detectExitBridge', () => {
  it('cannot exit in a normal browser', () => {
    expect(detectExitBridge({}).canExit).toBe(false)
    expect(detectExitBridge(undefined).canExit).toBe(false)
  })

  it('cannot exit when the container bridge has no exit method', () => {
    expect(detectExitBridge({ Android: { cachedStatus: () => {} } }).canExit).toBe(false)
    expect(detectExitBridge({ Android: { closeApp: 'not a function' } }).canExit).toBe(false)
  })

  it.each(EXIT_METHOD_CANDIDATES)('exits through Android.%s, keeping the bridge as `this`', (name) => {
    const android: Record<string, unknown> = {}
    const method = vi.fn<() => void>(function (this: unknown) {
      expect(this).toBe(android)
    })
    android[name] = method
    const bridge = detectExitBridge({ Android: android })
    expect(bridge.canExit).toBe(true)
    bridge.exit()
    expect(method).toHaveBeenCalledTimes(1)
  })

  it('describes the bridge and its methods without calling them', () => {
    const closeApp = vi.fn<() => void>()
    const report = describeContainer({ Android: { cachedStatus: () => {}, quit: () => {}, closeApp, version: '1' } })
    expect(report.bridges).toEqual([{ name: 'Android', methods: ['cachedStatus', 'closeApp', 'quit'] }])
    expect(report.exitMethod).toBe('closeApp')
    expect(closeApp).not.toHaveBeenCalled()
  })

  it('finds a bridge under another name, and reports when there is no exit method', () => {
    const report = describeContainer({ NativeApp: { shutDown: () => {} }, Math } as never)
    expect(report.bridges).toEqual([{ name: 'NativeApp', methods: ['shutDown'] }])
    expect(report.exitMethod).toBeNull()
    expect(describeContainer({}).bridges).toEqual([])
  })

  it('stays in the game if the container throws', () => {
    const bridge = detectExitBridge({
      Android: {
        closeApp: () => {
          throw new Error('refused')
        },
      },
    })
    expect(() => bridge.exit()).not.toThrow()
  })
})
