import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import type { AudioProvider, PlayOutcome } from './audio/AudioProvider.ts'
import type { UiSound, UiSoundPlayer } from './audio/uiSounds.ts'
import type { AdviceOutcome, AdviserClient } from './adviser/client.ts'
import type { InsightsClient } from './insights/client.ts'
import type { AdviceRequest } from './adviser/schema.ts'
import { memoryLearningEventStore } from './persistence/learningEventStore.ts'
import { localPreferencesRepository } from './persistence/preferences.ts'
import { createPwaStatus } from './pwa/status.ts'
import { localProgressRepository } from './persistence/progressRepository.ts'
import { HOLD_MS } from './ui/components/HoldButton.tsx'
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

describe('App learning events', () => {
  it('records every attempt with the facts the learner model needs', async () => {
    const user = userEvent.setup()
    const eventStore = memoryLearningEventStore()
    const word = fakeAudio()
    let clock = 50_000
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={eventStore} seed={1} now={() => (clock += 700)} />)
    await openFirstPuzzle(user)

    const wrong = tiles().find((t) => t.textContent !== word.lastWord())
    if (!wrong) throw new Error('no foil tile')
    const wrongWord = wrong.textContent
    await user.click(wrong)
    await user.click(wrong) // a repeat tap on a disabled tile is not an attempt
    await user.click(screen.getByRole('button', { name: word.lastWord() }))

    const { events } = await eventStore.load()
    expect(events).toHaveLength(2)
    const [first, second] = events
    expect(first).toMatchObject({
      itemId: 'item-001',
      skillId: 'level-1',
      level: 1,
      puzzleId: 'level-1/puzzle-1',
      chosenWord: wrongWord,
      correct: false,
      attemptNumber: 1,
      learnerId: 'local-learner',
    })
    expect(first?.chosenFoilCode).toMatch(/^(V|FC|IC)$/)
    expect([...(first?.presentedFoilCodes ?? [])].sort()).toEqual(['FC', 'IC', 'V'])
    expect(first?.elapsedMs).toBeGreaterThan(0)
    expect(second).toMatchObject({ correct: true, chosenFoilCode: null, attemptNumber: 2, questionId: first?.questionId })
    expect(first?.contentVersion).toMatch(/^[0-9a-f]{64}$/)
    // Each attempt points at the adaptive decision that chose the question, and it was saved too.
    expect(first?.decisionId).toBe(first?.questionId)
    const decisions = await eventStore.loadDecisions()
    expect(decisions.map((d) => d.id)).toContain(first?.decisionId)
    expect(decisions[0]).toMatchObject({ strategy: 'CONTINUE_SEQUENCE', itemId: 'item-001', provisional: true })
  })

  it('keeps playing when storage fails', async () => {
    const user = userEvent.setup()
    const broken = {
      persistent: true,
      append: () => Promise.reject(new Error('quota')),
      load: async () => ({ events: [], skipped: 0 }),
      appendDecision: () => Promise.reject(new Error('quota')),
      loadDecisions: async () => [],
      clear: async () => {},
    }
    const word = fakeAudio()
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={broken} seed={1} />)
    await openFirstPuzzle(user)
    await user.click(screen.getByRole('button', { name: word.lastWord() }))
    expect(screen.getByRole('status')).toHaveTextContent(/yes!/i)
  })
})

describe('App updates', () => {
  it('waits until the child is off a puzzle before switching to a new version', async () => {
    const user = userEvent.setup()
    const pwa = createPwaStatus()
    const apply = vi.fn<() => void>()
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} pwa={pwa} seed={1} />)
    await openFirstPuzzle(user)

    act(() => pwa.setUpdateReady(apply))
    expect(apply).not.toHaveBeenCalled() // mid-puzzle: never interrupt

    await tap(user, screen.getByRole('button', { name: 'Back to the puzzle map' }))
    expect(apply).not.toHaveBeenCalled() // the puzzle map is still part of play
    await tap(user, screen.getByRole('button', { name: 'Back to levels' }))
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('applies a waiting update straight away on the Welcome screen', () => {
    const pwa = createPwaStatus()
    const apply = vi.fn<() => void>()
    pwa.setUpdateReady(apply)
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} pwa={pwa} seed={1} />)
    expect(apply).toHaveBeenCalledTimes(1)
  })
})

