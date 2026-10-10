import { useMemo } from 'react'
import styles from './Confetti.module.css'

interface ConfettiProps {
  active: boolean
  pieceCount?: number
}

const COLORS = ['#ffd23f', '#6cc8ff', '#ff86bf', '#a6e56f', '#c39bff', '#ffb347']
const SHAPES = ['square', 'circle', 'star'] as const

/** Lightweight celebratory confetti burst. Purely decorative. */
export function Confetti({ active, pieceCount = 18 }: ConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: pieceCount }, (_, i) => ({
        id: i,
        left: (i / pieceCount) * 100 + (i % 3) * 2,
        color: COLORS[i % COLORS.length],
        shape: SHAPES[i % SHAPES.length] ?? 'square',
        delay: (i % 6) * 0.12,
        rotate: (i * 37) % 360,
      })),
    [pieceCount],
  )

  if (!active) return null

  return (
    <div className={styles.field} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`${styles.piece} ${styles[p.shape]}`}
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}
