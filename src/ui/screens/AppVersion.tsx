/**
 * The grown-ups' "App version" card: what is running, and a manual update check.
 */
import type { PwaSnapshot, UpdateCheckResult } from '../../pwa/status.ts'
import { Button } from '../components/Button.tsx'
import styles from './GrownUps.module.css'

const RESULT_TEXT: Record<UpdateCheckResult, string> = {
  'update-ready': 'A new version is ready.',
  'up-to-date': 'You have the latest version.',
  offline: 'You are offline, so updates cannot be checked right now.',
  error: 'Could not check for updates. Please try again later.',
  unsupported: 'Automatic updates are not available in this browser.',
}

interface AppVersionProps {
  version: string
  pwa: PwaSnapshot
  onCheck: () => void
  onUpdate: () => void
}

export function AppVersion({ version, pwa, onCheck, onUpdate }: AppVersionProps) {
  const lastChecked = pwa.lastCheck ? new Date(pwa.lastCheck.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  return (
    <section className={styles.card} aria-labelledby="app-version">
      <h2 id="app-version" className={styles.heading}>
        App version
      </h2>
      <p className={styles.muted}>Version {version}</p>
      <p role="status" className={styles.muted}>
        {pwa.checking
          ? 'Checking for updates…'
          : pwa.updateReady
            ? RESULT_TEXT['update-ready']
            : pwa.lastCheck
              ? `${RESULT_TEXT[pwa.lastCheck.result]} (checked at ${lastChecked})`
              : 'The game checks for updates by itself while it is open.'}
      </p>
      {pwa.updateReady ? (
        <Button colour="lime" sound="select" onClick={onUpdate}>
          Update now
        </Button>
      ) : (
        <Button colour="paper" sound="tap" onClick={onCheck} disabled={pwa.checking}>
          Check for updates
        </Button>
      )}
    </section>
  )
}
