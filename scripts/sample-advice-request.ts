/**
 * Prints a realistic adviser request (what the browser would send) for live checks:
 * a level-1 child who keeps choosing vowel foils, built with the app's own code.
 *
 *   node scripts/sample-advice-request.ts > request.json
 */
import generated from '../src/content/content.generated.json' with { type: 'json' }
import { DEFAULT_POLICY_CONFIG } from '../src/adaptive/config.ts'
import { buildAdviceRequest } from '../src/adviser/request.ts'
import { contentDatasetSchema } from '../src/content/schema.ts'
import { DEFAULT_LEARNER_MODEL_CONFIG } from '../src/learner/config.ts'
import { buildLearnerModel } from '../src/learner/model.ts'
import { answerEvents } from '../src/test/fixtures/events.ts'

const content = contentDatasetSchema.parse(generated)
const events = [
  ...['item-001', 'item-002', 'item-003', 'item-004', 'item-005'].flatMap((itemId, i) =>
    // Vowel foil chosen first on most words; one right first time.
    answerEvents({ itemId, picks: i === 1 ? ['target'] : ['V', 'target'] }),
  ),
  ...answerEvents({ itemId: 'item-006', picks: ['FC', 'target'] }),
]
const learner = buildLearnerModel(events, content, DEFAULT_LEARNER_MODEL_CONFIG)
process.stdout.write(JSON.stringify(buildAdviceRequest(learner, content, 1, DEFAULT_POLICY_CONFIG, Date.now())))
