import { describe, expect, it, vi } from 'vitest'
import { PRESS_ACTION_DELAY_MS } from '../ui/press.ts'
import { RECIPES, UI_SOUNDS, isUiSound, webAudioUiSounds, type AudioContextLike } from './uiSounds.ts'

interface PlayedNote {
  type: OscillatorType
  freq: number
  start: number
}

function fakeContext(state: AudioContextState = 'running') {
  const notes: PlayedNote[] = []
  const param = () => ({
    setValueAtTime: vi.fn<(value: number, time: number) => void>(),
    exponentialRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
  })
  const resume = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const context = {
    currentTime: 10,
    destination: {},
    state,
    resume,
    createGain: () => ({ gain: param(), connect: vi.fn<() => void>() }),
    createOscillator: () => {
      const note: PlayedNote = { type: 'sine', freq: 0, start: 0 }
      const frequency = param()
      frequency.setValueAtTime.mockImplementation((value: number) => {
        note.freq = value
      })
      return {
        set type(value: OscillatorType) {
          note.type = value
        },
        frequency,
        connect: vi.fn<() => void>(),
        start: (at: number) => {
          note.start = at
          notes.push(note)
        },
        stop: vi.fn<() => void>(),
      }
    },
  }
  return { context: context as unknown as AudioContextLike, notes, resume }
}

describe('webAudioUiSounds', () => {
  it('plays a rising two-note blip for select', () => {
    const { context, notes } = fakeContext()
    webAudioUiSounds(() => context).play('select')
    expect(notes.map((n) => n.freq)).toEqual([660, 990])
  })

  it('plays a falling blip for back', () => {
    const { context, notes } = fakeContext()
    webAudioUiSounds(() => context).play('back')
    const [first, second] = notes
    expect(first && second && first.freq > second.freq).toBe(true)
  })

  it('stays silent when muted, and plays again when unmuted', () => {
    const { context, notes } = fakeContext()
    const sounds = webAudioUiSounds(() => context, true)
    sounds.play('correct')
    expect(notes).toHaveLength(0)
    sounds.setMuted(false)
    sounds.play('correct')
    expect(notes.length).toBeGreaterThan(0)
  })

  it('creates the audio context lazily, on the first sound (inside a tap)', () => {
    const create = vi.fn<() => AudioContextLike>(() => fakeContext().context)
    const sounds = webAudioUiSounds(create)
    expect(create).not.toHaveBeenCalled()
    sounds.play('tap')
    sounds.play('tap')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('resumes a suspended context', () => {
    const { context, resume } = fakeContext('suspended')
    webAudioUiSounds(() => context).play('tap')
    expect(resume).toHaveBeenCalled()
  })

  it('never throws when Web Audio is missing or broken', () => {
    expect(() => webAudioUiSounds(() => null).play('celebrate')).not.toThrow()
    const broken = () => {
      throw new Error('no audio')
    }
    expect(() => webAudioUiSounds(broken).play('celebrate')).not.toThrow()
  })
})

describe('sound design rules', () => {
  const endOf = (sound: keyof typeof RECIPES) => Math.max(...RECIPES[sound].map((n) => n.at + n.duration))

  it('menu blips end before the next spoken word can start', () => {
    for (const sound of ['tap', 'select', 'back'] as const) {
      expect(endOf(sound) * 1000).toBeLessThan(PRESS_ACTION_DELAY_MS)
    }
  })

  it('the wrong-answer sound is gentle: soft waves only, low, and falling', () => {
    const notes = RECIPES.tryAgain
    expect(notes.every((n) => n.wave === 'sine')).toBe(true)
    expect(notes.every((n) => n.freq < 500 && (n.glideTo ?? n.freq) <= n.freq)).toBe(true)
  })

  it('recognises only known sound names', () => {
    expect(UI_SOUNDS.every(isUiSound)).toBe(true)
    expect(isUiSound('boom')).toBe(false)
    expect(isUiSound(undefined)).toBe(false)
  })
})
