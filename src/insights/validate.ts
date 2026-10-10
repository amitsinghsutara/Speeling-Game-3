/**
 * Safety and curriculum checks for AI suggestions shown to grown-ups.
 * Runs on the server and again in the browser.
 *
 * - Labelling or diagnostic language anywhere discards the whole result:
 *   a game must never suggest a child has a condition or is "behind".
 * - Strengths are kept only for levels the device itself rates "doing well".
 * - Focus areas must be detected error patterns.
 * - Practice words must be approved target words at or below the child's level.
 * - Text is trimmed to length; links and contact details discard the result.
 */
import type { ContentDataset } from '../content/schema.ts'
import { INSIGHT_LIMITS, rawInsightsSchema, type Insights, type InsightsRequest } from './schema.ts'

/** Words a children's game must not use about a child. Matched case-insensitively, as word starts. */
export const BANNED_TERMS = [
  'diagnos',
  'dyslex',
  'dyspraxi',
  'adhd',
  'autis',
  'disorder',
  'disab',
  'deficit',
  'delay',
  'behind',
  'slow learner',
  'lazy',
  'stupid',
  'dumb',
  'master',
  'genius',
  'gifted',
  'iq',
  'special needs',
  'therap',
  'clinical',
  'impair',
  'struggling reader',
  'below average',
  'above average',
  'normal',
  'abnormal',
] as const

const BANNED = new RegExp(`\\b(${BANNED_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
const LINK_OR_CONTACT = /(https?:\/\/|www\.|@[a-z0-9-]+\.|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b)/i

const clip = (text: string, max: number): string => {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

export type InsightsCheck = { kind: 'ok'; insights: Insights } | { kind: 'rejected'; reason: string }

export function validateInsights(raw: unknown, content: ContentDataset, request: InsightsRequest): InsightsCheck {
  const parsed = rawInsightsSchema.safeParse(raw)
  if (!parsed.success) return { kind: 'rejected', reason: 'wrong-shape' }
  const insights = parsed.data

  // One unsafe phrase anywhere means none of it is shown.
  const allText = [
    insights.summary,
    ...insights.strengths.map((s) => s.note),
    ...insights.focusAreas.map((f) => f.tip),
    ...insights.homeActivities.flatMap((a) => [a.title, a.description]),
  ].join('\n')
  const banned = BANNED.exec(allText)
  if (banned) return { kind: 'rejected', reason: `unsafe-language:${banned[1]?.toLowerCase()}` }
  if (LINK_OR_CONTACT.test(allText)) return { kind: 'rejected', reason: 'link-or-contact' }

  const removed: string[] = []
  const doingWell = new Set(request.levelStatuses.filter((l) => l.status === 'doing-well').map((l) => l.level))
  const patterns = new Set(request.stats.errorPatterns.map((p) => p.foilCode))
  const approvedTargets = new Set(content.items.filter((i) => i.level <= request.stats.currentLevel).map((i) => i.target))

  const strengths = insights.strengths
    .filter((s) => {
      const ok = doingWell.has(s.level)
      if (!ok) removed.push(`strength for level ${s.level}: the device does not rate it "doing well"`)
      return ok
    })
    .slice(0, INSIGHT_LIMITS.strengths)
    .map((s) => ({ level: s.level, note: clip(s.note, INSIGHT_LIMITS.strengthChars) }))

  const focusAreas = insights.focusAreas
    .filter((f) => {
      const ok = patterns.has(f.foilCode)
      if (!ok) removed.push(`focus area "${f.foilCode}": not a detected pattern`)
      return ok
    })
    .slice(0, INSIGHT_LIMITS.focusAreas)
    .map((f) => ({ foilCode: f.foilCode, tip: clip(f.tip, INSIGHT_LIMITS.tipChars) }))

  const homeActivities = insights.homeActivities
    .map((a) => {
      const words = [...new Set(a.words.map((w) => w.trim().toLowerCase()))].filter((w) => {
        const ok = approvedTargets.has(w)
        if (!ok) removed.push(`word "${w}": not an approved target word at this level`)
        return ok
      })
      return {
        title: clip(a.title, INSIGHT_LIMITS.titleChars),
        description: clip(a.description, INSIGHT_LIMITS.descriptionChars),
        words: words.slice(0, INSIGHT_LIMITS.wordsPerActivity),
      }
    })
    .filter((a) => {
      if (a.words.length === 0) removed.push(`activity "${a.title}": no approved words left`)
      return a.words.length > 0
    })
    .slice(0, INSIGHT_LIMITS.activities)

  const summary = clip(insights.summary, INSIGHT_LIMITS.summaryChars)
  if (summary.length === 0 && strengths.length === 0 && focusAreas.length === 0 && homeActivities.length === 0) {
    return { kind: 'rejected', reason: 'empty' }
  }
  return { kind: 'ok', insights: { summary, strengths, focusAreas, homeActivities, removed } }
}
