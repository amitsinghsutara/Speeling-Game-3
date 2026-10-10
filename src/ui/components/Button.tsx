import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { UiSound } from '../../audio/uiSounds.ts'
import { useAfterPress } from '../press.ts'
import styles from './Button.module.css'

type Colour = 'lime' | 'lemon' | 'bubble' | 'berry' | 'paper'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  colour?: Colour
  size?: 'md' | 'lg'
  /** Sound effect played on press. */
  sound?: UiSound
  children: ReactNode
}

/**
 * Chunky, outlined, press-down cartoon button. Every action uses it, so tap targets stay large.
 * Its action waits a moment after the tap so the squish is seen before the screen changes.
 */
export function Button({
  colour = 'lime',
  size = 'md',
  sound = 'select',
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const afterPress = useAfterPress()
  return (
    <button
      type={type}
      data-press
      data-sound={sound}
      className={`${styles.button} ${styles[colour]} ${styles[size]} ${className ?? ''}`}
      onClick={onClick && ((event) => afterPress(() => onClick(event))())}
      {...rest}
    >
      {children}
    </button>
  )
}

interface BackButtonProps {
  label: string
  onClick: () => void
}

interface SoundToggleProps {
  on: boolean
  onToggle: () => void
}

/** Turns button and answer sound effects on or off. The spoken word always plays. */
export function SoundToggle({ on, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      data-press
      data-sound="tap"
      className={`${styles.button} ${on ? styles.lemon : styles.paper} ${styles.round}`}
      aria-pressed={on}
      aria-label="Sound effects"
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
        <path d="M5 9.5v5h3.2l4.3 3.6V5.9L8.2 9.5Z" fill="#fff" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        {on ? (
          <path d="M16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        ) : (
          <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        )}
      </svg>
    </button>
  )
}

export function BackButton({ label, onClick }: BackButtonProps) {
  const afterPress = useAfterPress()
  return (
    <button
      type="button"
      data-press
      data-sound="back"
      className={`${styles.button} ${styles.paper} ${styles.round}`}
      onClick={afterPress(onClick)}
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
