import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useAfterPress } from '../press.ts'
import styles from './Button.module.css'

type Colour = 'lime' | 'lemon' | 'bubble' | 'berry' | 'paper'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  colour?: Colour
  size?: 'md' | 'lg'
  children: ReactNode
}

/**
 * Chunky, outlined, press-down cartoon button. Every action uses it, so tap targets stay large.
 * Its action waits a moment after the tap so the squish is seen before the screen changes.
 */
export function Button({ colour = 'lime', size = 'md', className, children, type = 'button', onClick, ...rest }: ButtonProps) {
  const afterPress = useAfterPress()
  return (
    <button
      type={type}
      data-press
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

export function BackButton({ label, onClick }: BackButtonProps) {
  const afterPress = useAfterPress()
  return (
    <button
      type="button"
      data-press
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
