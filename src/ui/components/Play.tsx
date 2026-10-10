import { useState } from 'react'
import type { Choice } from '../../game/question.ts'
import styles from './Play.module.css'

interface AudioButtonProps {
  onPlay: () => void
  size?: 'lg' | 'sm'
  label: string
}

/** Big round speaker. Always available, so the child can hear the word as often as they like. */
export function AudioButton({ onPlay, size = 'lg', label }: AudioButtonProps) {
  const [ripple, setRipple] = useState(0)
  return (
    <button
      type="button"
      data-press
      className={`${styles.speaker} ${styles[size]}`}
      aria-label={label}
      onClick={() => {
        setRipple((n) => n + 1)
        onPlay()
      }}
    >
      {ripple > 0 && <span key={ripple} className={styles.ripple} aria-hidden="true" />}
      <svg viewBox="0 0 24 24" className={styles.speakerIcon} aria-hidden="true">
        <path d="M3 9.5v5a1 1 0 0 0 1 1h3.4l4.6 3.8a.9.9 0 0 0 1.5-.7V5.4a.9.9 0 0 0-1.5-.7L7.4 8.5H4a1 1 0 0 0-1 1Z" fill="#fff" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M16.3 8.6a5 5 0 0 1 0 6.8" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M18.9 6a8.7 8.7 0 0 1 0 12" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export type TileState = 'idle' | 'tried' | 'correct' | 'done'

const TILE_COLOURS = ['tangerine', 'bubble', 'berry', 'grape'] as const

interface AnswerGridProps {
  choices: readonly Choice[]
  stateOf: (word: string) => TileState
  onChoose: (word: string) => void
}

export function AnswerGrid({ choices, stateOf, onChoose }: AnswerGridProps) {
  return (
    <div className={styles.grid} role="group" aria-label="Choose the spelling you heard">
      {choices.map((choice, index) => {
        const state = stateOf(choice.word)
        const colour = TILE_COLOURS[index % TILE_COLOURS.length] ?? 'tangerine'
        const status = state === 'correct' ? ', correct!' : state === 'tried' ? ', not this one' : ''
        return (
          <button
            key={choice.word}
            type="button"
            data-press
            className={`${styles.tile} ${styles[colour]} ${styles[state]}`}
            style={{ animationDelay: `${index * 80}ms` }}
            // Tried tiles stay focusable but inert, so focus is not lost mid-question.
            aria-disabled={state !== 'idle'}
            aria-label={`${choice.word}${status}`}
            onClick={() => {
              if (state === 'idle') onChoose(choice.word)
            }}
          >
            <span className={styles.word}>{choice.word}</span>
            {state === 'correct' && (
              <span className={`${styles.badge} ${styles.badgeYes}`} aria-hidden="true">
                ✓
              </span>
            )}
            {state === 'tried' && (
              <span className={`${styles.badge} ${styles.badgeTry}`} aria-hidden="true">
                ✕
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
