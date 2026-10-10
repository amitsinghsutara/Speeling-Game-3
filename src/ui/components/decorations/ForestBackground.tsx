import styles from './ForestBackground.module.css'

/** Decorative cartoon forest behind every screen. Carries no information, so it is hidden from assistive tech. */
export function ForestBackground() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg className={styles.sun} viewBox="0 0 120 120">
        <g className={styles.rays}>
          {Array.from({ length: 10 }, (_, i) => (
            <rect key={i} x="56" y="2" width="8" height="20" rx="4" transform={`rotate(${i * 36} 60 60)`} />
          ))}
        </g>
        <circle cx="60" cy="60" r="30" className={styles.sunFace} />
        <circle cx="50" cy="56" r="3.5" className={styles.ink} />
        <circle cx="70" cy="56" r="3.5" className={styles.ink} />
        <path d="M48 67 Q60 77 72 67" className={styles.smile} />
      </svg>

      <svg className={`${styles.cloud} ${styles.cloud1}`} viewBox="0 0 160 70">
        <path d="M30 60 a22 22 0 0 1 4-42 a30 30 0 0 1 54-6 a24 24 0 0 1 42 16 a20 20 0 0 1 2 32 Z" />
      </svg>
      <svg className={`${styles.cloud} ${styles.cloud2}`} viewBox="0 0 160 70">
        <path d="M30 60 a22 22 0 0 1 4-42 a30 30 0 0 1 54-6 a24 24 0 0 1 42 16 a20 20 0 0 1 2 32 Z" />
      </svg>

      <svg className={styles.hillBack} viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path d="M-10 170 Q 220 70 470 150 T 960 130 T 1450 150 V330 H-10 Z" />
      </svg>

      {(['treeLeft', 'treeRight'] as const).map((position) => (
        <svg key={position} className={`${styles.tree} ${styles[position]}`} viewBox="0 0 100 160">
          <rect x="42" y="96" width="16" height="60" rx="6" className={styles.trunk} />
          <circle cx="50" cy="60" r="38" className={styles.crown} />
          <circle cx="26" cy="80" r="24" className={styles.crown} />
          <circle cx="74" cy="80" r="24" className={styles.crown} />
          <circle cx="36" cy="50" r="6" className={styles.apple} />
          <circle cx="66" cy="72" r="6" className={styles.apple} />
        </svg>
      ))}

      <svg className={styles.hillFront} viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path d="M-10 90 Q 360 20 720 80 T 1450 70 V210 H-10 Z" />
      </svg>

      {(['flower1', 'flower2', 'flower3'] as const).map((position) => (
        <svg key={position} className={`${styles.flower} ${styles[position]}`} viewBox="0 0 40 60">
          <path d="M20 58 V30" className={styles.stem} />
          {[0, 72, 144, 216, 288].map((angle) => (
            <ellipse key={angle} cx="20" cy="12" rx="6" ry="9" transform={`rotate(${angle} 20 22)`} />
          ))}
          <circle cx="20" cy="22" r="6" className={styles.flowerMiddle} />
        </svg>
      ))}
    </div>
  )
}
