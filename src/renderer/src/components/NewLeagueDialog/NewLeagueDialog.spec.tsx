import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi, type Mock } from 'vitest'
import { NewLeagueDialog, type NewLeagueDialogProps } from './index'
import { installMockApi, type RendererApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

interface DialogHarness {
  onCreated: Mock<NewLeagueDialogProps['onCreated']>
  onOpenChange: Mock<NewLeagueDialogProps['onOpenChange']>
  view: ReturnType<typeof renderWithProviders>
}

function renderDialog(props: Partial<NewLeagueDialogProps> = {}): DialogHarness {
  const onCreated = vi.fn<NewLeagueDialogProps['onCreated']>()
  const onOpenChange = vi.fn<NewLeagueDialogProps['onOpenChange']>()
  const view = renderWithProviders(
    <NewLeagueDialog open onOpenChange={onOpenChange} onCreated={onCreated} {...props} />
  )
  return { onCreated, onOpenChange, view }
}

it('is a real dialog with a form that submits on Enter', async () => {
  const api = installMockApi()
  const { onCreated } = renderDialog()
  const user = userEvent.setup()

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByLabelText(/league night/i)).toBeInTheDocument()
  await user.type(screen.getByLabelText(/league name/i), 'Mixed doubles{Enter}')

  expect(api.createLeague).toHaveBeenCalledWith('monday', 'Mixed doubles')
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('monday', 'Mixed doubles'))
})

it('submits the selected league night', async () => {
  const api = installMockApi()
  renderDialog()
  const user = userEvent.setup()

  await user.click(screen.getByLabelText(/league night/i))
  await user.click(await screen.findByRole('option', { name: 'Tuesday' }))
  await user.type(screen.getByLabelText(/league name/i), 'Tuesday triples{Enter}')

  expect(api.createLeague).toHaveBeenCalledWith('tuesday', 'Tuesday triples')
})

it('provides the required input attributes and placeholder', () => {
  installMockApi()
  renderDialog()

  expect(screen.getByLabelText(/league name/i)).toHaveAttribute('name', 'league-name')
  expect(screen.getByLabelText(/league name/i)).toHaveAttribute('autocomplete', 'off')
  expect(screen.getByPlaceholderText('e.g. Monday Trios')).toBeInTheDocument()
})

it('shows the sanitised folder hint when it differs', async () => {
  const api = installMockApi()
  const { onCreated } = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Mens: Triples{Enter}')

  expect(screen.getByText(/folder will be named/i)).toHaveTextContent(
    'Folder will be named “Mens Triples”'
  )
  expect(api.createLeague).toHaveBeenCalledWith('monday', 'Mens: Triples')
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('monday', 'Mens Triples'))
})

it('surfaces createLeague failure inline, focuses the name, and keeps the dialog open', async () => {
  installMockApi({ createLeague: vi.fn().mockRejectedValue(new Error('exists already')) })
  const { onOpenChange } = renderDialog()
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/league name/i)

  await user.type(nameInput, 'Trios{Enter}')

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('exists already')
  expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  expect(nameInput).toHaveAttribute('aria-describedby', alert.id)
  expect(nameInput).toHaveFocus()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

it('reports an unusable folder name inline and focuses the name', async () => {
  const api = installMockApi()
  renderDialog()
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/league name/i)

  await user.type(nameInput, '***{Enter}')

  expect(screen.getByRole('alert')).toHaveTextContent(
    'That name cannot be used as a folder name — try letters and numbers'
  )
  expect(nameInput).toHaveFocus()
  expect(api.createLeague).not.toHaveBeenCalled()
})

it('resets its fields and errors each time it opens', async () => {
  installMockApi({ createLeague: vi.fn().mockRejectedValue(new Error('stale error')) })
  const { view } = renderDialog()
  const user = userEvent.setup()

  await user.click(screen.getByLabelText(/league night/i))
  await user.click(await screen.findByRole('option', { name: 'Friday' }))
  await user.type(screen.getByLabelText(/league name/i), 'Stale text{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('stale error')

  view.rerender(<NewLeagueDialog open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />)
  view.rerender(<NewLeagueDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

  expect(screen.getByLabelText(/league name/i)).toHaveValue('')
  expect(screen.getByLabelText(/league night/i)).toHaveTextContent('Monday')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('disables submit while the name is empty and while creation is pending', async () => {
  let resolve!: (value: string) => void
  const createLeague = vi.fn<RendererApi['createLeague']>(
    () =>
      new Promise<string>((promiseResolve) => {
        resolve = promiseResolve
      })
  )
  installMockApi({ createLeague })
  renderDialog()
  const user = userEvent.setup()
  const submit = screen.getByRole('button', { name: /create league/i })

  expect(submit).toBeDisabled()
  await user.type(screen.getByLabelText(/league name/i), 'Pairs{Enter}')
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

  await act(async () => resolve('/root/monday/Pairs'))
})

it('navigates to the folder name main actually created, not the local guess', async () => {
  installMockApi({ createLeague: vi.fn().mockResolvedValue('/root/monday/Pairs (2)') })
  const { onCreated } = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Pairs{Enter}')

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('monday', 'Pairs (2)'))
})

it('submits only once while a create is pending', async () => {
  let resolve!: (value: string) => void
  const createLeague = vi.fn<RendererApi['createLeague']>(
    () => new Promise<string>((promiseResolve) => (resolve = promiseResolve))
  )
  installMockApi({ createLeague })
  renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Pairs{Enter}{Enter}{Enter}')

  expect(createLeague).toHaveBeenCalledTimes(1)
  await act(async () => resolve('/root/monday/Pairs'))
})

it('refuses to dismiss while a create is pending', async () => {
  let resolve!: (value: string) => void
  installMockApi({
    createLeague: vi.fn(() => new Promise<string>((promiseResolve) => (resolve = promiseResolve)))
  })
  const { onOpenChange } = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Pairs{Enter}')
  await user.keyboard('{Escape}')

  expect(onOpenChange).not.toHaveBeenCalledWith(false)
  expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  await act(async () => resolve('/root/monday/Pairs'))
})

it('ignores the outcome of a create left pending across close and reopen', async () => {
  let reject!: (reason: Error) => void
  installMockApi({
    createLeague: vi.fn(
      () => new Promise<string>((_resolve, promiseReject) => (reject = promiseReject))
    )
  })
  const { view, onCreated } = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Pairs{Enter}')

  view.rerender(<NewLeagueDialog open={false} onOpenChange={vi.fn()} onCreated={onCreated} />)
  view.rerender(<NewLeagueDialog open onOpenChange={vi.fn()} onCreated={onCreated} />)
  await act(async () => reject(new Error('stale failure')))

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(onCreated).not.toHaveBeenCalled()
})

it('clears the error as soon as the name is edited', async () => {
  installMockApi({ createLeague: vi.fn().mockRejectedValue(new Error('exists already')) })
  renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/league name/i), 'Trios{Enter}')
  await screen.findByRole('alert')

  await user.type(screen.getByLabelText(/league name/i), ' B')

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
