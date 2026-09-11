import { act, render, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  useOperationFeedback,
  type OperationFeedback
} from '@renderer/hooks/use-operation-feedback'
import { OperationFeedbackProvider } from './index'

function requireFeedback(value: OperationFeedback | null): OperationFeedback {
  if (!value) throw new Error('Feedback probe did not render')
  return value
}

it('shows the latest pending label and reveals older work as operations finish', () => {
  const { result } = renderHook(() => useOperationFeedback(), {
    wrapper: OperationFeedbackProvider
  })
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
  const view = render(
    <OperationFeedbackProvider locationKey="a">
      <Probe />
    </OperationFeedbackProvider>
  )
  let application = 0
  act(() => {
    requireFeedback(feedback).begin('Importing')
    application = requireFeedback(feedback).begin('Opening location', 'application')
  })

  view.rerender(
    <OperationFeedbackProvider locationKey="b">
      <Probe />
    </OperationFeedbackProvider>
  )

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

it('throws when the hook is used outside the provider', () => {
  expect(() => renderHook(() => useOperationFeedback())).toThrow(
    'useOperationFeedback must be used inside OperationFeedbackProvider'
  )
})
