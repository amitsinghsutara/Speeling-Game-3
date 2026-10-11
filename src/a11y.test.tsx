/**
 * Automated accessibility checks (axe-core) on every screen. Colour contrast
 * cannot be measured in jsdom (no layout), so it is checked separately in
 * scripts/contrast.test.ts.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { App } from './App.tsx'
import type { AudioProvider } from './audio/AudioProvider.ts'
import { localProgressRepository } from './persistence/progressRepository.ts'
import { createPwaStatus } from './pwa/status.ts'
import { HOLD_MS } from './ui/components/HoldButton.tsx'
import { PRESS_ACTION_DELAY_MS } from './ui/press.ts'

const audio: AudioProvider = { name: 'silent', play: async () => 'played', stop: () => {} }
const memoryRepository = () => {
  const data = new Map<string, string>()
  return localProgressRepository({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  })
}

async function violations(): Promise<string[]> {
  const results = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, PRESS_ACTION_DELAY_MS + 20)))

describe('accessibility (axe)', () => {
  it('has no violations on any screen of a full puzzle, or in the exit dialog', async () => {
    const user = userEvent.setup()
    const exitBridge = { canExit: true, exit: () => {} }
    render(<App audio={audio} repository={memoryRepository()} exitBridge={exitBridge} seed={1} />)
    const tap = async (name: RegExp | string) => {
      await user.click(screen.getByRole('button', { name }))
      await settle()
    }

    expect(await violations(), 'welcome').toEqual([])
    await user.click(screen.getByRole('button', { name: 'Leave the game' }))
    expect(await violations(), 'exit dialog').toEqual([])
    await tap('Keep playing')

    await tap('Play!')
    expect(await violations(), 'levels').toEqual([])
    await tap(/^Level 1,/)
    expect(await violations(), 'puzzle map').toEqual([])
    await tap(/^Puzzle 1, 5 words, start/)
    expect(await violations(), 'question').toEqual([])

    const target = 'sat'
    const wrong = screen.getAllByRole('button').find((b) => ['sit', 'sap', 'hat'].includes(b.textContent ?? ''))
    if (!wrong) throw new Error('no foil')
    await user.click(wrong)
    expect(await violations(), 'after a wrong answer').toEqual([])
    await user.click(screen.getByRole('button', { name: target }))
    expect(await violations(), 'after the right answer').toEqual([])
  })

  it('has no violations on the grown-ups screen or its reset dialog', async () => {
    const user = userEvent.setup()
    render(<App audio={audio} repository={memoryRepository()} seed={1} />)
    await user.click(screen.getByRole('button', { name: 'Play!' }))
    await settle()
    const hold = screen.getByRole('button', { name: /For grown-ups: press and hold/ })
    fireEvent.pointerDown(hold, { button: 0 })
    await act(() => new Promise<void>((r) => setTimeout(r, HOLD_MS + 50)))
    expect(screen.getByRole('heading', { level: 1, name: 'For grown-ups' })).toBeInTheDocument()
    expect(await violations(), 'grown-ups').toEqual([])
    await user.click(screen.getByRole('button', { name: 'Reset progress' }))
    await settle()
    expect(await violations(), 'reset dialog').toEqual([])
  })

  it('has no violations with the update banner showing', async () => {
    const pwa = createPwaStatus()
    pwa.setUpdateReady(() => {})
    render(<App audio={audio} repository={memoryRepository()} pwa={pwa} seed={1} />)
    expect(screen.getByRole('heading', { name: 'A new version is ready!' })).toBeInTheDocument()
    expect(await violations(), 'update banner').toEqual([])
  })

  it('gives the page one main region and a top-level heading on every menu screen', async () => {
    const user = userEvent.setup()
    render(<App audio={audio} repository={memoryRepository()} seed={1} />)
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Spelling Adventure')
    await user.click(screen.getByRole('button', { name: 'Play!' }))
    await settle()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pick a level')
  })
})
