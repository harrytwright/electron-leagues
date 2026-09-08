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

it('does not steal a newer outside focus target when closing', async () => {
  const { result } = renderHook(() => useRowActionsMenu(['/one']))
  const opener = document.createElement('button')
  const editor = document.createElement('input')
  document.body.append(opener, editor)
  act(() => result.current.openAt('/one', { left: 1, top: 2 }))
  await act(async () => {
    result.current.onOpenChange(false)
    editor.focus()
  })
  expect(editor).toHaveFocus()
  opener.remove()
  editor.remove()
})

it('closes without applying its own focus heuristic', () => {
  const { result } = renderHook(() => useRowActionsMenu(['/one']))
  const opener = document.createElement('button')
  const editor = document.createElement('input')
  document.body.append(opener, editor)
  act(() => result.current.openAt('/one', { left: 1, top: 2 }))
  editor.focus()
  act(() => result.current.onOpenChange(false))
  expect(editor).toHaveFocus()
  opener.remove()
  editor.remove()
})