describe('App adviser', () => {
  it('asks in the background on the puzzle map, and play never waits for it', async () => {
    const user = userEvent.setup()
    let resolveAdvice: (outcome: AdviceOutcome) => void = () => {}
    const requests: AdviceRequest[] = []
    const adviser: AdviserClient = {
      enabled: true,
      request: (body) => {
        requests.push(body)
        return new Promise((resolve) => (resolveAdvice = resolve))
      },
    }
    const eventStore = memoryLearningEventStore()
    const word = fakeAudio()
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={eventStore} adviser={adviser} seed={1} />)
    await openFirstPuzzle(user)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.currentLevel).toBe(1)
    // The adviser has not answered, yet the first question is already on screen.
    expect(tiles()).toHaveLength(4)
    resolveAdvice({ kind: 'none', reason: 'timeout' })

    const decisions = await eventStore.loadDecisions()
    expect(decisions[0]?.adviser).toEqual({ status: 'ADVISER_UNAVAILABLE' })
  })

  it('makes no request when the adviser is disabled (the default)', async () => {
    const user = userEvent.setup()
    const request = vi.fn<AdviserClient['request']>()
    render(<App audio={fakeAudio().audio} repository={memoryRepository()} adviser={{ enabled: false, request }} seed={1} />)
    await openFirstPuzzle(user)
    expect(request).not.toHaveBeenCalled()
  })
})

describe('App grown-ups screen', () => {
  async function openGrownUps() {
    const hold = screen.getByRole('button', { name: /For grown-ups: press and hold/ })
    fireEvent.pointerDown(hold, { button: 0 })
    await act(() => new Promise<void>((r) => setTimeout(r, HOLD_MS + 50)))
    fireEvent.pointerUp(hold)
  }

  it('opens only by press-and-hold, and reports progress in plain language', async () => {
    const user = userEvent.setup()
    const word = fakeAudio()
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={memoryLearningEventStore()} seed={1} />)
    await openFirstPuzzle(user)
    await user.click(screen.getByRole('button', { name: word.lastWord() }))
    await tap(user, screen.getByRole('button', { name: 'Back to the puzzle map' }))
    await tap(user, screen.getByRole('button', { name: 'Back to levels' }))

    await user.click(screen.getByRole('button', { name: /For grown-ups: press and hold/ }))
    expect(screen.queryByRole('heading', { name: 'For grown-ups' })).not.toBeInTheDocument()

    await openGrownUps()
    expect(screen.getByRole('heading', { name: 'For grown-ups' })).toBeInTheDocument()
    expect(screen.getByText('Questions answered').nextElementSibling).toHaveTextContent('1')
    expect(screen.getByText(/Just getting started/)).toBeInTheDocument()
    expect(screen.queryByText(/master/i)).not.toBeInTheDocument()
  })

  it('resets everything only after confirming', async () => {
    const user = userEvent.setup()
    const repository = memoryRepository()
    const eventStore = memoryLearningEventStore()
    const word = fakeAudio()
    render(<App audio={word.audio} repository={repository} eventStore={eventStore} seed={1} />)
    await openFirstPuzzle(user)
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole('button', { name: word.lastWord() }))
      await tap(user, screen.getByRole('button', { name: /next/i }))
    }
    await tap(user, screen.getByRole('button', { name: 'Map' }))
    await tap(user, screen.getByRole('button', { name: 'Back to levels' }))
    expect(repository.load().completedPuzzleIds).toEqual(['level-1/puzzle-1'])

    await openGrownUps()
    await tap(user, screen.getByRole('button', { name: 'Reset progress' }))
    await tap(user, screen.getByRole('button', { name: 'Keep progress' }))
    expect(repository.load().completedPuzzleIds).toEqual(['level-1/puzzle-1'])

    await tap(user, screen.getByRole('button', { name: 'Reset progress' }))
    await tap(user, screen.getByRole('button', { name: 'Yes, reset' }))
    expect(screen.getByRole('heading', { name: 'Pick a level' })).toBeInTheDocument()
    expect(repository.load().completedPuzzleIds).toEqual([])
    expect((await eventStore.load()).events).toEqual([])
    expect(await eventStore.loadDecisions()).toEqual([])
  }, 15_000)
})

