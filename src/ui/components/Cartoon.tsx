import type { ReactNode } from 'react'
import styles from './Cartoon.module.css'

/** Wooden forest sign for screen titles. */
export function SignBoard({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <div className={`${styles.sign} ${small ? styles.signSmall : ''}`}>
      <span className={styles.nail} aria-hidden="true" />
      <span className={`${styles.nail} ${styles.nailRight}`} aria-hidden="true" />
      {children}
    </div>
  )
}

interface SpeechBubbleProps {
  children: ReactNode
  tone?: 'plain' | 'yes' | 'try'
  /** Announce changes to screen readers (used for answer feedback). */
  live?: boolean
}

/** Fern's speech bubble. Tone changes colour, but the words always carry the meaning. */
export function SpeechBubble({ children, tone = 'plain', live = false }: SpeechBubbleProps) {
  return (
    <div
      className={`${styles.bubble} ${styles[tone]}`}
      {...(live && { role: 'status', 'aria-live': 'polite' as const })}
    >
      {children}
    </div>
  )
}

/** Row of acorns showing progress through a puzzle. */
export function ProgressDots({ done, total }: { done: number; total: number }) {
  return (
    <div className={styles.dots} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`Word ${Math.min(done + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`${styles.dot} ${i < done ? styles.dotDone : i === done ? styles.dotNow : ''}`} />
      ))}
    </div>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="11" rx="3" fill="var(--lemon)" stroke="var(--ink)" strokeWidth="2.2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="var(--ink)" strokeWidth="2.6" />
    </svg>
  )
}

export function TickIcon({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="var(--yes)" stroke="var(--ink)" strokeWidth="2.2" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
