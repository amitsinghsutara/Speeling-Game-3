/**
 * Cloudflare Pages Function: POST /api/insights (grown-ups' AI suggestions).
 *
 * Off unless INSIGHTS_ENABLED="true" (separate from the adviser), plus GEMINI_API_KEY
 * and GEMINI_MODEL. All logic lives in src/insights/server.ts (tested there).
 */
import generated from '../../src/content/content.generated.json' with { type: 'json' }
import { slidingWindowLimiter } from '../../src/adviser/server.ts'
import { contentDatasetSchema } from '../../src/content/schema.ts'
import { handleInsightsRequest, type InsightsEnv } from '../../src/insights/server.ts'

const content = contentDatasetSchema.parse(generated)
// On demand by a grown-up, so a tighter limit: 10 per device IP per 10 minutes.
const rateLimiter = slidingWindowLimiter(10, 10 * 60 * 1000)

export const onRequest = (context: { request: Request; env: InsightsEnv }): Promise<Response> =>
  handleInsightsRequest(context.request, context.env, {
    fetch: (...args) => fetch(...args),
    now: Date.now,
    newId: () => crypto.randomUUID(),
    content,
    rateLimiter,
    // Metadata only. View with: npx wrangler pages deployment tail --project-name=spelling-adventure
    log: (entry) => console.log(JSON.stringify(entry)),
  })
