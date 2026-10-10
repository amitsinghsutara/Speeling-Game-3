import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultAudioProvider, type AudioProvider } from './audio/AudioProvider.ts'
import { isUiSound, webAudioUiSounds, type UiSound, type UiSoundPlayer } from './audio/uiSounds.ts'
import { loadContent } from './content/loadContent.ts'
import { hintFor } from './game/hints.ts'
import { createLearningEvent, newId } from './learner/events.ts'
import { seededRandom } from './game/random.ts'
import { createGameModel, gameReducer, initialGameState, type GameAction, type Screen } from './game/session.ts'
import { openLearningEventStore, type LearningEventStore } from './persistence/learningEventStore.ts'
import { localPreferencesRepository, type PreferencesRepository } from './persistence/preferences.ts'
import { detectExitBridge, type ExitBridge } from './platform/containerBridge.ts'
import { ExitDialog } from './ui/components/ExitDialog.tsx'
import { localProgressRepository, type ProgressRepository } from './persistence/progressRepository.ts'
import type { TileState } from './ui/components/Play.tsx'
import { ForestBackground } from './ui/components/decorations/ForestBackground.tsx'
import { installPressFeedback } from './ui/press.ts'
import { CompleteScreen, HomeScreen, PuzzleMapScreen, QuestionScreen, WelcomeScreen, type SoundNotice } from './ui/screens/Screens.tsx'
import './ui/styles/theme.css'

export interface AppProps {
  audio?: AudioProvider
  repository?: ProgressRepository
  uiSounds?: UiSoundPlayer
  preferences?: PreferencesRepository
  /** The container app's exit hook; detected from window.Android by default. */
  exitBridge?: ExitBridge
  /** Where learning events go; IndexedDB by default. */
  eventStore?: LearningEventStore
  /** Seed for shuffles; fixed in tests, random in play. */
  seed?: number
  now?: () => number
}

/** The sound effect for what just happened in the game, if any. */
function outcomeSound(action: GameAction, previous: Screen, next: Screen): UiSound | null {
  if (action.type === 'answer' && next.name === 'question') {
    const outcome = next.lastOutcome?.kind
    return outcome === 'correct' ? 'correct' : outcome === 'incorrect' ? 'tryAgain' : null
  }
  const finished = (s: Screen) => s.name === 'puzzleComplete' || s.name === 'levelComplete'
  return finished(next) && !finished(previous) ? 'celebrate' : null
}

/** Records one attempt as a learning event, if the action produced one. Never blocks play. */
function recordAttempt(
  model: ReturnType<typeof createGameModel>,
  store: Promise<LearningEventStore>,
  sessionId: string,
  action: GameAction,
  next: Screen,
): void {
  if (action.type !== 'answer' || next.name !== 'question' || next.lastOutcome?.kind === 'ignored' || !next.lastOutcome) return
  const { attempt } = next.lastOutcome
  const { question, shownAt } = next.question
  const item = model.itemsById.get(question.itemId)
  if (!item) return
  const event = createLearningEvent({
    sessionId,
    questionId: `${sessionId}:${next.puzzleId}:${next.index}:${shownAt}`,
    at: shownAt + attempt.elapsedMs,
    contentVersion: model.content.contentVersion,
    itemId: item.id,
    skillId: item.skillId,
    level: item.level,
    puzzleId: next.puzzleId,
    presentedFoilCodes: question.choices.flatMap((c) => (c.foilCode === undefined ? [] : [c.foilCode])),
    chosenWord: attempt.word,
    correct: attempt.correct,
    chosenFoilCode: attempt.foilCode,
    attemptNumber: attempt.attemptNumber,
    elapsedMs: attempt.elapsedMs,
  })
  // Storage problems must never interrupt a child's game.
  void store.then((s) => s.append(event)).catch(() => {})
}

/** Identifies one shown question, so a new question (even of the same word) replays its sound. */
const questionKeyOf = (screen: Screen): string | null =>
  screen.name === 'question' ? `${screen.puzzleId}#${screen.index}` : null

export function App({
  audio: audioProp,
  repository: repositoryProp,
  uiSounds: uiSoundsProp,
  preferences: preferencesProp,
  exitBridge: exitBridgeProp,
  eventStore: eventStoreProp,
  seed,
  now = Date.now,
}: AppProps) {
  const model = useMemo(() => createGameModel(loadContent()), [])
  const audio = useMemo(() => audioProp ?? createDefaultAudioProvider(), [audioProp])
  const repository = useMemo(() => repositoryProp ?? localProgressRepository(), [repositoryProp])
  const preferences = useMemo(() => preferencesProp ?? localPreferencesRepository(), [preferencesProp])
  const [soundEffects, setSoundEffects] = useState(() => preferences.load().soundEffects)
  const uiSounds = useMemo(() => uiSoundsProp ?? webAudioUiSounds(), [uiSoundsProp])
  const [random] = useState(() => seededRandom(seed ?? Math.floor(Math.random() * 2 ** 32)))

  const [state, setState] = useState(() => initialGameState(repository.load()))
  // Latest state, so taps landing before a re-render still apply in order.
  const latest = useRef(state)
  const [sound, setSound] = useState<SoundNotice>('none')
  const [sessionId] = useState(newId)
  const eventStore = useMemo(() => (eventStoreProp ? Promise.resolve(eventStoreProp) : openLearningEventStore()), [eventStoreProp])
  const exitBridge = useMemo(() => exitBridgeProp ?? detectExitBridge(), [exitBridgeProp])
  const [confirmingExit, setConfirmingExit] = useState(false)
  const onExit = exitBridge.canExit ? () => setConfirmingExit(true) : undefined

  useEffect(() => repository.save(state.progress), [repository, state.progress])
  useEffect(() => () => audio.stop(), [audio])
  useEffect(() => {
    uiSounds.setMuted(!soundEffects)
    preferences.save({ schemaVersion: 1, soundEffects })
  }, [uiSounds, preferences, soundEffects])
  useEffect(
    () =>
      installPressFeedback(document, {
        onPress: (element) => {
          const sound = element.dataset['sound']
          if (isUiSound(sound)) uiSounds.play(sound)
        },
      }),
    [uiSounds],
  )

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
    recordAttempt(model, eventStore, sessionId, action, next.screen)
    const effect = outcomeSound(action, previous.screen, next.screen)
    if (effect) uiSounds.play(effect)
    const key = questionKeyOf(next.screen)
    if (key === questionKeyOf(previous.screen)) return
    if (key === null) audio.stop()
    else void speak(next.screen)
  }

  const { screen } = state
  const soundSetting = { on: soundEffects, onToggle: () => setSoundEffects((on) => !on) }
  const level = (n: number) => model.content.levels.find((l) => l.level === n)

  const content = (() => {
    switch (screen.name) {
      case 'welcome':
        return <WelcomeScreen onPlay={() => dispatch({ type: 'play' })} sound={soundSetting} onExit={onExit} />

      case 'home':
        return (
          <HomeScreen
            levels={model.content.levels}
            statusOf={(n) => model.levelStatus(state.progress, n)}
            starsOf={(n) => model.levelStars(state.progress, n)}
            onOpenLevel={(n) => dispatch({ type: 'openLevel', level: n })}
            sound={soundSetting}
            onExit={onExit}
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
      {confirmingExit && (
        <ExitDialog
          onStay={() => setConfirmingExit(false)}
          onLeave={() => {
            // Progress is already saved on every change; just stop sound and hand back to the container.
            audio.stop()
            setConfirmingExit(false)
            exitBridge.exit()
          }}
        />
      )}
    </>
  )
}
