/**
 * A fake Gemini generateContent endpoint for local end-to-end testing.
 *
 *   npm run mock:gemini          # listens on http://127.0.0.1:8790
 *
 * Point the local Pages Function at it with GEMINI_API_BASE=http://127.0.0.1:8790
 * in .dev.vars. Its advice is built from the request and deliberately includes one
 * invented word and one invented foil, so you can watch validation remove them.
 * It never prints the API key.
 */
import { createServer } from 'node:http'

interface Req {
  currentLevel: number
  errorPatterns: { foilCode: string }[]
  dueReviewSkillIds: string[]
  approvedItems: { itemId: string; seen: boolean; foils: { word: string }[] }[]
}

const PORT = Number(process.env['MOCK_GEMINI_PORT'] ?? 8790)
let calls = 0

createServer((req, res) => {
  let body = ''
  req.on('data', (chunk: Buffer) => (body += chunk.toString()))
  req.on('end', () => {
    const match = /^\/v1beta\/models\/([^/:]+):generateContent$/.exec(req.url ?? '')
    if (req.method !== 'POST' || !match) {
      res.writeHead(404).end()
      return
    }
    const hasKey = typeof req.headers['x-goog-api-key'] === 'string' && req.headers['x-goog-api-key'].length > 0
    let request: Req
    try {
      const parsed = JSON.parse(body) as { contents?: { parts?: { text?: string }[] }[] }
      request = JSON.parse(parsed.contents?.[0]?.parts?.[0]?.text ?? '') as Req
    } catch {
      res.writeHead(400).end()
      return
    }
    calls++
    console.log(
      `[mock-gemini] call #${calls} model=${match[1]} key=${hasKey ? 'present' : 'MISSING'} level=${request.currentLevel} ` +
        `patterns=${request.errorPatterns.map((p) => p.foilCode).join(',') || '-'} fields=${Object.keys(request).sort().join(',')}`,
    )
    const seen = request.approvedItems.filter((i) => i.seen)
    const first = request.approvedItems[0]
    const advice = {
      focusFoilCode: request.errorPatterns[0]?.foilCode ?? null,
      reviewSkillId: request.dueReviewSkillIds[0] ?? null,
      // One real familiar word, and one invented id that validation must drop.
      preferItemIds: [...seen.slice(0, 1).map((i) => i.itemId), 'item-999'],
      candidateFoils: [
        ...(first?.foils[0] ? [{ itemId: first.itemId, word: first.foils[0].word }] : []),
        { itemId: first?.itemId ?? 'item-001', word: 'zzzz' },
      ],
      rationale: 'Mock advice for local testing.',
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(advice) }] } }] }))
  })
}).listen(PORT, '127.0.0.1', () => console.log(`[mock-gemini] listening on http://127.0.0.1:${PORT}`))
