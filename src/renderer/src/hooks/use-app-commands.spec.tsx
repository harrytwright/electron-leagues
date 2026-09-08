import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Button, Dialog, ToastProvider, useKumoToastManager } from '@cloudflare/kumo'
import { emitAppCommand, installMockApi } from '../tests/mock-api'
import { useAppCommandHandler, useAppCommands } from './use-app-commands'

function Harness({ refresh }: { refresh: () => void }): React.JSX.Element {
  useAppCommands()
  useAppCommandHandler('refresh', refresh)
  return <input aria-label="Editor" />
}

function ToastHarness({ refresh }: { refresh: () => void }): React.JSX.Element {
  const { add } = useKumoToastManager()
  return (
    <>
      <Harness refresh={refresh} />
      <Button onClick={() => add({ title: 'Saved' })}>Show toast</Button>
    </>
  )
}

it('dispatches once and guards repeat, composition and overlays', () => {
  installMockApi()
  const refresh = vi.fn()
  render(<Harness refresh={refresh} />)
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).toHaveBeenCalledOnce()

  act(() => emitAppCommand({ command: 'refresh', repeat: true, composing: false }))
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: true }))
  screen.getByRole('textbox').focus()
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).toHaveBeenCalledTimes(2)
  screen.getByRole('textbox').blur()
  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  document.body.append(menu)
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  menu.remove()
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('does not let a non-modal Kumo toast block commands', async () => {
  installMockApi()
  const refresh = vi.fn()
  render(
    <ToastProvider>
      <ToastHarness refresh={refresh} />
    </ToastProvider>
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Show toast' }))
  const toast = await screen.findByRole('dialog')
  expect(toast).toHaveAttribute('aria-modal', 'false')

  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).toHaveBeenCalledOnce()
})

it('blocks commands while an actual modal Kumo dialog is open', () => {
  installMockApi()
  const refresh = vi.fn()
  render(
    <>
      <Harness refresh={refresh} />
      <Dialog.Root open>
        <Dialog className="app-modal">
          <Dialog.Title>Settings</Dialog.Title>
        </Dialog>
      </Dialog.Root>
    </>
  )
  expect(screen.getByRole('dialog', { name: 'Settings' })).toHaveClass('app-modal')

  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  expect(refresh).not.toHaveBeenCalled()
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
