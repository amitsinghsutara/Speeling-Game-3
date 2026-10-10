import styles from './Stars.module.css'

interface StarsProps {
  /** Number of stars earned (filled). If omitted, every star out of `total` is shown filled. */
  earned?: number
  /** Total stars in the row. */
  total?: number
}

function StarShape({ delay, filled }: { delay: number; filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${styles.star} ${filled ? styles.filled : styles.empty}`}
      style={filled ? { animationDelay: `${delay}s` } : undefined}
    >
      <path d="M12 1l3.2 7.2L23 9l-6 5.6L18.5 23 12 18.6 5.5 23 7 14.6 1 9l7.8-.8z" />
    </svg>
  )
}

/** Row of twinkling celebration stars, used on the puzzle/level-complete screens. */
export function Stars({ earned, total = 3 }: StarsProps) {
  const filledCount = earned ?? total
  return (
    <div className={styles.row} role="img" aria-label={`${filledCount} of ${total} stars`}>
      {Array.from({ length: total }, (_, i) => (
        <StarShape key={i} delay={i * 0.15} filled={i < filledCount} />
      ))}
    </div>
  )
}
