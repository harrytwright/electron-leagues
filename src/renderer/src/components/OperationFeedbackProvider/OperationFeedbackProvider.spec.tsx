import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  useOperationFeedback,
  type OperationFeedback
} from '@renderer/hooks/use-operation-feedback'
import { renderHookWithProviders, renderWithProviders } from '../../tests/render-helpers'

function requireFeedback(value: OperationFeedback | null): OperationFeedback {
  if (!value) throw new Error('Feedback probe did not render')
  return value
}

it('shows the latest pending label and reveals older work as operations finish', () => {
  const { result } = renderHookWithProviders(() => useOperationFeedback())
  let older = 0
  let newer = 0
  act(() => {
    older = result.current.begin('Importing')
    newer = result.current.begin('Zipping')
  })
  expect(result.current.activity).toMatchObject({ id: newer, label: 'Zipping' })

  act(() => result.current.finish(newer))
  expect(result.current.activity).toMatchObject({ id: older, label: 'Importing' })

  act(() => result.current.finish(older))
  expect(result.current.activity).toBeNull()
})

it('drops location work but keeps application work when the location changes', () => {
  let feedback: OperationFeedback | null = null
  function Probe(): null {
    feedback = useOperationFeedback()
    return null
  }
  const options = { locationKey: 'a' }
  const view = renderWithProviders(<Probe />, options)
  let application = 0
  act(() => {
    requireFeedback(feedback).begin('Importing')
    application = requireFeedback(feedback).begin('Opening location', 'application')
  })

  // Update the original options so the retained wrapper changes location in place.
  options.locationKey = 'b'
  view.rerender(<Probe />)

  expect(requireFeedback(feedback).activity).toMatchObject({
    id: application,
    label: 'Opening location'
  })
  act(() => requireFeedback(feedback).finish(application))
  expect(requireFeedback(feedback).activity).toBeNull()
})

it('keeps the context value stable across an unrelated provider rerender', () => {
  const values: OperationFeedback[] = []
  function Probe(): null {
    values.push(useOperationFeedback())
    return null
  }
  const options = { locationKey: 'a' }
  const view = renderWithProviders(<Probe />, options)
  const first = values.at(-1)
  view.rerender(<Probe />)
  expect(values.at(-1)).toBe(first)
})

it('preserves hook provider state across prop rerenders and updates its location in place', () => {
  const options = { locationKey: 'a', initialProps: { label: 'First' } }
  const { result, rerender } = renderHookWithProviders(
    ({ label }) => ({ label, feedback: useOperationFeedback() }),
    options
  )
  let application = 0
  let location = 0
  act(() => {
    application = result.current.feedback.begin('Opening location', 'application')
    location = result.current.feedback.begin('Importing')
  })
  const feedback = result.current.feedback

  rerender({ label: 'Second' })
  expect(result.current.label).toBe('Second')
  expect(result.current.feedback).toBe(feedback)
  expect(result.current.feedback.activity).toMatchObject({ id: location, label: 'Importing' })

  options.locationKey = 'b'
  rerender({ label: 'Third' })
  expect(result.current.label).toBe('Third')
  expect(result.current.feedback.activity).toMatchObject({
    id: application,
    label: 'Opening location'
  })
  act(() => result.current.feedback.finish(application))
  expect(result.current.feedback.activity).toBeNull()
})

it('throws when the hook is used outside the provider', () => {
  // Intentionally omit providers to verify the hook's missing-provider error.
  expect(() => renderHook(() => useOperationFeedback())).toThrow(
    'useOperationFeedback must be used inside OperationFeedbackProvider'
  )
})
