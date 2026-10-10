import styles from './Mascot.module.css'

export type MascotMood = 'happy' | 'excited' | 'thinking' | 'encouraging'

interface MascotProps {
  mood: MascotMood
  className?: string
  /** Accessible label; defaults to a mood-appropriate description. */
  label?: string
  /** 'sm' shrinks Fern so feedback fits without scrolling. */
  size?: 'sm' | 'lg'
}

const MOOD_LABELS: Record<MascotMood, string> = {
  happy: 'Fern the fox smiling happily',
  excited: 'Fern the fox celebrating excitedly',
  thinking: 'Fern the fox listening carefully',
  encouraging: 'Fern the fox smiling encouragingly',
}

interface FaceConfig {
  leftBrow: string
  rightBrow: string
  mouth: string
  pupilOffsetY: number
  eyeScale: number
  showSparkles: boolean
  headTilt: number
}

// Every mood is friendly: brows are raised, never furrowed, and Fern never frowns at a wrong answer.
const FACES: Record<MascotMood, FaceConfig> = {
  happy: {
    leftBrow: 'M64 74 Q76 68 88 74',
    rightBrow: 'M112 74 Q124 68 136 74',
    mouth: 'M80 134 Q100 158 120 134',
    pupilOffsetY: 0,
    eyeScale: 1.1,
    showSparkles: false,
    headTilt: 0,
  },
  excited: {
    leftBrow: 'M62 70 Q76 60 90 70',
    rightBrow: 'M110 70 Q124 60 138 70',
    mouth: 'M74 130 Q100 172 126 130 Q100 144 74 130 Z',
    pupilOffsetY: -1,
    eyeScale: 1.2,
    showSparkles: true,
    headTilt: -4,
  },
  thinking: {
    leftBrow: 'M64 74 Q76 68 88 74',
    rightBrow: 'M112 70 Q124 62 136 70',
    mouth: 'M88 138 Q100 148 112 138',
    pupilOffsetY: -3,
    eyeScale: 1.1,
    showSparkles: false,
    headTilt: 6,
  },
  encouraging: {
    leftBrow: 'M64 72 Q76 64 88 72',
    rightBrow: 'M112 72 Q124 64 136 72',
    mouth: 'M82 136 Q100 152 118 136',
    pupilOffsetY: 1,
    eyeScale: 1.1,
    showSparkles: false,
    headTilt: -6,
  },
}

/**
 * Fern the fox, drawn as inline SVG so it scales crisply and can be swapped
 * for illustrated art later. Screens only choose a mood.
 */
export function Mascot({ mood, className, label, size = 'lg' }: MascotProps) {
  const face = FACES[mood]

  return (
    <div
      className={`${styles.wrapper} ${styles[size]} ${styles[mood]} ${className ?? ''}`}
      role="img"
      aria-label={label ?? MOOD_LABELS[mood]}
    >
      <svg
        viewBox="0 0 200 200"
        className={styles.svg}
        style={{ transform: `rotate(${face.headTilt}deg)` }}
        aria-hidden="true"
      >
        <path d="M50 60 L30 10 L85 55 Z" className={styles.earOuter} />
        <path d="M150 60 L170 10 L115 55 Z" className={styles.earOuter} />
        <path d="M55 52 L42 24 L78 50 Z" className={styles.earInner} />
        <path d="M145 52 L158 24 L122 50 Z" className={styles.earInner} />

        <ellipse cx="100" cy="105" rx="72" ry="66" className={styles.head} />
        <ellipse cx="100" cy="130" rx="38" ry="27" className={styles.muzzle} />

        <ellipse cx="50" cy="120" rx="13" ry="9" className={styles.blush} />
        <ellipse cx="150" cy="120" rx="13" ry="9" className={styles.blush} />

        <path d={face.leftBrow} className={styles.eyebrow} />
        <path d={face.rightBrow} className={styles.eyebrow} />

        <g style={{ transform: `scale(${face.eyeScale})`, transformOrigin: '100px 98px' }}>
          <circle cx="76" cy="98" r="12" className={styles.eyeWhite} />
          <circle cx="124" cy="98" r="12" className={styles.eyeWhite} />
          <circle cx="76" cy={99 + face.pupilOffsetY} r="7.5" className={styles.pupil} />
          <circle cx="124" cy={99 + face.pupilOffsetY} r="7.5" className={styles.pupil} />
          <circle cx="79.5" cy={95.5 + face.pupilOffsetY} r="2.8" className={styles.glint} />
          <circle cx="127.5" cy={95.5 + face.pupilOffsetY} r="2.8" className={styles.glint} />
        </g>

        <ellipse cx="100" cy="121" rx="8" ry="5.5" className={styles.nose} />
        <path d={face.mouth} className={styles.mouth} />

        {face.showSparkles && (
          <g className={styles.sparkles}>
            <path d="M30 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" />
            <path d="M175 70 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" />
          </g>
        )}
      </svg>
    </div>
  )
}
