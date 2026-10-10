import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createDefaultAudioProvider, type AudioProvider } from './audio/AudioProvider.ts'
import { isUiSound, webAudioUiSounds, type UiSound, type UiSoundPlayer } from './audio/uiSounds.ts'
import { createAdviserClient, type AdviserClient } from './adviser/client.ts'
import { buildAdviceRequest } from './adviser/request.ts'
import { buildLearnerModel } from './learner/model.ts'
import { buildProgressReport } from './learner/report.ts'
import { createInsightsClient, type InsightsClient } from './insights/client.ts'
import { buildLocalInsights } from './insights/local.ts'
import { GrownUpsScreen } from './ui/screens/GrownUps.tsx'
import { consoleLog } from './debug/log.ts'
import { loadContent } from './content/loadContent.ts'
import { hintFor } from './game/hints.ts'
import { newId } from './learner/events.ts'
import { seededRandom } from './game/random.ts'
import {
  createGameModel,
  gameReducer,
  initialGameState,
  roundProgress,
  type GameAction,
  type ModelOptions,
  type Screen,
  type StepEnv,
} from './game/session.ts'
import { openLearningEventStore, type LearningEventStore } from './persistence/learningEventStore.ts'
import { localPreferencesRepository, type PreferencesRepository } from './persistence/preferences.ts'
import { detectExitBridge, type ExitBridge } from './platform/containerBridge.ts'
import { inertPwaStatus, type PwaStatus } from './pwa/status.ts'
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
  /** Where learning events and decisions go; IndexedDB by default. */
  eventStore?: LearningEventStore
  /** Policy and learner-model settings; the provisional defaults otherwise. */
  modelOptions?: ModelOptions
  /** Service worker status (offline readiness, waiting updates). */
  pwa?: PwaStatus
  /** Optional AI adviser. Off unless the build sets VITE_ADVISER_ENABLED=true (and the server agrees). */
  adviser?: AdviserClient
  /** Optional grown-ups' AI suggestions. Off unless the build sets VITE_INSIGHTS_ENABLED=true (and the server agrees). */
  insights?: InsightsClient
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

const adviserLog = consoleLog('adviser')

/** Identifies one shown question, so a new question (even of the same word) replays its sound. */
const questionKeyOf = (screen: Screen): string | null => (screen.name === 'question' ? screen.decision.id : null)

