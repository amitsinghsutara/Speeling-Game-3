/**
 * Talks to the native container app (Android WebView) when there is one.
 * Detected by capability, never by user agent: in a normal browser nothing
 * here exists, and the exit button stays hidden.
 */
declare global {
  interface Window {
    /** JS bridge injected by the native container; absent in a regular browser. */
    Android?: Record<string, unknown>
  }
}

/**
 * UNCONFIRMED: the container's exit method has not been documented yet.
 * These are likely names, checked in order. Replace this list with the
 * container's actual method once it is known.
 */
export const EXIT_METHOD_CANDIDATES = ['closeApp', 'exitApp', 'close', 'finish'] as const

export interface ExitBridge {
  /** True only when the container exposes a callable exit method. */
  readonly canExit: boolean
  exit(): void
}

/**
 * Tells the container the game is fully cached for offline play. This is the
 * one container method confirmed in use: Speeling Game 2 calls
 * window.Android.cachedStatus(true) the same way.
 */
export function notifyContainerCached(win: Pick<Window, 'Android'> | undefined = typeof window === 'undefined' ? undefined : window): void {
  const bridge = win?.Android
  const method = bridge?.['cachedStatus']
  if (typeof method !== 'function') return
  try {
    ;(method as (cached: boolean) => void).call(bridge, true)
  } catch {
    // The game works the same whether or not the container hears this.
  }
}

export const noExitBridge: ExitBridge = { canExit: false, exit: () => {} }

export function detectExitBridge(win: Pick<Window, 'Android'> | undefined = typeof window === 'undefined' ? undefined : window): ExitBridge {
  const bridge = win?.Android
  const method = EXIT_METHOD_CANDIDATES.find((name) => typeof bridge?.[name] === 'function')
  if (!bridge || !method) return noExitBridge
  return {
    canExit: true,
    exit() {
      try {
        // Call as a method so the native bridge keeps its `this`.
        ;(bridge[method] as () => void).call(bridge)
      } catch {
        // If the container refuses, stay in the game rather than crash.
      }
    },
  }
}
