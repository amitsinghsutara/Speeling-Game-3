/**
 * Prints a realistic grown-ups insights request for live checks: a child doing
 * well on most level-1 words who keeps choosing vowel foils. Built with app code.
 *
 *   node scripts/sample-insights-request.ts > insights.json
 */
import generated from '../src/content/content.generated.json' with { type: 'json' }
import { DEFAULT_POLICY_CONFIG } from '../src/adaptive/config.ts'
import { contentDatasetSchema } from '../src/content/schema.ts'
import { buildInsightsRequest } from '../src/insights/client.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from '../src/learner/config.ts'
import { buildLearnerModel } from '../src/learner/model.ts'
import { buildProgressReport } from '../src/learner/report.ts'
import { answerEvents, correctAnswers } from '../src/test/fixtures/events.ts'

const content = contentDatasetSchema.parse(generated)
const level1 = content.items.filter((i) => i.level === 1).map((i) => i.id)
const events = [
  ...correctAnswers(level1.slice(5, 15)),
  ...['item-002', 'item-003', 'item-004', 'item-016'].flatMap((itemId) => answerEvents({ itemId, picks: ['V', 'target'] })),
]
const learner = buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG)
const report = buildProgressReport(learner, content, DEFAULT_POLICY_CONFIG)
process.stdout.write(JSON.stringify(buildInsightsRequest(learner, report, content, DEFAULT_POLICY_CONFIG, Date.now())))
