import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_PRESS_MS, PRESS_ACTION_DELAY_MS, installPressFeedback, useAfterPress } from './press.ts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('installPressFeedback', () => {
  const setup = () => {
    render(
      <>
        <button type="button" data-press>
          <span>tap me</span>
        </button>
        <button type="button" data-press disabled>
          off
        </button>
        <button type="button" data-press aria-disabled="true">
          tried
        </button>
      </>,
    )
    return installPressFeedback()
  }

  it('marks a touched element as pressed straight away, even when the touch lands on a child', () => {
    const uninstall = setup()
    fireEvent.pointerDown(screen.getByText('tap me'), { button: 0, pointerType: 'touch' })
    expect(screen.getByRole('button', { name: 'tap me' })).toHaveAttribute('data-pressed', 'true')
    uninstall()
  })

  it('keeps a quick tap visibly pressed for a minimum time', () => {
    const uninstall = setup()
    const button = screen.getByRole('button', { name: 'tap me' })
    fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' })
    vi.advanceTimersByTime(20)
    fireEvent.pointerUp(button, { button: 0, pointerType: 'touch' })
    vi.advanceTimersByTime(MIN_PRESS_MS - 40)
    expect(button).toHaveAttribute('data-pressed', 'true')
    vi.advanceTimersByTime(40)
    expect(button).not.toHaveAttribute('data-pressed')
    uninstall()
  })

  it('releases on pointer cancel (for example when the touch turns into a scroll)', () => {
    const uninstall = setup()
    const button = screen.getByRole('button', { name: 'tap me' })
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerCancel(button)
    vi.advanceTimersByTime(MIN_PRESS_MS)
    expect(button).not.toHaveAttribute('data-pressed')
    uninstall()
  })

  it('does not press disabled or already-tried elements', () => {
    const uninstall = setup()
    for (const name of ['off', 'tried']) {
      const button = screen.getByRole('button', { name })
      fireEvent.pointerDown(button, { button: 0 })
      expect(button).not.toHaveAttribute('data-pressed')
    }
    uninstall()
  })

  it('shows the same press for Enter and Space', () => {
    const uninstall = setup()
    const button = screen.getByRole('button', { name: 'tap me' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(button).toHaveAttribute('data-pressed', 'true')
    vi.advanceTimersByTime(MIN_PRESS_MS)
    fireEvent.keyDown(button, { key: ' ' })
    expect(button).toHaveAttribute('data-pressed', 'true')
    uninstall()
  })
})

describe('useAfterPress', () => {
  function Harness({ onAct }: { onAct: () => void }) {
    const afterPress = useAfterPress()
    return (
      <button type="button" onClick={afterPress(onAct)}>
        go
      </button>
    )
  }

  it('acts after the press delay, and a double-tap acts only once', () => {
    const onAct = vi.fn<() => void>()
    render(<Harness onAct={onAct} />)
    const button = screen.getByRole('button', { name: 'go' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onAct).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(PRESS_ACTION_DELAY_MS))
    expect(onAct).toHaveBeenCalledTimes(1)
  })

  it('acts immediately when the child prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    const onAct = vi.fn<() => void>()
    render(<Harness onAct={onAct} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onAct).toHaveBeenCalledTimes(1)
  })
})
