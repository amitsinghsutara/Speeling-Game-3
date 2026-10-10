/**
 * Audio is behind this interface so game logic never touches <audio> or
 * speechSynthesis directly. Providers are tried in order; a failure never
 * throws into the game, it just reports an outcome the UI can show.
 */
export interface Pronounceable {
  itemId: string
  target: string
}

export type PlayOutcome = 'played' | 'unavailable' | 'failed'

export interface AudioProvider {
  readonly name: string
  play(word: Pronounceable): Promise<PlayOutcome>
  stop(): void
}

export interface MediaElementLike {
  play(): Promise<void>
  pause(): void
}

/**
 * Plays the bundled MP3 for a target word (public/audio/words/<target>.mp3).
 * Bundled files are the preferred provider: consistent pronunciation and
 * precached for offline play.
 */
export function bundledAudioProvider(
  createElement: (src: string) => MediaElementLike = (src) => new Audio(src),
  baseUrl: string = import.meta.env.BASE_URL,
): AudioProvider {
  let current: MediaElementLike | null = null
  return {
    name: 'bundled',
    async play({ target }) {
      current?.pause()
      const element = createElement(`${baseUrl}audio/words/${encodeURIComponent(target)}.mp3`)
      current = element
      try {
        await element.play()
        return 'played'
      } catch {
        return 'failed'
      }
    },
    stop() {
      current?.pause()
      current = null
    },
  }
}

export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
}

/**
 * Best-effort browser speech. It may be missing, or sound different, in
 * embedded Android WebViews, so it is only a fallback.
 */
export function speechAudioProvider(
  speech: SpeechLike | undefined = typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis,
  createUtterance: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text),
): AudioProvider {
  return {
    name: 'speech',
    async play({ target }) {
      if (!speech) return 'unavailable'
      try {
        speech.cancel()
        const utterance = createUtterance(target)
        utterance.lang = 'en-US'
        utterance.rate = 0.8
        speech.speak(utterance)
        return 'played'
      } catch {
        return 'failed'
      }
    },
    stop() {
      speech?.cancel()
    },
  }
}

/** Tries each provider in turn, stopping any previous sound first so playback never overlaps. */
export function fallbackAudioProvider(providers: readonly AudioProvider[]): AudioProvider {
  return {
    name: providers.map((p) => p.name).join('>'),
    async play(word) {
      for (const p of providers) p.stop()
      let outcome: PlayOutcome = 'unavailable'
      for (const provider of providers) {
        const result = await provider.play(word)
        if (result === 'played') return 'played'
        if (result === 'failed') outcome = 'failed'
      }
      return outcome
    },
    stop() {
      for (const p of providers) p.stop()
    },
  }
}

export const createDefaultAudioProvider = (): AudioProvider =>
  fallbackAudioProvider([bundledAudioProvider(), speechAudioProvider()])
