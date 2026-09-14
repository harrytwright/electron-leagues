import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useKeyedState } from '../use-keyed-state'

it('keeps a value under its key and starts over when the key changes', () => {
  const { result, rerender } = renderHook(({ key }) => useKeyedState(key, ''), {
    initialProps: { key: '/a' }
  })

  act(() => result.current[1]('draft'))
  expect(result.current[0]).toBe('draft')

  rerender({ key: '/a' })
  expect(result.current[0]).toBe('draft')

  rerender({ key: '/b' })
  expect(result.current[0]).toBe('')

  rerender({ key: '/a' })
  expect(result.current[0]).toBe('')
})
