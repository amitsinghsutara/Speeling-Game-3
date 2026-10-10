/**
 * Shared Gemini call: main model, then the fallback once, inside one time budget.
 * Used by both the play adviser and the grown-ups insights. The key is only ever
 * placed in a request header; callers validate the parsed JSON themselves.
 */
export interface GeminiDeps {
  fetch: typeof fetch
  now: () => number
}

export interface GeminiCall<T> {
  base: string
  key: string
  /** Main model first; duplicates and blanks are ignored. */
  models: readonly (string | undefined)[]
  systemInstruction: string
  responseSchema: unknown
  input: unknown
  maxOutputTokens: number
  budgetMs: number
  timeoutMs: number
  /** Reason reported when the output does not validate. */
  invalidReason?: string
  /** Turns the model's JSON into a validated value, or null to treat it as a failure. */
  parse: (raw: unknown) => T | null
}

export interface GeminiAttempt {
  model: string
  outcome: string
  ms: number
}

export type GeminiResult<T> =
  | { kind: 'ok'; model: string; value: T; attempts: GeminiAttempt[] }
  | { kind: 'failed'; reason: string; status: number; attempts: GeminiAttempt[] }

/** Pulls the JSON text out of a generateContent response; null if the shape is unexpected. */
export function geminiText(body: unknown): string | null {
  const candidates = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })?.candidates
  const parts = candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('')
  return text.length > 0 ? text : null
}

export function geminiBody(call: Pick<GeminiCall<unknown>, 'systemInstruction' | 'responseSchema' | 'input' | 'maxOutputTokens'>) {
  return {
    systemInstruction: { parts: [{ text: call.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(call.input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: call.responseSchema,
      temperature: 0.2,
      maxOutputTokens: call.maxOutputTokens,
    },
  }
}

type Failure = { reason: string; status: number }

async function attempt<T>(call: GeminiCall<T>, model: string, timeoutMs: number, deps: GeminiDeps): Promise<{ value: T } | Failure> {
  let upstream: Response
  try {
    upstream = await deps.fetch(`${call.base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': call.key },
      body: JSON.stringify(geminiBody(call)),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return timedOut ? { reason: 'upstream-timeout', status: 504 } : { reason: 'upstream-unreachable', status: 502 }
  }
  if (!upstream.ok) return { reason: `upstream-${upstream.status}`, status: 502 }
  let raw: unknown
  try {
    const text = geminiText(await upstream.json())
    raw = text === null ? null : JSON.parse(text)
  } catch {
    raw = null
  }
  const value = call.parse(raw)
  return value === null ? { reason: call.invalidReason ?? 'invalid-output', status: 502 } : { value }
}

export async function callGemini<T>(call: GeminiCall<T>, deps: GeminiDeps): Promise<GeminiResult<T>> {
  const models = [...new Set(call.models.filter((m): m is string => !!m && m.length > 0))]
  const deadline = deps.now() + call.budgetMs
  const attempts: GeminiAttempt[] = []
  let failure: Failure = { reason: 'upstream-unreachable', status: 502 }
  for (const model of models) {
    const remaining = deadline - deps.now()
    if (remaining <= 0) break
    const started = deps.now()
    const result = await attempt(call, model, Math.min(remaining, call.timeoutMs), deps)
    attempts.push({ model, outcome: 'value' in result ? 'ok' : result.reason, ms: deps.now() - started })
    if ('value' in result) return { kind: 'ok', model, value: result.value, attempts }
    failure = result
  }
  return { kind: 'failed', ...failure, attempts }
}
