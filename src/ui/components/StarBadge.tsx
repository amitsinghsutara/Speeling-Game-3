import styles from './StarBadge.module.css'

interface StarBadgeProps {
  earned: number
  max: number
}

/** Small "⭐ 2/3"-style pill meant to sit on top of a level or puzzle circle. */
export function StarBadge({ earned, max }: StarBadgeProps) {
  if (max <= 0) return null

  return (
    <div className={styles.badge} aria-label={`${earned} of ${max} stars`}>
      <svg viewBox="0 0 24 24" className={styles.star} aria-hidden="true">
        <path d="M12 1l3.2 7.2L23 9l-6 5.6L18.5 23 12 18.6 5.5 23 7 14.6 1 9l7.8-.8z" />
      </svg>
      <span>
        {earned}/{max}
      </span>
    </div>
  )
}
