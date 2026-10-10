/**
 * The grown-ups' Suggestions card, AI first: when the screen opens it asks for
 * AI suggestions, and if they are unavailable for any reason it shows
 * suggestions from the game's own rules instead, in the same layout.
 * The source is always labelled; the device's numbers stay the source of truth.
 */
import { useEffect, useState } from 'react'
import type { InsightsOutcome } from '../../insights/client.ts'
import type { Insights } from '../../insights/schema.ts'
import { Button } from '../components/Button.tsx'
import styles from './GrownUps.module.css'

type PanelState =
  | { source: 'loading' }
  | { source: 'ai'; insights: Insights }
  | { source: 'local'; why: Extract<InsightsOutcome, { kind: 'none' }>['reason'] | 'off' }

/** Short, plain reasons for showing the local version. */
const WHY_LOCAL: Record<string, string> = {
  offline: 'you are offline',
  'too-soon': 'they were asked for a moment ago',
  timeout: 'the AI took too long to answer',
  unavailable: 'the AI service is not available right now',
  invalid: 'the AI answer did not pass the safety checks',
  error: 'the AI service could not be reached',
}

interface SuggestionsProps {
  /** Present when AI suggestions are switched on for this build. */
  request?: ((options?: { refresh?: boolean }) => Promise<InsightsOutcome>) | undefined
  /** Suggestions from the game's own rules, used whenever AI is unavailable. */
  local: Insights
  /** Codebook name for a foil code, e.g. "V" → "Vowel substitution". */
  foilName: (code: string) => string
}

export function AiSuggestions({ request, local, foilName }: SuggestionsProps) {
  const [state, setState] = useState<PanelState>(request ? { source: 'loading' } : { source: 'local', why: 'off' })

  useEffect(() => {
    if (!request) return
    let cancelled = false
    void request().then((outcome) => {
      if (cancelled) return
      setState(outcome.kind === 'insights' ? { source: 'ai', insights: outcome.insights } : { source: 'local', why: outcome.reason })
    })
    return () => {
      cancelled = true
    }
  }, [request])

  const refresh = async () => {
    if (!request) return
    const previous = state
    setState({ source: 'loading' })
    const outcome = await request({ refresh: true })
    if (outcome.kind === 'insights') setState({ source: 'ai', insights: outcome.insights })
    // A failed refresh keeps a good AI answer on screen rather than swapping it for the local one.
    else if (previous.source === 'ai') setState(previous)
    else setState({ source: 'local', why: outcome.reason })
  }

  const shown = state.source === 'ai' ? state.insights : state.source === 'local' ? local : null
  // "No data" is not a failure: the local card already says there is nothing to go on yet.
  const showWhy = state.source === 'local' && state.why !== 'off' && state.why !== 'no-data' && state.why !== 'disabled'

  return (
    <section className={styles.card} aria-labelledby="suggestions" aria-busy={state.source === 'loading'}>
      <h2 id="suggestions" className={styles.heading}>
        Suggestions
      </h2>

      {state.source === 'loading' && (
        <p role="status" className={styles.muted}>
          Getting suggestions…
        </p>
      )}

      {shown && (
        <div role="status">
          {state.source === 'ai' ? (
            <p className={styles.aiLabel}>AI-generated suggestions: they may not be right. The numbers on this page come from this device.</p>
          ) : (
            <p className={styles.localLabel}>
              From the game&apos;s own rules on this device.
              {showWhy && ` AI suggestions aren't shown because ${WHY_LOCAL[state.why] ?? 'they are not available right now'}.`}
            </p>
          )}
          {shown.summary && <p>{shown.summary}</p>}

          {shown.strengths.length > 0 && (
            <>
              <h3 className={styles.subheading}>Going well</h3>
              <ul className={styles.list}>
                {shown.strengths.map((s) => (
                  <li key={s.level}>
                    <strong>Level {s.level}:</strong> {s.note}
                  </li>
                ))}
              </ul>
            </>
          )}

          {shown.focusAreas.length > 0 && (
            <>
              <h3 className={styles.subheading}>What to focus on</h3>
              <ul className={styles.list}>
                {shown.focusAreas.map((f) => (
                  <li key={f.foilCode}>
                    <strong>{foilName(f.foilCode)}:</strong> {f.tip}
                  </li>
                ))}
              </ul>
            </>
          )}

          {shown.homeActivities.length > 0 && (
            <>
              <h3 className={styles.subheading}>Ideas to try at home</h3>
              <ul className={styles.list}>
                {shown.homeActivities.map((a) => (
                  <li key={a.title}>
                    <strong>{a.title}</strong>: {a.description}
                    <span className={styles.activityWords}> Words: {a.words.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {request && state.source !== 'loading' && (
            <Button colour="paper" sound="tap" onClick={() => void refresh()}>
              {state.source === 'ai' ? 'Refresh suggestions' : 'Try AI suggestions again'}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
