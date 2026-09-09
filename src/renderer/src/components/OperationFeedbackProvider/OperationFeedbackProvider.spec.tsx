import { act, render, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { OperationFeedbackProvider } from './index'

afterEach(() => vi.useRealTimers())

it('keeps pending operations visible and prevents older results replacing newer ones', () => {
  const { result } = renderHook(() => useOperationFeedback(), {
    wrapper: OperationFeedbackProvider
  })
  let older = 0
  let newer = 0
  act(() => {
    older = result.current.begin('Importing')
    newer = result.current.begin('Zipping')
  })
  expect(result.current.activity?.label).toBe('Zipping')
  act(() => result.current.finish(newer, 'success', 'Zipped'))
  expect(result.current.activity).toMatchObject({ id: older, state: 'pending' })
  act(() => result.current.finish(older, 'error', 'Old error'))
  expect(result.current.activity).toMatchObject({ id: newer, message: 'Zipped' })
})

it('handles the opposite completion order', () => {
  const { result } = renderHook(() => useOperationFeedback(), {
    wrapper: OperationFeedbackProvider
  })
  let older = 0
  let newer = 0
  act(() => {
    older = result.current.begin('Older')
    newer = result.current.begin('Newer')
  })
  act(() => result.current.finish(older, 'success', 'Old result'))
  expect(result.current.activity).toMatchObject({ id: newer, state: 'pending' })
  act(() => result.current.finish(newer, 'error', 'New failure'))
  expect(result.current.activity).toMatchObject({ id: newer, message: 'New failure' })
})

it('resets activity when its location key changes', () => {
  let feedback: ReturnType<typeof useOperationFeedback> | null = null
  function Probe(): null {
    feedback = useOperationFeedback()
    return null
  }
  const view = render(
    <OperationFeedbackProvider locationKey="a">
      <Probe />
    </OperationFeedbackProvider>
  )
  act(() => feedback!.begin('Importing'))
  view.rerender(
    <OperationFeedbackProvider locationKey="b">
      <Probe />
    </OperationFeedbackProvider>
  )
  expect(feedback!.activity).toBeNull()
})

it('clears a result after five seconds and cancels its timer on unmount', () => {
  vi.useFakeTimers()
  const clearTimeout = vi.spyOn(window, 'clearTimeout')
  const { result, unmount } = renderHook(() => useOperationFeedback(), {
    wrapper: OperationFeedbackProvider
  })
  let operation = 0
  act(() => {
    operation = result.current.begin('Importing')
    result.current.finish(operation, 'success', 'Imported 1 file')
  })

  act(() => vi.advanceTimersByTime(4999))
  expect(result.current.activity?.message).toBe('Imported 1 file')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.activity).toBeNull()

  act(() => {
    operation = result.current.begin('Zipping')
    result.current.finish(operation, 'success', 'Zipped 2023-24')
  })
  clearTimeout.mockClear()
  unmount()
  expect(clearTimeout).toHaveBeenCalledOnce()
  clearTimeout.mockRestore()
})

it('does not let an older result replace a newer result after the newer result expires', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useOperationFeedback(), {
    wrapper: OperationFeedbackProvider
  })
  let older = 0
  let newer = 0
  act(() => {
    older = result.current.begin('Older')
    newer = result.current.begin('Newer')
    result.current.finish(newer, 'success', 'New result')
  })
  act(() => vi.advanceTimersByTime(5000))
  expect(result.current.activity).toMatchObject({ id: older, state: 'pending' })

  act(() => result.current.finish(older, 'error', 'Old result'))
  expect(result.current.activity).toBeNull()
})

it('keeps application operations pending while clearing location activity on a root change', () => {
  let feedback: ReturnType<typeof useOperationFeedback> | null = null
  function Probe(): null {
    feedback = useOperationFeedback()
    return null
  }
  const view = render(
    <OperationFeedbackProvider locationKey="a">
      <Probe />
    </OperationFeedbackProvider>
  )
  let application = 0
  act(() => {
    feedback?.begin('Importing')
    application = feedback?.begin('Opening location', 'application') ?? 0
  })
  view.rerender(
    <OperationFeedbackProvider locationKey="b">
      <Probe />
    </OperationFeedbackProvider>
  )
  // SAFETY: Probe renders synchronously under the provider before this assertion.
  expect(feedback!.activity).toMatchObject({ id: application, label: 'Opening location' })
})

it('keeps the context value stable across an unrelated provider rerender', () => {
  const values: ReturnType<typeof useOperationFeedback>[] = []
  function Probe(): null {
    values.push(useOperationFeedback())
    return null
  }
  const view = render(
    <OperationFeedbackProvider locationKey="a">
      <Probe />
    </OperationFeedbackProvider>
  )
  const first = values.at(-1)
  view.rerender(
    <OperationFeedbackProvider locationKey="a">
      <Probe />
    </OperationFeedbackProvider>
  )
  expect(values.at(-1)).toBe(first)
})