export function App({
  audio: audioProp,
  repository: repositoryProp,
  uiSounds: uiSoundsProp,
  preferences: preferencesProp,
  exitBridge: exitBridgeProp,
  eventStore: eventStoreProp,
  modelOptions,
  pwa = inertPwaStatus,
  adviser: adviserProp,
  insights: insightsProp,
  seed,
  now = Date.now,
}: AppProps) {
  // Model options are read once; changing them later would change rules mid-game.
  const [model] = useState(() => createGameModel(loadContent(), modelOptions))
  const audio = useMemo(() => audioProp ?? createDefaultAudioProvider(), [audioProp])
  const repository = useMemo(() => repositoryProp ?? localProgressRepository(), [repositoryProp])
  const preferences = useMemo(() => preferencesProp ?? localPreferencesRepository(), [preferencesProp])
  const [soundEffects, setSoundEffects] = useState(() => preferences.load().soundEffects)
  const uiSounds = useMemo(() => uiSoundsProp ?? webAudioUiSounds(), [uiSoundsProp])
  const [random] = useState(() => seededRandom(seed ?? Math.floor(Math.random() * 2 ** 32)))

  const [adviser] = useState(
    () => adviserProp ?? createAdviserClient({ enabled: import.meta.env.VITE_ADVISER_ENABLED === 'true', content: model.content }),
  )
  const [insights] = useState(
    () =>
      insightsProp ??
      createInsightsClient({ enabled: import.meta.env.VITE_INSIGHTS_ENABLED === 'true', content: model.content, policy: model.policyConfig }),
  )
  const [state, setState] = useState(() => initialGameState(repository.load(), newId()))
  // Latest state, so taps landing before a re-render still apply in order.
  const latest = useRef(state)
  const [sound, setSound] = useState<SoundNotice>('none')
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

  // Save new events and decisions as they appear; ids already stored (or loaded) are skipped.
  const saved = useRef(new Set<string>())
  useEffect(() => {
    const fresh = <T extends { id: string }>(records: readonly T[]) => records.filter((r) => !saved.current.has(r.id))
    const events = fresh(state.events)
    const decisions = fresh(state.decisions)
    for (const r of [...events, ...decisions]) saved.current.add(r.id)
    if (events.length === 0 && decisions.length === 0) return
    // Storage problems must never interrupt a child's game.
    void eventStore
      .then(async (store) => {
        for (const d of decisions) await store.appendDecision(d)
        for (const e of events) await store.append(e)
      })
      .catch(() => {})
  }, [eventStore, state.events, state.decisions])

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
    const decision = next.decisions.length > previous.decisions.length ? next.decisions.at(-1) : undefined
    if (decision?.adviser?.status === 'ADVISER_ACCEPTED') {
      adviserLog(`advice used: ${decision.strategy} on ${decision.itemId}`, {
        foilWords: decision.foilWords,
        presentation: decision.presentation,
        focus: decision.evidence.errorPattern?.foilCode ?? null,
        adviceId: decision.adviser.adviceId,
      })
    }
    const effect = outcomeSound(action, previous.screen, next.screen)
    if (effect) uiSounds.play(effect)
    const key = questionKeyOf(next.screen)
    if (key === questionKeyOf(previous.screen)) return
    if (key === null) audio.stop()
    else void speak(next.screen)
  }

  // Earlier sessions' events feed the learner model once they have loaded.
  useEffect(() => {
    let cancelled = false
    void eventStore
      .then((store) => store.load())
      .then(({ events }) => {
        if (cancelled) return
        for (const e of events) saved.current.add(e.id)
        dispatch({ type: 'eventsLoaded', events })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // dispatch reads the latest state through a ref, so it is safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventStore])

  const env = (): StepEnv => ({ random, now: now(), newId })

  // Grown-ups' report and suggestions, recomputed only when the child's data changes,
  // so the AI-first Suggestions card asks once per change, not on every render.
  const grownUps = useMemo(() => {
    const learner = buildLearnerModel(state.events, model.content, model.learnerConfig)
    const report = buildProgressReport(learner, model.content, model.policyConfig)
    return { learner, report, local: buildLocalInsights(report, model.content) }
  }, [state.events, model])
  const requestInsights = useCallback(
    (options?: { refresh?: boolean }) => insights.request(grownUps.learner, grownUps.report, options),
    [insights, grownUps],
  )
  const { screen } = state

  // On the puzzle map, ask the adviser in the background. Play never waits for it:
  // advice that arrives later is used for later decisions, or not at all.
  const mapLevel = screen.name === 'puzzles' ? screen.level : null
  useEffect(() => {
    if (mapLevel === null || !adviser.enabled) return
    const current = latest.current
    const learner = buildLearnerModel(current.events, model.content, model.learnerConfig)
    const body = buildAdviceRequest(learner, model.content, mapLevel, model.policyConfig, now())
    void adviser.request(body).then((outcome) => {
      if (outcome.kind === 'advice') dispatch({ type: 'adviceReceived', advice: outcome.advice })
    })
    // dispatch and now read through refs/props that do not change the request's meaning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adviser, mapLevel, model])

  // A waiting update is applied only on the Welcome or level screens, never mid-puzzle.
  // Progress is saved on every change, so the reload loses nothing.
  const { updateReady } = useSyncExternalStore(pwa.subscribe, pwa.getSnapshot)
  const safeToReload = screen.name === 'welcome' || screen.name === 'home'
  useEffect(() => {
    if (updateReady && safeToReload) pwa.applyUpdate()
  }, [pwa, updateReady, safeToReload])
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
            onOpenGrownUps={() => dispatch({ type: 'openGrownUps' })}
          />
        )

      case 'grownUps': {
        return (
          <GrownUpsScreen
            report={grownUps.report}
            requestInsights={insights.enabled ? requestInsights : undefined}
            localInsights={grownUps.local}
            foilName={(code) => model.content.foilCodebook.find((e) => e.code === code)?.name ?? code}
            starsOf={(n) => model.levelStars(state.progress, n)}
            adviserOn={adviser.enabled}
            onBack={() => dispatch({ type: 'home' })}
            onReset={() => {
              // Clear storage first, then the in-memory state; failures must not block a reset.
              repository.clear()
              void eventStore.then((s) => s.clear()).catch(() => {})
              saved.current.clear()
              dispatch({ type: 'resetProgress' })
            }}
          />
        )
      }

      case 'puzzles': {
        const info = level(screen.level)
        if (!info) return null
        return (
          <PuzzleMapScreen
            level={info}
            puzzles={model.puzzlesByLevel.get(screen.level) ?? []}
            statusOf={(p) => model.puzzleStatus(state.progress, p)}
            starsOf={(p) => state.progress.starsByPuzzleId[p.id]}
            onStart={(puzzleId) => dispatch({ type: 'startPuzzle', puzzleId, env: env() })}
            onBack={() => dispatch({ type: 'home' })}
          />
        )
      }

      case 'question': {
        const puzzle = model.findPuzzle(screen.puzzleId)
        const { done, total } = roundProgress(screen, puzzle)
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
            index={done}
            total={total}
            choices={q.question.choices}
            stateOf={stateOf}
            status={q.status}
            target={q.question.target}
            hint={hintFor(lastWrong?.foilCode)}
            sound={sound}
            onReplay={() => void speak(screen)}
            onChoose={(word) => dispatch({ type: 'answer', word, env: env() })}
            onNext={() => dispatch({ type: 'next', env: env() })}
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
              dispatch(screen.name === 'levelComplete' ? { type: 'nextLevel' } : { type: 'nextPuzzle', env: env() })
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
