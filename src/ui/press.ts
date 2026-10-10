/**
 * Press feedback that works on touch screens.
 *
 * CSS `:active` is unreliable on touch: Chromium delays it while deciding
 * whether a touch is a scroll, so a quick tap often never shows it. Instead,
 * any element with `data-press` gets `data-pressed="true"` from pointer-down
 * (or Enter/Space) for at least MIN_PRESS_MS, and CSS styles that attribute.
 */
import { useCallback, useRef } from 'react'

export const MIN_PRESS_MS = 140
/** How long a screen-changing button waits so its squish is seen before the screen changes. */
export const PRESS_ACTION_DELAY_MS = 120

const PRESSABLE = '[data-press]'
const INERT = ':disabled, [aria-disabled="true"]'

function pressedTarget(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof Element ? target.closest<HTMLElement>(PRESSABLE) : null
  return element && !element.matches(INERT) ? element : null
}

export function installPressFeedback(doc: Document = document): () => void {
  const view = doc.defaultView ?? window
  const press = (element: HTMLElement) => {
    const startedAt = view.performance.now()
    element.dataset['pressed'] = 'true'
    return () => {
      const remaining = Math.max(0, MIN_PRESS_MS - (view.performance.now() - startedAt))
      view.setTimeout(() => delete element.dataset['pressed'], remaining)
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    const element = pressedTarget(event.target)
    if (!element) return
    const release = press(element)
    const end = () => {
      release()
      doc.removeEventListener('pointerup', end)
      doc.removeEventListener('pointercancel', end)
    }
    doc.addEventListener('pointerup', end)
    doc.addEventListener('pointercancel', end)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    const element = pressedTarget(event.target)
    if (element) press(element)()
  }

  doc.addEventListener('pointerdown', onPointerDown)
  doc.addEventListener('keydown', onKeyDown)
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown)
    doc.removeEventListener('keydown', onKeyDown)
  }
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

/**
 * Returns a wrapper for screen-changing handlers so the button's squish is
 * visible first. The pending flag lives in a ref, so re-renders during the
 * wait cannot reset it and a double-tap cannot act twice.
 */
export function useAfterPress(delayMs = PRESS_ACTION_DELAY_MS): (action: () => void) => () => void {
  const pending = useRef(false)
  return useCallback(
    (action: () => void) => () => {
      if (pending.current) return
      if (delayMs <= 0 || prefersReducedMotion()) {
        action()
        return
      }
      pending.current = true
      window.setTimeout(() => {
        pending.current = false
        action()
      }, delayMs)
    },
    [delayMs],
  )
}
