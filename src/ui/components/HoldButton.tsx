import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './HoldButton.module.css'

export const HOLD_MS = 1800

interface HoldButtonProps {
  /** Accessible name; should say it needs holding. */
  label: string
  children: ReactNode
  onComplete: () => void
  holdMs?: number
}

/**
 * A child gate: the action runs only after a press is held for `holdMs`, with a
 * ring filling up to show progress. Works with touch, mouse, and keyboard
 * (hold Enter or Space). Letting go early cancels.
 */
export function HoldButton({ label, children, onComplete, holdMs = HOLD_MS }: HoldButtonProps) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  const start = () => {
    if (timer.current !== null) return
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setHolding(false)
      onComplete()
    }, holdMs)
  }
  useEffect(() => cancel, [])

  return (
    <button
      type="button"
      className={`${styles.hold} ${holding ? styles.holding : ''}`}
      style={{ '--hold-ms': `${holdMs}ms` } as CSSProperties}
      aria-label={label}
      onPointerDown={(e) => {
        if (e.button === 0) start()
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') cancel()
      }}
      onBlur={cancel}
      // A click alone (no hold) does nothing; that is the point of the gate.
      onClick={(e) => e.preventDefault()}
    >
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.text}>{children}</span>
    </button>
  )
}