describe('App grown-ups suggestions (AI first, local fallback)', () => {
  const aiInsights = {
    summary: 'AI summary: practice is going steadily.',
    strengths: [],
    focusAreas: [],
    homeActivities: [{ title: 'Word hunt', description: 'Find the word.', words: ['sat'] }],
    removed: [],
  }

  async function openGrownUpsAfterOneAnswer(insights: InsightsClient) {
    const user = userEvent.setup()
    const word = fakeAudio()
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={memoryLearningEventStore()} insights={insights} seed={1} />)
    await openFirstPuzzle(user)
    await user.click(screen.getByRole('button', { name: word.lastWord() }))
    await tap(user, screen.getByRole('button', { name: 'Back to the puzzle map' }))
    await tap(user, screen.getByRole('button', { name: 'Back to levels' }))
    const hold = screen.getByRole('button', { name: /For grown-ups: press and hold/ })
    fireEvent.pointerDown(hold, { button: 0 })
    await act(() => new Promise<void>((r) => setTimeout(r, HOLD_MS + 50)))
    fireEvent.pointerUp(hold)
    return user
  }

  it('shows AI suggestions first when they are available, asking exactly once', async () => {
    const request = vi.fn<InsightsClient['request']>(async () => ({ kind: 'insights' as const, insights: aiInsights }))
    await openGrownUpsAfterOneAnswer({ enabled: true, request })
    expect(await screen.findByText('AI summary: practice is going steadily.')).toBeInTheDocument()
    expect(screen.getByText(/AI-generated suggestions: they may not be right/)).toBeInTheDocument()
    await act(() => new Promise<void>((r) => setTimeout(r, 50)))
    expect(request).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('falls back to the game’s own rules, saying why, when AI is unavailable', async () => {
    const request = vi.fn<InsightsClient['request']>(async () => ({ kind: 'none' as const, reason: 'timeout' as const }))
    await openGrownUpsAfterOneAnswer({ enabled: true, request })
    expect(await screen.findByText(/From the game.s own rules on this device\. AI suggestions aren.t shown because the AI took too long/)).toBeInTheDocument()
    expect(screen.getByText(/1 question answered so far/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try AI suggestions again' })).toBeInTheDocument()
  }, 15_000)

  it('uses the game’s own rules without any request when AI is switched off', async () => {
    const request = vi.fn<InsightsClient['request']>()
    await openGrownUpsAfterOneAnswer({ enabled: false, request })
    expect(screen.getByText(/^From the game.s own rules on this device.$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AI suggestions/ })).not.toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  }, 15_000)
})

describe('App grown-ups suggestions refresh', () => {
  it('keeps a good AI answer on screen when a refresh fails', async () => {
    const user = userEvent.setup()
    const word = fakeAudio()
    const request = vi
      .fn<InsightsClient['request']>()
      .mockResolvedValueOnce({ kind: 'insights', insights: { summary: 'First AI answer.', strengths: [], focusAreas: [], homeActivities: [], removed: [] } })
      .mockResolvedValueOnce({ kind: 'none', reason: 'too-soon' })
    render(<App audio={word.audio} repository={memoryRepository()} eventStore={memoryLearningEventStore()} insights={{ enabled: true, request }} seed={1} />)
    await openFirstPuzzle(user)
    await user.click(screen.getByRole('button', { name: word.lastWord() }))
    await tap(user, screen.getByRole('button', { name: 'Back to the puzzle map' }))
    await tap(user, screen.getByRole('button', { name: 'Back to levels' }))
    const hold = screen.getByRole('button', { name: /For grown-ups: press and hold/ })
    fireEvent.pointerDown(hold, { button: 0 })
    await act(() => new Promise<void>((r) => setTimeout(r, HOLD_MS + 50)))
    fireEvent.pointerUp(hold)
    expect(await screen.findByText('First AI answer.')).toBeInTheDocument()
    await tap(user, screen.getByRole('button', { name: 'Refresh suggestions' }))
    expect(await screen.findByText('First AI answer.')).toBeInTheDocument()
    expect(screen.queryByText(/From the game.s own rules/)).not.toBeInTheDocument()
  }, 15_000)
})
