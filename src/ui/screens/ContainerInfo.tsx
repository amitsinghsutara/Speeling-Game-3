/**
 * The grown-ups' "Container app" card: what the native container exposes, so the
 * real exit method can be confirmed (task T019e). Read-only; calls nothing.
 */
import type { ContainerReport } from '../../platform/containerBridge.ts'
import styles from './GrownUps.module.css'

export function ContainerInfo({ report }: { report: ContainerReport }) {
  return (
    <section className={styles.card} aria-labelledby="container">
      <h2 id="container" className={styles.heading}>
        Container app
      </h2>
      {report.bridges.length === 0 ? (
        <p className={styles.muted}>No container app found. In a normal browser this is expected, and there is no exit button.</p>
      ) : (
        <>
          {report.bridges.map((bridge) => (
            <p key={bridge.name} className={styles.muted}>
              <strong>window.{bridge.name}</strong>: {bridge.methods.length > 0 ? bridge.methods.join(', ') : 'no methods listed'}
            </p>
          ))}
          <p className={styles.muted}>
            {report.exitMethod ? `Exit button: on (uses ${report.exitMethod}).` : 'Exit button: off. None of these is a known exit method.'}
          </p>
        </>
      )}
    </section>
  )
}
