/**
 * Lists the Gemini models your key can call (names only; the key is never printed).
 *
 *   npm run gemini:models            # all generateContent models
 *   npm run gemini:models -- lite    # filter by text
 *
 * Reads GEMINI_API_KEY from .dev.vars (git-ignored).
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vars = Object.fromEntries(
  readFileSync(resolve(ROOT, '.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\s*[A-Z_]+\s*=/.test(line))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
)
const key = vars['GEMINI_API_KEY']
if (!key) {
  console.error('GEMINI_API_KEY is empty in .dev.vars')
  process.exit(1)
}
const filter = (process.argv[2] ?? '').toLowerCase()

interface Model {
  name: string
  displayName?: string
  supportedGenerationMethods?: string[]
}
const models: Model[] = []
let pageToken = ''
do {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`
  const response = await fetch(url, { headers: { 'x-goog-api-key': key } })
  if (!response.ok) {
    console.error(`Google answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    process.exit(1)
  }
  const body = (await response.json()) as { models?: Model[]; nextPageToken?: string }
  models.push(...(body.models ?? []))
  pageToken = body.nextPageToken ?? ''
} while (pageToken)

const usable = models
  .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
  .filter((m) => `${m.name} ${m.displayName ?? ''}`.toLowerCase().includes(filter))
for (const m of usable) console.log(`${m.name.replace(/^models\//, '').padEnd(42)} ${m.displayName ?? ''}`)
console.log(`\n${usable.length} model(s) support generateContent${filter ? ` matching "${filter}"` : ''}.`)
