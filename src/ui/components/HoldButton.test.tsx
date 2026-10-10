import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_MS, HoldButton } from './HoldButton.tsx'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const setup = () => {
  const onComplete = vi.fn<() => void>()
  render(
    <HoldButton label="For grown-ups: press and hold to open" onComplete={onComplete}>
      For grown-ups
    </HoldButton>,
  )
  return { onComplete, button: screen.getByRole('button', { name: /press and hold/ }) }
}

describe('HoldButton (child gate)', () => {
  it('does nothing on a tap or click', () => {
    const { onComplete, button } = setup()
    fireEvent.click(button)
    fireEvent.pointerDown(button, { button: 0 })
    act(() => vi.advanceTimersByTime(200))
    fireEvent.pointerUp(button)
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('opens after a full hold', () => {
    const { onComplete, button } = setup()
    fireEvent.pointerDown(button, { button: 0 })
    act(() => vi.advanceTimersByTime(HOLD_MS - 1))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('cancels if the finger slides off', () => {
    const { onComplete, button } = setup()
    fireEvent.pointerDown(button, { button: 0 })
    act(() => vi.advanceTimersByTime(HOLD_MS / 2))
    fireEvent.pointerLeave(button)
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('works from the keyboard by holding Enter or Space', () => {
    const { onComplete, button } = setup()
    fireEvent.keyDown(button, { key: 'Enter' })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(button, { key: ' ' })
    act(() => vi.advanceTimersByTime(HOLD_MS / 2))
    fireEvent.keyUp(button, { key: ' ' })
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
