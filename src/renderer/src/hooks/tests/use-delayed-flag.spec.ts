import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDelayedFlag } from '../use-delayed-flag'

afterEach(() => vi.useRealTimers())

it('turns on only after staying active for the delay', () => {
  vi.useFakeTimers()
  const { result } = renderHook(({ active }) => useDelayedFlag(active, 1000), {
    initialProps: { active: true }
  })

  expect(result.current).toBe(false)
  act(() => vi.advanceTimersByTime(999))
  expect(result.current).toBe(false)
  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe(true)
})

it('resets immediately when activity stops and waits again on the next run', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 1000), {
    initialProps: { active: true }
  })
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current).toBe(true)

  rerender({ active: false })
  expect(result.current).toBe(false)
  rerender({ active: true })
  expect(result.current).toBe(false)
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current).toBe(true)
})

it('never turns on when activity stops before the delay', () => {
  vi.useFakeTimers()
  const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 1000), {
    initialProps: { active: true }
  })
  act(() => vi.advanceTimersByTime(500))
  rerender({ active: false })
  act(() => vi.advanceTimersByTime(2000))

  expect(result.current).toBe(false)
})
