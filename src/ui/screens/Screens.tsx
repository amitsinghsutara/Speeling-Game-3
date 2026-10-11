/**
 * The game's screens. Each is a plain view of the pure game state: it renders
 * what it is given and reports taps; all rules live in src/game.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { Level } from '../../content/schema.ts'
import type { Puzzle, Status } from '../../game/progression.ts'
import { BackButton, Button, SoundToggle } from '../components/Button.tsx'
import { LockIcon, ProgressDots, SignBoard, SpeechBubble, TickIcon } from '../components/Cartoon.tsx'
import { Mascot, type MascotMood } from '../components/Mascot.tsx'
import { AnswerGrid, AudioButton, type TileState } from '../components/Play.tsx'
import { StarBadge } from '../components/StarBadge.tsx'
import { Confetti } from '../components/decorations/Confetti.tsx'
import { ExitButton } from '../components/ExitDialog.tsx'
import { HoldButton } from '../components/HoldButton.tsx'
import { Stars } from '../components/decorations/Stars.tsx'
import type { Choice } from '../../game/question.ts'
import { useAfterPress } from '../press.ts'
import styles from './Screen.module.css'

const LEVEL_COLOURS = ['--tangerine', '--bubble', '--berry', '--lime', '--grape', '--lemon'] as const
const levelColour = (level: number): CSSProperties => ({
  background: `var(${LEVEL_COLOURS[(level - 1) % LEVEL_COLOURS.length] ?? '--lemon'})`,
})

export interface SoundSetting {
  on: boolean
  onToggle: () => void
}

/**
 * Three-column bar: a control on the left, the title centred, and an equal
 * empty column on the right, so the title can never slide under the control.
 * `longTitle`: with a control on each side, the title moves to its own row sooner.
 */
function TopBar({
  start,
  end,
  longTitle = false,
  children,
}: {
  start: ReactNode
  end?: ReactNode
  longTitle?: boolean
  children?: ReactNode
}) {
  return (
    <div className={longTitle ? `${styles.topBar} ${styles.topBarLong}` : styles.topBar}>
      <div className={styles.topStart}>{start}</div>
      <div className={styles.topTitle}>{children}</div>
      {end ? <div className={styles.topEnd}>{end}</div> : <div className={styles.topSpacer} aria-hidden="true" />}
    </div>
  )
}

interface WelcomeScreenProps {
  onPlay: () => void
  sound: SoundSetting
  /** Present only when the container app can close the game. */
  onExit?: (() => void) | undefined
}

export function WelcomeScreen({ onPlay, sound, onExit }: WelcomeScreenProps) {
  return (
    <main className={`${styles.screen} ${styles.centered}`}>
      <TopBar
        start={<SoundToggle on={sound.on} onToggle={sound.onToggle} />}
        end={onExit && <ExitButton onClick={onExit} />}
      />
      <SignBoard>
        <h1 className={styles.title}>Spelling Adventure</h1>
      </SignBoard>
      <div className={styles.fernRow}>
        <Mascot mood="excited" />
        <SpeechBubble>Hi, I&apos;m Fern! Let&apos;s find words in the forest!</SpeechBubble>
      </div>
      <Button colour="lime" size="lg" onClick={onPlay}>
        Play!
      </Button>
    </main>
  )
}

interface HomeScreenProps {
  levels: readonly Level[]
  statusOf: (level: number) => Status
  starsOf: (level: number) => { earned: number; max: number }
  onOpenLevel: (level: number) => void
  sound: SoundSetting
  onExit?: (() => void) | undefined
  onOpenGrownUps: () => void
}

