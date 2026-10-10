import { describe, expect, it, vi, type Mock } from 'vitest'
import {
  bundledAudioProvider,
  fallbackAudioProvider,
  speechAudioProvider,
  type AudioProvider,
  type MediaElementLike,
} from './AudioProvider.ts'

const word = { itemId: 'item-001', target: 'sat' }

const element = (play: () => Promise<void>): MediaElementLike & { pause: Mock<() => void> } => ({
  play,
  pause: vi.fn<() => void>(),
})

describe('bundledAudioProvider', () => {
  it('plays the bundled MP3 for the target word', async () => {
    const created: string[] = []
    const provider = bundledAudioProvider((src) => {
      created.push(src)
      return element(() => Promise.resolve())
    }, '/')
    await expect(provider.play(word)).resolves.toBe('played')
    expect(created).toEqual(['/audio/words/sat.mp3'])
  })

  it('reports failure instead of throwing', async () => {
    const provider = bundledAudioProvider(() => element(() => Promise.reject(new Error('blocked'))), '/')
    await expect(provider.play(word)).resolves.toBe('failed')
  })

  it('stops the previous word before playing the next, so sounds never overlap', async () => {
    const first = element(() => Promise.resolve())
    const second = element(() => Promise.resolve())
    const queue = [first, second]
    const provider = bundledAudioProvider(() => queue.shift() ?? second, '/')
    await provider.play(word)
    await provider.play({ itemId: 'item-002', target: 'mat' })
    expect(first.pause).toHaveBeenCalled()
  })
})

describe('speechAudioProvider', () => {
  it('is unavailable when the browser has no speech synthesis', async () => {
    await expect(speechAudioProvider(undefined).play(word)).resolves.toBe('unavailable')
  })

  it('speaks the target word slowly in English', async () => {
    const speak = vi.fn<(u: SpeechSynthesisUtterance) => void>()
    const utterance = { text: '', lang: '', rate: 1 } as unknown as SpeechSynthesisUtterance
    const provider = speechAudioProvider({ speak, cancel: vi.fn<() => void>() }, (text) => Object.assign(utterance, { text }))
    await expect(provider.play(word)).resolves.toBe('played')
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'sat', lang: 'en-US', rate: 0.8 }))
  })
})

describe('fallbackAudioProvider', () => {
  const fake = (name: string, outcome: 'played' | 'failed' | 'unavailable'): AudioProvider => ({
    name,
    play: vi.fn<AudioProvider['play']>(() => Promise.resolve(outcome)),
    stop: vi.fn<() => void>(),
  })

  it('uses the first provider that plays', async () => {
    const bundled = fake('bundled', 'failed')
    const speech = fake('speech', 'played')
    await expect(fallbackAudioProvider([bundled, speech]).play(word)).resolves.toBe('played')
    expect(speech.play).toHaveBeenCalledWith(word)
  })

  it('reports failure when every provider fails, and unavailable when none can play', async () => {
    await expect(fallbackAudioProvider([fake('a', 'failed'), fake('b', 'unavailable')]).play(word)).resolves.toBe('failed')
    await expect(fallbackAudioProvider([fake('a', 'unavailable')]).play(word)).resolves.toBe('unavailable')
  })
})
