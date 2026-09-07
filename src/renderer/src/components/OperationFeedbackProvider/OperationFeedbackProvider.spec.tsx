import { act, render, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { OperationFeedbackProvider } from './index'

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
