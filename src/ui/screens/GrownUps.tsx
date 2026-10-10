/**
 * The grown-ups' progress screen: plain-language progress from this device's
 * learner model, plus reset. Reached from the level screen by press-and-hold.
 */
import { useState } from 'react'
import { STATUS_TEXT, percent, type ProgressReport } from '../../learner/report.ts'
import { BackButton, Button } from '../components/Button.tsx'
import { SignBoard } from '../components/Cartoon.tsx'
import { ConfirmDialog } from '../components/ExitDialog.tsx'
import { StarBadge } from '../components/StarBadge.tsx'
import type { InsightsOutcome } from '../../insights/client.ts'
import { AiSuggestions } from './AiSuggestions.tsx'
import styles from './GrownUps.module.css'
import screen from './Screen.module.css'

interface GrownUpsScreenProps {
  report: ProgressReport
  starsOf: (level: number) => { earned: number; max: number }
  /** True when advice from the optional AI adviser can be used on this device. */
  adviserOn: boolean
  /** Present only when AI suggestions are switched on for this build. */
  requestInsights?: (() => Promise<InsightsOutcome>) | undefined
  foilName: (code: string) => string
  onBack: () => void
  onReset: () => void
}

export function GrownUpsScreen({ report, starsOf, adviserOn, requestInsights, foilName, onBack, onReset }: GrownUpsScreenProps) {
  const [confirmingReset, setConfirmingReset] = useState(false)
  const started = report.levels.filter((l) => l.status !== 'not-started')

  return (
    <main className={screen.screen}>
      <div className={styles.topBar}>
        <BackButton label="Back to levels" onClick={onBack} />
        <SignBoard small>
          <h1>For grown-ups</h1>
        </SignBoard>
      </div>

      <section className={styles.card} aria-labelledby="overview">
        <h2 id="overview" className={styles.heading}>
          Overview
        </h2>
        {report.questions === 0 ? (
          <p>No answers yet on this device. Progress appears here as your child plays.</p>
        ) : (
          <dl className={styles.stats}>
            <div>
              <dt>Questions answered</dt>
              <dd>{report.questions}</dd>
            </div>
            <div>
              <dt>Different words practised</dt>
              <dd>{report.wordsPractised}</dd>
            </div>
            <div>
              <dt>Right first time</dt>
              <dd>{percent(report.firstTryAccuracy)}</dd>
            </div>
          </dl>
        )}
      </section>

      {started.length > 0 && (
        <section className={styles.card} aria-labelledby="levels">
          <h2 id="levels" className={styles.heading}>
            Levels
          </h2>
          <ul className={styles.list}>
            {started.map((l) => {
              const stars = starsOf(l.level)
              return (
                <li key={l.level} className={styles.level}>
                  <div className={styles.levelTitle}>
                    <strong>Level {l.level}</strong> <span className={styles.muted}>{l.skillPattern}</span>
                    <StarBadge earned={stars.earned} max={stars.max} />
                  </div>
                  <p className={styles.status}>{STATUS_TEXT[l.status]}</p>
                  <p className={styles.muted}>
                    {l.questions} questions · right first time {percent(l.firstTryAccuracy)} overall, {percent(l.recentAccuracy)} recently
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className={styles.card} aria-labelledby="tricky">
        <h2 id="tricky" className={styles.heading}>
          Tricky spots
        </h2>
        {report.trickySpots.length === 0 ? (
          <p>No repeated mistakes spotted. A single slip is never counted as a pattern.</p>
        ) : (
          <>
            <ul className={styles.list}>
              {report.trickySpots.map((t) => (
                <li key={t.code}>
                  <strong>{t.name}</strong> <span className={styles.muted}>(for example {t.example.replace('>', '›')})</span>: picked {t.chosen} of the{' '}
                  {t.presentedIn} times it was a choice.
                </li>
              ))}
            </ul>
            <p className={styles.muted}>The game is already giving extra practice on these.</p>
          </>
        )}
      </section>

      {report.practiseWords.length > 0 && (
        <section className={styles.card} aria-labelledby="words">
          <h2 id="words" className={styles.heading}>
            Words to practise together
          </h2>
          <p className={styles.words}>{report.practiseWords.join(', ')}</p>
          <p className={styles.muted}>Not right first time on their most recent try.</p>
        </section>
      )}

      {requestInsights && <AiSuggestions request={requestInsights} foilName={foilName} />}

      <section className={styles.card} aria-labelledby="about">
        <h2 id="about" className={styles.heading}>
          About these numbers
        </h2>
        <p className={styles.muted}>
          The numbers and labels on this page are worked out on this device from your child&apos;s answers.
          {requestInsights
            ? ' Only if you press “Get AI suggestions” are the practice numbers (never your child’s name or answers) sent to an AI service.'
            : ' Nothing is sent anywhere to make this page.'}
          {report.provisional && ' The rules behind the labels are still provisional and may change once they are reviewed by a teacher.'}
          {adviserOn && ' Optional teaching suggestions from an AI adviser are switched on: it only ever picks between options the game already allows.'}
        </p>
      </section>

      <section className={styles.card} aria-labelledby="reset">
        <h2 id="reset" className={styles.heading}>
          Start over
        </h2>
        <p className={styles.muted}>Removes all stars, unlocked levels and answer history on this device.</p>
        <Button colour="berry" sound="tap" onClick={() => setConfirmingReset(true)}>
          Reset progress
        </Button>
      </section>

      {confirmingReset && (
        <ConfirmDialog
          title="Reset all progress?"
          text="Stars, unlocked levels and answer history on this device will be removed. This cannot be undone."
          stayLabel="Keep progress"
          confirmLabel="Yes, reset"
          onStay={() => setConfirmingReset(false)}
          onConfirm={() => {
            setConfirmingReset(false)
            onReset()
          }}
        />
      )}
    </main>
  )
}
