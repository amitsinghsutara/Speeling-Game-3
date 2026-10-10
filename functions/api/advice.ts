/**
 * Cloudflare Pages Function: POST /api/advice
 *
 * Off unless ADVISER_ENABLED="true", GEMINI_API_KEY (secret) and GEMINI_MODEL are set
 * for the project. All logic lives in src/adviser/server.ts (tested there).
 */
import generated from '../../src/content/content.generated.json' with { type: 'json' }
import { handleAdviceRequest, slidingWindowLimiter, type AdviserEnv } from '../../src/adviser/server.ts'
import { contentDatasetSchema } from '../../src/content/schema.ts'

const content = contentDatasetSchema.parse(generated)
// Per-instance, best effort: 20 requests per device IP per 10 minutes.
const rateLimiter = slidingWindowLimiter(20, 10 * 60 * 1000)

export const onRequest = (context: { request: Request; env: AdviserEnv }): Promise<Response> =>
  handleAdviceRequest(context.request, context.env, {
    fetch: (...args) => fetch(...args),
    now: Date.now,
    newId: () => crypto.randomUUID(),
    content,
    rateLimiter,
    // Metadata only (see ServerLogEntry). View with: npx wrangler pages deployment tail --project-name=spelling-adventure
    log: (entry) => console.log(JSON.stringify(entry)),
  })
