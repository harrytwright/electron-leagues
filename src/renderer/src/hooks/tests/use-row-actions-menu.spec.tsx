import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useRowActionsMenu } from '../use-row-actions-menu'

it('does not reopen a removed target when it later reappears', () => {
  const { result, rerender } = renderHook(({ paths }) => useRowActionsMenu(paths), {
    initialProps: { paths: ['/one'] }
  })
  act(() => result.current.openAt('/one', { left: 1, top: 2 }))
  expect(result.current.target).toBe('/one')
  rerender({ paths: [] })
  expect(result.current.target).toBeNull()
  rerender({ paths: ['/one'] })
  expect(result.current.target).toBeNull()
})
