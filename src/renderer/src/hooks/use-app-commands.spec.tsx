import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { emitAppCommand, installMockApi } from '../tests/mock-api'
import { useAppCommandHandler, useAppCommands } from './use-app-commands'

function Harness({ refresh }: { refresh: () => void }): React.JSX.Element {
  useAppCommands()
  useAppCommandHandler('refresh', refresh)
  return <input aria-label="Editor" />
}

it('dispatches once and guards repeat, composition, editables and overlays', () => {
  installMockApi()
  const refresh = vi.fn()
  render(<Harness refresh={refresh} />)
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).toHaveBeenCalledOnce()

  act(() => emitAppCommand({ command: 'refresh', repeat: true, composing: false }))
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: true }))
  screen.getByRole('textbox').focus()
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  screen.getByRole('textbox').blur()
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  document.body.append(menu)
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  menu.remove()
  expect(refresh).toHaveBeenCalledOnce()
})

it('removes both the command handler and IPC subscription on unmount', () => {
  const api = installMockApi()
  const refresh = vi.fn()
  const view = render(<Harness refresh={refresh} />)
  view.unmount()
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).not.toHaveBeenCalled()
  expect(api.onAppCommand).toHaveBeenCalledOnce()
})
