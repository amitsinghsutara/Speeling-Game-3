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

/** What the native container exposes to the page, for finding the real exit method. */
export interface ContainerReport {
  /** Global objects that look like native bridges, with their callable members. */
  readonly bridges: readonly { name: string; methods: readonly string[] }[]
  /** The candidate the exit button uses, if any. */
  readonly exitMethod: string | null
}

/** Plain objects every browser puts on window; never a native bridge. */
const BUILT_IN_OBJECTS = new Set(['Math', 'JSON', 'Reflect', 'Atomics', 'Intl', 'WebAssembly', 'console', 'CSS', 'chrome', 'Iterator', 'Temporal'])

const methodsOf = (value: object): string[] => {
  const names = new Set<string>()
  // Native bridges list their methods differently across WebView versions; try both.
  for (const key in value) names.add(key)
  for (const key of Object.getOwnPropertyNames(value)) names.add(key)
  return [...names].filter((key) => typeof (value as Record<string, unknown>)[key] === 'function').sort()
}

/**
 * Lists window.Android, plus any other plain global object with methods (in case
 * the container uses a different name). Diagnostic only; reads, never calls.
 */
export function describeContainer(win: (Pick<Window, 'Android'> & Record<string, unknown>) | undefined = typeof window === 'undefined' ? undefined : (window as unknown as Pick<Window, 'Android'> & Record<string, unknown>)): ContainerReport {
  if (!win) return { bridges: [], exitMethod: null }
  const bridges: { name: string; methods: string[] }[] = []
  const seen = new Set<string>()
  const consider = (name: string) => {
    if (seen.has(name) || BUILT_IN_OBJECTS.has(name)) return
    seen.add(name)
    let value: unknown
    try {
      value = win[name]
    } catch {
      return
    }
    if (typeof value !== 'object' || value === null) return
    if (name !== 'Android' && Object.getPrototypeOf(value) !== Object.prototype) return
    // Built-in namespaces (Math, Intl, Temporal…) carry a toStringTag; native bridges do not.
    if (name !== 'Android' && Object.prototype.hasOwnProperty.call(value, Symbol.toStringTag)) return
    let methods: string[]
    try {
      methods = methodsOf(value)
    } catch {
      return
    }
    if (name === 'Android' || methods.length > 0) bridges.push({ name, methods })
  }
  consider('Android')
  try {
    for (const name of Object.getOwnPropertyNames(win)) if (/^[A-Za-z]/.test(name) && !name.startsWith('__')) consider(name)
  } catch {
    // Some hosts refuse to list window; window.Android alone is still reported.
  }
  const android = win.Android
  const exitMethod = EXIT_METHOD_CANDIDATES.find((name) => typeof android?.[name] === 'function') ?? null
  return { bridges, exitMethod }
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
