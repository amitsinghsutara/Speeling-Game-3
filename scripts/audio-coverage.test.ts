// @vitest-environment node
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import content from '../src/content/content.generated.json' with { type: 'json' }

const AUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio/words')

it('has bundled audio for every target word, so no word is silent offline', () => {
  const missing = content.items.map((i) => i.target).filter((t) => !existsSync(resolve(AUDIO_DIR, `${t}.mp3`)))
  expect(missing).toEqual([])
})

it('ships no empty audio files and no audio for words that are not targets', () => {
  const targets = new Set(content.items.map((i) => i.target))
  const files = readdirSync(AUDIO_DIR).filter((f) => f.endsWith('.mp3'))
  expect(files.filter((f) => statSync(resolve(AUDIO_DIR, f)).size < 1000)).toEqual([])
  expect(files.map((f) => f.replace(/\.mp3$/, '')).filter((w) => !targets.has(w))).toEqual([])
})
