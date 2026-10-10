import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultAudioProvider, type AudioProvider } from './audio/AudioProvider.ts'
import { loadContent } from './content/loadContent.ts'
import { hintFor } from './game/hints.ts'
import { seededRandom } from './game/random.ts'
import { createGameModel, gameReducer, initialGameState, type GameAction, type Screen } from './game/session.ts'
import { localProgressRepository, type ProgressRepository } from './persistence/progressRepository.ts'
import type { TileState } from './ui/components/Play.tsx'
import { ForestBackground } from './ui/components/decorations/ForestBackground.tsx'
import { CompleteScreen, HomeScreen, PuzzleMapScreen, QuestionScreen, WelcomeScreen, type SoundNotice } from './ui/screens/Screens.tsx'
import './ui/styles/theme.css'

export interface AppProps {
  audio?: AudioProvider
  repository?: ProgressRepository
  /** Seed for shuffles; fixed in tests, random in play. */
  seed?: number
  now?: () => number
}

/** Identifies one shown question, so a new question (even of the same word) replays its sound. */
const questionKeyOf = (screen: Screen): string | null =>
  screen.name === 'question' ? `${screen.puzzleId}#${screen.index}` : null

export function App({ audio: audioProp, repository: repositoryProp, seed, now = Date.now }: AppProps) {
  const model = useMemo(() => createGameModel(loadContent()), [])
  const audio = useMemo(() => audioProp ?? createDefaultAudioProvider(), [audioProp])
  const repository = useMemo(() => repositoryProp ?? localProgressRepository(), [repositoryProp])
  const [random] = useState(() => seededRandom(seed ?? Math.floor(Math.random() * 2 ** 32)))

  const [state, setState] = useState(() => initialGameState(repository.load()))
  // Latest state, so taps landing before a re-render still apply in order.
  const latest = useRef(state)
  const [sound, setSound] = useState<SoundNotice>('none')

  useEffect(() => repository.save(state.progress), [repository, state.progress])
  useEffect(() => () => audio.stop(), [audio])

  const speak = useCallback(
    async (screen: Screen) => {
      if (screen.name !== 'question') return
      const { itemId, target } = screen.question.question
      const outcome = await audio.play({ itemId, target })
      setSound(outcome === 'played' ? 'none' : 'unavailable')
    },
    [audio],
  )

  // Sound starts from the tap that opened a question: browsers only allow playback after a user gesture.
  const dispatch = (action: GameAction) => {
    const previous = latest.current
    const next = gameReducer(model, previous, action)
    if (next === previous) return
    latest.current = next
    setState(next)
    const key = questionKeyOf(next.screen)
    if (key === questionKeyOf(previous.screen)) return
    if (key === null) audio.stop()
    else void speak(next.screen)
  }

  const { screen } = state
  const level = (n: number) => model.content.levels.find((l) => l.level === n)

  const content = (() => {
    switch (screen.name) {
      case 'welcome':
        return <WelcomeScreen onPlay={() => dispatch({ type: 'play' })} />

      case 'home':
        return (
          <HomeScreen
            levels={model.content.levels}
            statusOf={(n) => model.levelStatus(state.progress, n)}
            starsOf={(n) => model.levelStars(state.progress, n)}
            onOpenLevel={(n) => dispatch({ type: 'openLevel', level: n })}
          />
        )

      case 'puzzles': {
        const info = level(screen.level)
        if (!info) return null
        return (
          <PuzzleMapScreen
            level={info}
            puzzles={model.puzzlesByLevel.get(screen.level) ?? []}
            statusOf={(p) => model.puzzleStatus(state.progress, p)}
            starsOf={(p) => state.progress.starsByPuzzleId[p.id]}
            onStart={(puzzleId) => dispatch({ type: 'startPuzzle', puzzleId, random, now: now() })}
            onBack={() => dispatch({ type: 'home' })}
          />
        )
      }

      case 'question': {
        const puzzle = model.findPuzzle(screen.puzzleId)
        const q = screen.question
        const lastWrong = screen.lastOutcome?.kind === 'incorrect' ? screen.lastOutcome.attempt : undefined
        const stateOf = (word: string): TileState =>
          q.status === 'correct'
            ? word === q.question.target
              ? 'correct'
              : q.disabledWords.includes(word)
                ? 'tried'
                : 'done'
            : q.disabledWords.includes(word)
              ? 'tried'
              : 'idle'
        return (
          <QuestionScreen
            level={screen.level}
            puzzleNumber={puzzle?.number ?? 1}
            index={screen.index}
            total={puzzle?.itemIds.length ?? 1}
            choices={q.question.choices}
            stateOf={stateOf}
            status={q.status}
            target={q.question.target}
            hint={hintFor(lastWrong?.foilCode)}
            sound={sound}
            onReplay={() => void speak(screen)}
            onChoose={(word) => dispatch({ type: 'answer', word, now: now() })}
            onNext={() => dispatch({ type: 'next', random, now: now() })}
            onBack={() => dispatch({ type: 'backToPuzzles' })}
          />
        )
      }

      case 'puzzleComplete':
      case 'levelComplete': {
        const puzzle = model.findPuzzle(screen.puzzleId)
        return (
          <CompleteScreen
            kind={screen.name === 'levelComplete' ? 'level' : 'puzzle'}
            level={screen.level}
            puzzleNumber={puzzle?.number ?? 1}
            stars={screen.stars}
            hasNext={model.puzzlesByLevel.has(screen.level + 1)}
            onNext={() =>
              dispatch(screen.name === 'levelComplete' ? { type: 'nextLevel' } : { type: 'nextPuzzle', random, now: now() })
            }
            onMap={() => dispatch({ type: 'backToPuzzles' })}
            onHome={() => dispatch({ type: 'home' })}
          />
        )
      }
    }
  })()

  return (
    <>
      <ForestBackground />
      {content}
    </>
  )
}
