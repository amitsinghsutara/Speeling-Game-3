/**
 * Suggestions built from the game's own rules, used when AI suggestions are
 * unavailable. Same shape as the AI version, so the screen shows either one.
 *
 * No new teaching content is invented here: tips reuse the in-game hints
 * (src/game/hints.ts), names come from the FoilCodebook, and words come from
 * the device's own "words to practise".
 */
import type { ContentDataset } from '../content/schema.ts'
import { hintFor } from '../game/hints.ts'
import { STATUS_TEXT, percent, type ProgressReport } from '../learner/report.ts'
import { INSIGHT_LIMITS, type Insights } from './schema.ts'

export function buildLocalInsights(report: ProgressReport, content: ContentDataset): Insights {
  const started = report.levels.filter((l) => l.status !== 'not-started')

  const summary =
    report.questions === 0
      ? 'No answers yet on this device. Suggestions appear here once your child has played a little.'
      : [
          `${report.questions} question${report.questions === 1 ? '' : 's'} answered so far, ${percent(report.firstTryAccuracy)} right first time.`,
          started.map((l) => `Level ${l.level}: ${STATUS_TEXT[l.status].toLowerCase()}.`).join(' '),
          report.trickySpots.length > 0
            ? `The game noticed ${report.trickySpots.length === 1 ? 'one kind of mistake' : `${report.trickySpots.length} kinds of mistake`} coming up more than once and is giving extra practice.`
            : 'No repeated mistakes so far.',
        ]
          .filter((s) => s.length > 0)
          .join(' ')

  const strengths = report.levels
    .filter((l) => l.status === 'doing-well')
    .slice(0, INSIGHT_LIMITS.strengths)
    .map((l) => ({ level: l.level, note: `Doing well recently: ${percent(l.recentAccuracy)} right first time lately.` }))

  const focusAreas = report.trickySpots.slice(0, INSIGHT_LIMITS.focusAreas).map((t) => ({
    foilCode: t.code,
    tip: `The in-game hint for this is “${hintFor(t.code)}” You can use the same words when reading together.`,
  }))

  const approved = new Set(content.items.map((i) => i.target))
  const words = report.practiseWords.filter((w) => approved.has(w)).slice(0, INSIGHT_LIMITS.wordsPerActivity)
  const homeActivities =
    words.length > 0
      ? [
          {
            title: 'Practise together',
            description: 'Say each word clearly, then ask your child to spell it aloud or find it among a few written words.',
            words,
          },
        ]
      : []

  return { summary, strengths, focusAreas, homeActivities, removed: [] }
}
