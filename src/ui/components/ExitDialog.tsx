import { useEffect, useId } from 'react'
import { Button } from './Button.tsx'
import { Mascot } from './Mascot.tsx'
import styles from './ExitDialog.module.css'

/** Door-shaped exit control, shown only when the container can actually close the game. */
export function ExitButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" data-press data-sound="tap" className={styles.exit} onClick={onClick} aria-label="Leave the game">
      <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
        <rect x="5" y="3" width="11" height="18" rx="2" fill="var(--wood)" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="13" cy="12.5" r="1.2" fill="currentColor" />
        <path d="M18 9l3 3-3 3M21 12h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

interface ExitDialogProps {
  onStay: () => void
  onLeave: () => void
}

/**
 * Friendly "are you sure?" so a child cannot leave by accident. In-app rather
 * than window.confirm, which looks foreign and can be blocked in WebViews.
 */
export function ExitDialog({ onStay, onLeave }: ExitDialogProps) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStay()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStay])

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Mascot mood="encouraging" size="sm" />
        <h2 id={titleId} className={styles.title}>
          Leave the forest?
        </h2>
        <p className={styles.text}>Your stars are saved. Come back soon!</p>
        {/* The safe choice comes first and has focus. */}
        <div className={styles.actions}>
          <Button colour="lime" onClick={onStay} autoFocus>
            Keep playing
          </Button>
          <Button colour="paper" sound="back" onClick={onLeave}>
            Yes, leave
          </Button>
        </div>
      </div>
    </div>
  )
}
