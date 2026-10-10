import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import type { AudioProvider, PlayOutcome } from './audio/AudioProvider.ts'
import type { UiSound, UiSoundPlayer } from './audio/uiSounds.ts'
import { localPreferencesRepository } from './persistence/preferences.ts'
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

describe('App sound effects', () => {
  function fakeUiSounds() {
    const played: UiSound[] = []
    let muted = false
    const player: UiSoundPlayer = {
      get muted() {
        return muted
      },
      setMuted: (value) => {
        muted = value
      },
      play: (sound) => {
        if (!muted) played.push(sound)
      },
    }
    return { player, played }
  }

  function memoryPreferences() {
    const data = new Map<string, string>()
    return localPreferencesRepository({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) })
  }

  const renderWithSounds = () => {
    const sounds = fakeUiSounds()
    const word = fakeAudio()
    const preferences = memoryPreferences()
    const utils = render(
      <App audio={word.audio} repository={memoryRepository()} uiSounds={sounds.player} preferences={preferences} seed={1} />,
    )
    return { ...utils, sounds, word, preferences }
  }

  it('blips on menu buttons the moment they are pressed', async () => {
    const user = userEvent.setup()
    const { sounds } = renderWithSounds()
    await user.click(screen.getByRole('button', { name: 'Play!' }))
    expect(sounds.played).toEqual(['select'])
    await settle()
    await user.click(screen.getByRole('button', { name: /^Level 1,/ }))
    expect(sounds.played).toEqual(['select', 'select'])
  })

  it('answers with a gentle boop for a wrong pick and a chime for the right one, with no click over the word', async () => {
    const user = userEvent.setup()
    const { sounds, word } = renderWithSounds()
    await openFirstPuzzle(user)
    sounds.played.length = 0

    await user.click(screen.getByRole('button', { name: 'Hear the word again' }))
    const wrong = tiles().find((t) => t.textContent !== word.lastWord())
    if (!wrong) throw new Error('no foil tile')
    await user.click(wrong)
    await user.click(screen.getByRole('button', { name: word.lastWord() }))
    expect(sounds.played).toEqual(['tryAgain', 'correct'])
  })

  it('plays a fanfare when a puzzle is finished', async () => {
    const user = userEvent.setup()
    const { sounds, word } = renderWithSounds()
    await openFirstPuzzle(user)
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: word.lastWord() }))
      await tap(user, screen.getByRole('button', { name: /next/i }))
    }
    expect(sounds.played.at(-1)).toBe('celebrate')
  })

  it('can turn sound effects off, remembers it, and still speaks the word', async () => {
    const user = userEvent.setup()
    const sounds = fakeUiSounds()
    const word = fakeAudio()
    const preferences = memoryPreferences()
    const { unmount } = render(
      <App audio={word.audio} repository={memoryRepository()} uiSounds={sounds.player} preferences={preferences} seed={1} />,
    )
    const toggle = screen.getByRole('button', { name: 'Sound effects' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(preferences.load().soundEffects).toBe(false)

    unmount()
    sounds.played.length = 0
    render(<App audio={word.audio} repository={memoryRepository()} uiSounds={sounds.player} preferences={preferences} seed={1} />)
    expect(screen.getByRole('button', { name: 'Sound effects' })).toHaveAttribute('aria-pressed', 'false')
    await openFirstPuzzle(user)
    expect(sounds.played).toEqual([])
    expect(word.played).toEqual(['sat'])
  })
})

describe('App exit button', () => {
  const exitBridge = () => {
    const exit = vi.fn<() => void>()
    return { bridge: { canExit: true, exit }, exit }
  }

  it('is hidden in a normal browser', () => {
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} seed={1} />)
    expect(screen.queryByRole('button', { name: 'Leave the game' })).not.toBeInTheDocument()
  })

  it('shows on the welcome and level screens but not during a puzzle', async () => {
    const user = userEvent.setup()
    const { bridge } = exitBridge()
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} exitBridge={bridge} seed={1} />)
    expect(screen.getByRole('button', { name: 'Leave the game' })).toBeInTheDocument()
    await tap(user, screen.getByRole('button', { name: 'Play!' }))
    expect(screen.getByRole('button', { name: 'Leave the game' })).toBeInTheDocument()
    await tap(user, screen.getByRole('button', { name: /^Level 1,/ }))
    expect(screen.queryByRole('button', { name: 'Leave the game' })).not.toBeInTheDocument()
  })

  it('asks first, and "Keep playing" stays in the game', async () => {
    const user = userEvent.setup()
    const { bridge, exit } = exitBridge()
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} exitBridge={bridge} seed={1} />)
    await user.click(screen.getByRole('button', { name: 'Leave the game' }))
    const dialog = screen.getByRole('dialog', { name: 'Leave the forest?' })
    expect(within(dialog).getByRole('button', { name: 'Keep playing' })).toHaveFocus()
    await tap(user, within(dialog).getByRole('button', { name: 'Keep playing' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(exit).not.toHaveBeenCalled()
  })

  it('closes with Escape, and exits through the container on "Yes, leave"', async () => {
    const user = userEvent.setup()
    const { bridge, exit } = exitBridge()
    const word = fakeAudio()
    render(<App audio={word.audio} repository={memoryRepository()} exitBridge={bridge} seed={1} />)
    await user.click(screen.getByRole('button', { name: 'Leave the game' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Leave the game' }))
    await tap(user, screen.getByRole('button', { name: 'Yes, leave' }))
    expect(exit).toHaveBeenCalledTimes(1)
    expect(word.audio.stop).toHaveBeenCalled()
  })
})
