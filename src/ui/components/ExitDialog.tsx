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

interface ConfirmDialogProps {
  title: string
  text: string
  /** The safe choice: listed first and focused. */
  stayLabel: string
  confirmLabel: string
  onStay: () => void
  onConfirm: () => void
}

/**
 * Friendly "are you sure?" for anything that cannot be undone by accident. In-app
 * rather than window.confirm, which looks foreign and can be blocked in WebViews.
 * Escape always means "stay".
 */
export function ConfirmDialog({ title, text, stayLabel, confirmLabel, onStay, onConfirm }: ConfirmDialogProps) {
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
          {title}
        </h2>
        <p className={styles.text}>{text}</p>
        {/* The safe choice comes first and has focus. */}
        <div className={styles.actions}>
          <Button colour="lime" onClick={onStay} autoFocus>
            {stayLabel}
          </Button>
          <Button colour="paper" sound="back" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ExitDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <ConfirmDialog
      title="Leave the forest?"
      text="Your stars are saved. Come back soon!"
      stayLabel="Keep playing"
      confirmLabel="Yes, leave"
      onStay={onStay}
      onConfirm={onLeave}
    />
  )
}
