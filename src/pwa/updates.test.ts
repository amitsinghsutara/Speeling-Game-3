import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPwaStatus } from './status.ts'
import { checkRegistration, scheduleUpdateChecks, type RegistrationLike } from './updates.ts'

type Listener = () => void

function fakeInstalling(state = 'installing') {
  const listeners: Listener[] = []
  const worker = {
    state,
    addEventListener: (_: 'statechange', fn: Listener) => listeners.push(fn),
    finish(next: string) {
      worker.state = next
      for (const l of listeners) l()
    },
  }
  return worker
}

describe('checkRegistration', () => {
  it('reports offline without asking the server', async () => {
    const update = vi.fn<() => Promise<unknown>>()
    expect(await checkRegistration({ update, installing: null, waiting: null }, () => false)).toBe('offline')
    expect(update).not.toHaveBeenCalled()
  })

  it('reports up to date when no new worker appears', async () => {
    expect(await checkRegistration({ update: async () => {}, installing: null, waiting: null }, () => true)).toBe('up-to-date')
  })

  it('waits for a new version to finish downloading, then reports it ready', async () => {
    const installing = fakeInstalling()
    const reg: { -readonly [K in keyof RegistrationLike]: RegistrationLike[K] } = { update: async () => {}, installing, waiting: null }
    const result = checkRegistration(reg, () => true)
    await Promise.resolve()
    reg.waiting = {}
    installing.finish('installed')
    expect(await result).toBe('update-ready')
  })

  it('reports an error (or offline) when the check itself fails', async () => {
    const failing = { update: () => Promise.reject(new Error('network')), installing: null, waiting: null }
    expect(await checkRegistration(failing, () => true)).toBe('error')
    let online = true
    const dropping = { update: () => ((online = false), Promise.reject(new Error('network'))), installing: null, waiting: null }
    expect(await checkRegistration(dropping, () => online)).toBe('offline')
  })
})

describe('scheduleUpdateChecks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (visibility: DocumentVisibilityState = 'visible') => {
    const check = vi.fn<() => Promise<unknown>>(async () => 'up-to-date')
    const doc = Object.assign(new EventTarget(), { visibilityState: visibility }) as unknown as Document
    const win = Object.assign(new EventTarget(), {
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (id: number) => clearInterval(id),
    }) as unknown as Window
    let clock = 0
    const stop = scheduleUpdateChecks({ check, now: () => clock, intervalMs: 1000, minGapMs: 100, doc, win })
    return { check, doc, win, stop, advance: (ms: number) => ((clock += ms), vi.advanceTimersByTime(ms)) }
  }

  it('checks on a timer', () => {
    const { check, advance } = setup()
    advance(1000)
    advance(1000)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('checks when the app comes back to the foreground or online, but not too often', () => {
    const { check, doc, win, advance } = setup()
    advance(200)
    doc.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('online')) // too soon after the last check
    expect(check).toHaveBeenCalledTimes(1)
    advance(200)
    win.dispatchEvent(new Event('online'))
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('stops cleanly', () => {
    const { check, doc, stop, advance } = setup()
    stop()
    advance(5000)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(check).not.toHaveBeenCalled()
  })
})

describe('PWA status update checks', () => {
  it('is unsupported until a real checker is installed', async () => {
    expect(await createPwaStatus().checkForUpdates()).toBe('unsupported')
  })

  it('shares a running check, records the result, and marks an update ready', async () => {
    const status = createPwaStatus()
    let finish: (r: 'update-ready') => void = () => {}
    const check = vi.fn<() => Promise<'update-ready'>>(() => new Promise((r) => (finish = r)))
    status.setChecker(check, () => 42)
    status.setUpdateReady(() => {})
    const a = status.checkForUpdates()
    const b = status.checkForUpdates()
    expect(status.getSnapshot().checking).toBe(true)
    finish('update-ready')
    expect(await a).toBe('update-ready')
    expect(await b).toBe('update-ready')
    expect(check).toHaveBeenCalledTimes(1)
    expect(status.getSnapshot()).toMatchObject({ checking: false, updateReady: true, lastCheck: { at: 42, result: 'update-ready' } })
  })

  it('turns a failed check into "error" instead of throwing', async () => {
    const status = createPwaStatus()
    status.setChecker(() => Promise.reject(new Error('boom')), () => 1)
    expect(await status.checkForUpdates()).toBe('error')
    expect(status.getSnapshot().lastCheck?.result).toBe('error')
  })
})
