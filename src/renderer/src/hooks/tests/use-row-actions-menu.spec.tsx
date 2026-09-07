import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useRowActionsMenu } from '../use-row-actions-menu'

it('does not reopen a removed target when it later reappears', () => {
  const { result, rerender } = renderHook(({ paths }) => useRowActionsMenu(paths), {
    initialProps: { paths: ['/one'] }
  })
  act(() => result.current.openAt('/one', { left: 1, top: 2 }, document.body))
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
  act(() => result.current.openAt('/one', { left: 1, top: 2 }, opener))
  await act(async () => {
    result.current.onOpenChange(false)
    editor.focus()
  })
  expect(editor).toHaveFocus()
  opener.remove()
  editor.remove()
})

it('ignores pre-existing dialogs but focuses a focusable descendant of a new dialog', () => {
  const { result } = renderHook(() => useRowActionsMenu(['/one']))
  const opener = document.createElement('button')
  const existing = document.createElement('div')
  existing.setAttribute('role', 'dialog')
  document.body.append(opener, existing)
  act(() => result.current.openAt('/one', { left: 1, top: 2 }, opener))
  result.current.restoreFocus()
  expect(opener).toHaveFocus()

  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  const editor = document.createElement('input')
  dialog.append(editor)
  document.body.append(dialog)
  result.current.restoreFocus()
  expect(editor).toHaveFocus()
  opener.remove()
  existing.remove()
  dialog.remove()
})
