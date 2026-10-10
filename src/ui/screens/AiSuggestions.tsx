/**
 * The grown-ups' "AI suggestions" panel. Asks only when the button is pressed;
 * shows checked suggestions under a clear "AI-generated" label. The device's own
 * numbers above it stay the source of truth.
 */
import { useState } from 'react'
import type { InsightsOutcome } from '../../insights/client.ts'
import type { Insights } from '../../insights/schema.ts'
import { Button } from '../components/Button.tsx'
import styles from './GrownUps.module.css'

type PanelState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'shown'; insights: Insights } | { kind: 'unavailable'; reason: string }

const UNAVAILABLE_TEXT: Record<string, string> = {
  offline: 'You are offline. Suggestions need an internet connection.',
  'too-soon': 'Suggestions were just asked for. Please try again in a moment.',
  'no-data': 'Suggestions appear once your child has answered some questions.',
}

interface AiSuggestionsProps {
  request: () => Promise<InsightsOutcome>
  /** Codebook name for a foil code, e.g. "V" → "Vowel substitution". */
  foilName: (code: string) => string
}

export function AiSuggestions({ request, foilName }: AiSuggestionsProps) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' })

  const ask = async () => {
    setState({ kind: 'loading' })
    const outcome = await request()
    setState(outcome.kind === 'insights' ? { kind: 'shown', insights: outcome.insights } : { kind: 'unavailable', reason: outcome.reason })
  }

  return (
    <section className={styles.card} aria-labelledby="ai-suggestions" aria-busy={state.kind === 'loading'}>
      <h2 id="ai-suggestions" className={styles.heading}>
        AI suggestions
      </h2>
      {state.kind === 'idle' && (
        <>
          <p className={styles.muted}>
            Ask an AI for a short summary and ideas to practise at home. It receives only the practice numbers and the game&apos;s word list, never your
            child&apos;s name or answers.
          </p>
          <Button colour="bubble" sound="tap" onClick={() => void ask()}>
            Get AI suggestions
          </Button>
        </>
      )}

      {state.kind === 'loading' && (
        <p role="status" className={styles.muted}>
          Thinking about your child&apos;s practice…
        </p>
      )}

      {state.kind === 'unavailable' && (
        <div role="status">
          <p className={styles.muted}>{UNAVAILABLE_TEXT[state.reason] ?? 'Suggestions are not available right now. The numbers above are still up to date.'}</p>
          {state.reason !== 'no-data' && (
            <Button colour="paper" sound="tap" onClick={() => void ask()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {state.kind === 'shown' && (
        <div role="status">
          <p className={styles.aiLabel}>AI-generated suggestions: they may not be right. The numbers above come from this device.</p>
          {state.insights.summary && <p>{state.insights.summary}</p>}

          {state.insights.strengths.length > 0 && (
            <>
              <h3 className={styles.subheading}>Going well</h3>
              <ul className={styles.list}>
                {state.insights.strengths.map((s) => (
                  <li key={s.level}>
                    <strong>Level {s.level}:</strong> {s.note}
                  </li>
                ))}
              </ul>
            </>
          )}

          {state.insights.focusAreas.length > 0 && (
            <>
              <h3 className={styles.subheading}>What to focus on</h3>
              <ul className={styles.list}>
                {state.insights.focusAreas.map((f) => (
                  <li key={f.foilCode}>
                    <strong>{foilName(f.foilCode)}:</strong> {f.tip}
                  </li>
                ))}
              </ul>
            </>
          )}

          {state.insights.homeActivities.length > 0 && (
            <>
              <h3 className={styles.subheading}>Ideas to try at home</h3>
              <ul className={styles.list}>
                {state.insights.homeActivities.map((a) => (
                  <li key={a.title}>
                    <strong>{a.title}</strong>: {a.description}
                    <span className={styles.activityWords}> Words: {a.words.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
