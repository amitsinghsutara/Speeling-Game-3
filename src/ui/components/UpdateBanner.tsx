import { Button } from './Button.tsx'
import styles from './UpdateBanner.module.css'

interface UpdateBannerProps {
  onUpdate: () => void
  onLater: () => void
}

/**
 * Shown on the Welcome and level screens when a new version is ready. Never shown
 * during a puzzle. "Later" is safe: the update also installs on the next launch.
 */
export function UpdateBanner({ onUpdate, onLater }: UpdateBannerProps) {
  return (
    <section className={styles.banner} aria-labelledby="update-title" aria-live="polite">
      <span className={styles.badge} aria-hidden="true">
        ✨
      </span>
      <div className={styles.text}>
        <h2 id="update-title" className={styles.title}>
          A new version is ready!
        </h2>
        <p className={styles.detail}>Your stars and progress stay saved.</p>
      </div>
      <div className={styles.actions}>
        <Button colour="lime" sound="select" onClick={onUpdate}>
          Update now
        </Button>
        <Button colour="paper" sound="tap" onClick={onLater}>
          Later
        </Button>
      </div>
    </section>
  )
}
