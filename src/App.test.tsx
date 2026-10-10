import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import type { AudioProvider, PlayOutcome } from './audio/AudioProvider.ts'
import { localProgressRepository } from './persistence/progressRepository.ts'
import { PRESS_ACTION_DELAY_MS } from './ui/press.ts'

function fakeAudio(outcome: PlayOutcome = 'played') {
  const played: string[] = []
  const audio: AudioProvider = {
    name: 'fake',
    play: vi.fn<AudioProvider['play']>(async ({ target }) => {
      played.push(target)
      return outcome
    }),
    stop: vi.fn<() => void>(),
  }
  return { audio, played, lastWord: () => played.at(-1) ?? '' }
}

function memoryRepository() {
  const data = new Map<string, string>()
  return localProgressRepository({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  })
}

/** Screen-changing buttons act after a short press delay; wait it out. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, PRESS_ACTION_DELAY_MS + 20)))

const tiles = () => within(screen.getByRole('group', { name: /choose the spelling/i })).getAllByRole('button')

async function tap(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  await user.click(element)
  await settle()
}

async function openFirstPuzzle(user: ReturnType<typeof userEvent.setup>) {
  await tap(user, screen.getByRole('button', { name: 'Play!' }))
  await tap(user, screen.getByRole('button', { name: /^Level 1,/ }))
  await tap(user, screen.getByRole('button', { name: /^Puzzle 1, 5 words, start/ }))
}

describe('App', () => {
  it('locks every level but the first at the start', async () => {
    const user = userEvent.setup()
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} seed={1} />)
    await tap(user, screen.getByRole('button', { name: 'Play!' }))
    expect(screen.getByRole('button', { name: /^Level 1,/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Level 2, .*locked/ })).toBeDisabled()
  })

  it('speaks the word when a question opens and again on replay', async () => {
    const user = userEvent.setup()
    const { audio, played } = fakeAudio()
    render(<App audio={audio} repository={memoryRepository()} seed={1} />)
    await openFirstPuzzle(user)
    expect(played).toEqual(['sat'])
    await user.click(screen.getByRole('button', { name: 'Hear the word again' }))
    expect(played).toEqual(['sat', 'sat'])
  })

  it('shows four tiles, a gentle hint after a wrong pick, and celebrates the right one', async () => {
    const user = userEvent.setup()
    const { audio, lastWord } = fakeAudio()
    render(<App audio={audio} repository={memoryRepository()} seed={1} />)
    await openFirstPuzzle(user)
    expect(tiles()).toHaveLength(4)

    const wrong = tiles().find((t) => t.textContent !== lastWord())
    if (!wrong) throw new Error('no foil tile')
    await user.click(wrong)
    expect(screen.getByRole('status')).toHaveTextContent(/good try!/i)
    expect(wrong).toHaveAccessibleName(/not this one/)
    expect(wrong).toHaveAttribute('aria-disabled', 'true')

    await user.click(screen.getByRole('button', { name: lastWord() }))
    expect(screen.getByRole('status')).toHaveTextContent(`Yes! You found ${lastWord()}!`)
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('finishes a puzzle, shows stars, and remembers progress after a reload', async () => {
    const user = userEvent.setup()
    const repository = memoryRepository()
    const { audio, lastWord } = fakeAudio()
    const { unmount } = render(<App audio={audio} repository={repository} seed={1} />)
    await openFirstPuzzle(user)
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: lastWord() }))
      await tap(user, screen.getByRole('button', { name: /next/i }))
    }
    expect(screen.getByRole('heading', { name: 'Puzzle 1 done!' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '3 of 3 stars' })).toBeInTheDocument()

    unmount()
    render(<App audio={audio} repository={repository} seed={2} />)
    await tap(user, screen.getByRole('button', { name: 'Play!' }))
    await tap(user, screen.getByRole('button', { name: /^Level 1,/ }))
    expect(screen.getByRole('button', { name: /^Puzzle 1, .*finished with 3 stars/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Puzzle 2, 5 words, start/ })).toBeEnabled()
  })

  it('keeps the question playable when sound is unavailable', async () => {
    const user = userEvent.setup()
    render(<App audio={fakeAudio('unavailable').audio} repository={memoryRepository()} seed={1} />)
    await openFirstPuzzle(user)
    expect(await screen.findByRole('status')).toHaveTextContent(/can't play the sound/i)
    expect(tiles().every((t) => t.getAttribute('aria-disabled') === 'false')).toBe(true)
  })
})
