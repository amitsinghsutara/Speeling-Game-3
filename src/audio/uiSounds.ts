/**
 * Game-menu style sound effects, synthesized with the Web Audio API.
 * No audio files: nothing to download or cache, and every sound is our own.
 *
 * These are separate from word audio. Muting them never mutes the target word.
 */
export const UI_SOUNDS = ['tap', 'select', 'back', 'correct', 'tryAgain', 'celebrate'] as const
export type UiSound = (typeof UI_SOUNDS)[number]

export const isUiSound = (value: string | undefined): value is UiSound =>
  value !== undefined && (UI_SOUNDS as readonly string[]).includes(value)

export interface UiSoundPlayer {
  play(sound: UiSound): void
  setMuted(muted: boolean): void
  readonly muted: boolean
}

interface Note {
  /** Seconds after the sound starts. */
  at: number
  freq: number
  duration: number
  wave?: OscillatorType
  /** Glide to this frequency over the note. */
  glideTo?: number
  volume?: number
}

/** Each sound is a few short notes. Kept brief so menu blips end before the next word plays. */
export const RECIPES: Readonly<Record<UiSound, readonly Note[]>> = {
  tap: [{ at: 0, freq: 1320, duration: 0.03, wave: 'square', volume: 0.25 }],
  select: [
    { at: 0, freq: 660, duration: 0.05, wave: 'square', volume: 0.3 },
    { at: 0.05, freq: 990, duration: 0.06, wave: 'square', volume: 0.3 },
  ],
  back: [
    { at: 0, freq: 880, duration: 0.05, wave: 'square', volume: 0.28 },
    { at: 0.05, freq: 587, duration: 0.055, wave: 'square', volume: 0.28 },
  ],
  correct: [
    { at: 0, freq: 1047, duration: 0.09, wave: 'triangle' },
    { at: 0.08, freq: 1319, duration: 0.09, wave: 'triangle' },
    { at: 0.16, freq: 1568, duration: 0.22, wave: 'triangle' },
    { at: 0.16, freq: 3136, duration: 0.18, wave: 'sine', volume: 0.15 },
  ],
  // Gentle and low: a wrong answer should never sound like a buzzer or a punishment.
  tryAgain: [{ at: 0, freq: 392, duration: 0.2, wave: 'sine', glideTo: 294, volume: 0.45 }],
  celebrate: [
    { at: 0, freq: 523, duration: 0.1, wave: 'square', volume: 0.22 },
    { at: 0.1, freq: 659, duration: 0.1, wave: 'square', volume: 0.22 },
    { at: 0.2, freq: 784, duration: 0.1, wave: 'square', volume: 0.22 },
    { at: 0.3, freq: 1047, duration: 0.35, wave: 'triangle' },
    { at: 0.3, freq: 1319, duration: 0.35, wave: 'triangle', volume: 0.5 },
    { at: 0.3, freq: 1568, duration: 0.35, wave: 'triangle', volume: 0.5 },
  ],
}

/** Overall loudness: effects should sit well under the spoken word. */
const MASTER_VOLUME = 0.18

export type AudioContextLike = Pick<
  AudioContext,
  'currentTime' | 'destination' | 'state' | 'resume' | 'createOscillator' | 'createGain'
>

const defaultContext = (): AudioContextLike | null => {
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  return Ctor ? new Ctor() : null
}

export function webAudioUiSounds(
  createContext: () => AudioContextLike | null = defaultContext,
  initiallyMuted = false,
): UiSoundPlayer {
  let context: AudioContextLike | null | undefined
  let muted = initiallyMuted

  // Created lazily on the first sound, which is always inside a tap: browsers
  // only allow audio to start from a user gesture.
  const getContext = (): AudioContextLike | null => {
    if (context === undefined) {
      try {
        context = createContext()
      } catch {
        context = null
      }
    }
    return context
  }

  const playNote = (ctx: AudioContextLike, start: number, note: Note) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const begin = start + note.at
    const end = begin + note.duration
    const peak = MASTER_VOLUME * (note.volume ?? 1)

    oscillator.type = note.wave ?? 'triangle'
    oscillator.frequency.setValueAtTime(note.freq, begin)
    if (note.glideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.glideTo, end)

    // Fast attack, exponential decay: a clean "blip" with no click.
    gain.gain.setValueAtTime(0.0001, begin)
    gain.gain.exponentialRampToValueAtTime(peak, begin + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(begin)
    oscillator.stop(end + 0.02)
  }

  return {
    get muted() {
      return muted
    },
    setMuted(value) {
      muted = value
    },
    play(sound) {
      if (muted) return
      const ctx = getContext()
      if (!ctx) return
      try {
        if (ctx.state === 'suspended') void ctx.resume()
        const start = ctx.currentTime + 0.005
        for (const note of RECIPES[sound]) playNote(ctx, start, note)
      } catch {
        // Sound effects are decoration; never let them interrupt play.
      }
    },
  }
}

export const silentUiSounds = (): UiSoundPlayer => {
  let muted = false
  return {
    get muted() {
      return muted
    },
    setMuted(value) {
      muted = value
    },
    play() {},
  }
}