export function HomeScreen({ levels, statusOf, starsOf, onOpenLevel, sound, onExit, onOpenGrownUps }: HomeScreenProps) {
  const afterPress = useAfterPress()
  return (
    <main className={`${styles.screen} ${styles.fixedScreen}`}>
      <TopBar start={<SoundToggle on={sound.on} onToggle={sound.onToggle} />} end={onExit && <ExitButton onClick={onExit} />}>
        <SignBoard small>
          <h1>Pick a level</h1>
        </SignBoard>
      </TopBar>
      <div className={styles.fernRow}>
        <Mascot mood="happy" size="sm" />
        <SpeechBubble>Where shall we go today?</SpeechBubble>
      </div>
      <div className={styles.scrollArea}>
        <div className={styles.levelGrid}>
          {levels.map((level) => {
            const status = statusOf(level.level)
            const stars = starsOf(level.level)
            const locked = status === 'locked'
            return (
              <button
                key={level.level}
                type="button"
                data-press
                data-sound="select"
                className={styles.card}
                disabled={locked}
                onClick={afterPress(() => onOpenLevel(level.level))}
                aria-label={`Level ${level.level}, ${level.skillPattern}${locked ? ', locked' : status === 'completed' ? ', finished' : ''}`}
              >
                <span className={styles.cardBadge} style={locked ? undefined : levelColour(level.level)} aria-hidden="true">
                  {locked ? <LockIcon /> : level.level}
                </span>
                <span className={styles.cardTitle}>
                  Level {level.level}
                  {status === 'completed' && <TickIcon size={24} />}
                </span>
                <span className={styles.cardSkill}>{level.skillPattern}</span>
                <span className={styles.cardMeta}>
                  {level.targetWordCount} words
                  {!locked && <StarBadge earned={stars.earned} max={stars.max} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <HoldButton label="For grown-ups: press and hold to open" onComplete={onOpenGrownUps}>
        For grown-ups (press and hold)
      </HoldButton>
    </main>
  )
}

interface PuzzleMapScreenProps {
  level: Level
  puzzles: readonly Puzzle[]
  statusOf: (puzzle: Puzzle) => Status
  starsOf: (puzzle: Puzzle) => number | undefined
  onStart: (puzzleId: string) => void
  onBack: () => void
  onExit?: (() => void) | undefined
}

export function PuzzleMapScreen({ level, puzzles, statusOf, starsOf, onStart, onBack, onExit }: PuzzleMapScreenProps) {
  const afterPress = useAfterPress()
  return (
    <main className={`${styles.screen} ${styles.fixedScreen}`}>
      <TopBar start={<BackButton label="Back to levels" onClick={onBack} />} end={onExit && <ExitButton onClick={onExit} />}>
        <SignBoard small>
          <h1>Level {level.level}</h1>
        </SignBoard>
      </TopBar>
      <div className={styles.fernRow}>
        <Mascot mood="happy" size="sm" />
        <SpeechBubble>
          Follow the stepping stones! We&apos;re practising <strong>{level.skillPattern}</strong>.
        </SpeechBubble>
      </div>
      <div className={styles.scrollArea}>
        <ol className={styles.trail}>
          {puzzles.map((puzzle, index) => {
            const status = statusOf(puzzle)
            const stars = starsOf(puzzle)
            return (
              <li key={puzzle.id} style={{ listStyle: 'none', display: 'contents' }}>
                {index > 0 && <span className={styles.path} aria-hidden="true" />}
                <span className={styles.step}>
                  <button
                    type="button"
                    data-press
                    data-sound="select"
                    className={`${styles.stone} ${styles[status]}`}
                    disabled={status === 'locked'}
                    onClick={afterPress(() => onStart(puzzle.id))}
                    aria-label={`Puzzle ${puzzle.number}, ${puzzle.itemIds.length} words${status === 'locked' ? ', locked' : status === 'completed' ? `, finished with ${stars ?? 0} stars, play again` : ', start'}`}
                  >
                    <span aria-hidden="true">{status === 'locked' ? <LockIcon /> : status === 'completed' ? <TickIcon size={44} /> : puzzle.number}</span>
                    {stars !== undefined && (
                      <span className={styles.stoneStars} aria-hidden="true">
                        <StarBadge earned={stars} max={3} />
                      </span>
                    )}
                  </button>
                  <span className={styles.stepLabel} aria-hidden="true">
                    Puzzle {puzzle.number}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </main>
  )
}

export type SoundNotice = 'none' | 'unavailable'

interface QuestionScreenProps {
  level: number
  puzzleNumber: number
  index: number
  total: number
  choices: readonly Choice[]
  stateOf: (word: string) => TileState
  status: 'awaiting' | 'retry' | 'correct'
  target: string
  hint: string
  sound: SoundNotice
  onReplay: () => void
  onChoose: (word: string) => void
  onNext: () => void
  onBack: () => void
  onExit?: (() => void) | undefined
}

const moodFor = (status: QuestionScreenProps['status']): MascotMood =>
  status === 'correct' ? 'excited' : status === 'retry' ? 'encouraging' : 'thinking'

export function QuestionScreen(props: QuestionScreenProps) {
  const { status } = props
  const nextRef = useRef<HTMLDivElement>(null)
  // On short phones the Next button can land below the fold; bring it into view.
  useEffect(() => {
    if (status === 'correct') nextRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [status])
  const message =
    status === 'correct' ? (
      <>
        Yes! You found <strong>{props.target}</strong>!
      </>
    ) : status === 'retry' ? (
      <>Good try! {props.hint}</>
    ) : props.sound === 'unavailable' ? (
      <>Oops, I can&apos;t play the sound right now. You can still pick a word!</>
    ) : (
      <>Listen, then tap the word you hear!</>
    )

  return (
    <main className={`${styles.screen} ${styles.celebrate}`}>
      <TopBar
        start={<BackButton label="Back to the puzzle map" onClick={props.onBack} />}
        end={props.onExit && <ExitButton onClick={props.onExit} />}
        longTitle
      >
        <SignBoard small>
          <span>
            Level {props.level} · Puzzle {props.puzzleNumber}
          </span>
        </SignBoard>
      </TopBar>
      <ProgressDots done={props.index} total={props.total} />
      <div className={styles.questionArea}>
        <div className={styles.fernRow}>
          <Mascot mood={moodFor(status)} size="sm" />
          <SpeechBubble tone={status === 'correct' ? 'yes' : status === 'retry' ? 'try' : 'plain'} live>
            {message}
          </SpeechBubble>
        </div>
        <AudioButton onPlay={props.onReplay} size={status === 'correct' ? 'sm' : 'lg'} label="Hear the word again" />
        <AnswerGrid choices={props.choices} stateOf={props.stateOf} onChoose={props.onChoose} />
        <div className={styles.nextWrap} ref={nextRef}>
          {status === 'correct' && (
            <Button colour="lime" size="lg" onClick={props.onNext} autoFocus>
              Next →
            </Button>
          )}
        </div>
      </div>
      <Confetti active={status === 'correct'} />
    </main>
  )
}

interface CompleteScreenProps {
  kind: 'puzzle' | 'level'
  level: number
  puzzleNumber: number
  stars: number
  hasNext: boolean
  onNext: () => void
  onMap: () => void
  onHome: () => void
}

const cheerFor = (stars: number): string =>
  stars === 3 ? 'Perfect! Every word right the first time!' : stars === 2 ? 'Great job! You worked it out!' : 'You did it! Practice makes perfect!'

export function CompleteScreen({ kind, level, puzzleNumber, stars, hasNext, onNext, onMap, onHome }: CompleteScreenProps) {
  return (
    <main className={`${styles.screen} ${styles.centered} ${styles.celebrate}`}>
      <Confetti active pieceCount={kind === 'level' ? 30 : 18} />
      <Stars earned={stars} total={3} />
      <Mascot mood="excited" />
      <section className={styles.panel} aria-live="polite">
        <h1 className={styles.panelTitle}>{kind === 'level' ? `Level ${level} done!` : `Puzzle ${puzzleNumber} done!`}</h1>
        <p className={styles.tagline}>{cheerFor(stars)}</p>
        <div className={styles.actions}>
          {kind === 'puzzle' ? (
            <>
              <Button colour="paper" onClick={onMap}>
                Map
              </Button>
              <Button colour="lime" onClick={onNext}>
                Next puzzle →
              </Button>
            </>
          ) : (
            <>
              <Button colour="paper" onClick={onHome}>
                Levels
              </Button>
              <Button colour="lime" onClick={onNext} disabled={!hasNext}>
                {hasNext ? 'Next level →' : 'All levels done!'}
              </Button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
