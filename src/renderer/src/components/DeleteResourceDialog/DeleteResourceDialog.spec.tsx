import { act, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@cloudflare/kumo'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DeleteResourceDialog, type DeleteTarget } from './index'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'
import { OperationFeedbackProvider } from '../OperationFeedbackProvider'
import { useOperationFeedback } from '../../hooks/use-operation-feedback'

const TARGET: DeleteTarget = {
  kind: 'season',
  name: '2024-25',
  path: '/root/monday/League/2024-25'
}

function FeedbackStatus(): React.JSX.Element {
  const { activity } = useOperationFeedback()
  return <span role="status">{activity?.state === 'pending' ? activity.label : null}</span>
}

it('enables deletion only once the exact name is typed', async () => {
  const api = installMockApi()
  const onDeleted = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} onDeleted={onDeleted} />
  )
  const confirm = screen.getByRole('button', { name: 'Delete season' })
  const input = screen.getByLabelText('Type 2024-25 to confirm')

  await user.type(input, '2024-2')
  expect(confirm).toBeDisabled()
  await user.type(input, '5')
  expect(confirm).toBeEnabled()

  await user.click(confirm)

  expect(api.trashFolder).toHaveBeenCalledWith(TARGET.path)
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(TARGET))
})

it('forgives surrounding whitespace and Unicode normalisation differences', async () => {
  installMockApi()
  const user = userEvent.setup()
  const cafe: DeleteTarget = {
    kind: 'league',
    name: ' Café league ',
    path: '/root/monday/Café league'
  }
  renderWithProviders(
    <DeleteResourceDialog target={cafe} open onOpenChange={vi.fn()} onDeleted={vi.fn()} />
  )

  await user.type(screen.getByRole('textbox'), 'Café league')

  expect(screen.getByRole('button', { name: 'Delete league' })).toBeEnabled()
})

it('tells the user about archived seasons when a league has some', () => {
  installMockApi()
  const view = renderWithProviders(
    <DeleteResourceDialog
      target={{ kind: 'league', name: 'Pairs', path: '/root/monday/Pairs', hasArchives: true }}
      open
      onOpenChange={vi.fn()}
      onDeleted={vi.fn()}
    />
  )
  expect(screen.getByRole('dialog', { name: 'Delete league “Pairs”' })).toHaveTextContent(
    'Its archived seasons in _archives move too.'
  )

  view.rerender(
    <DeleteResourceDialog
      target={{ kind: 'league', name: 'Pairs', path: '/root/monday/Pairs' }}
      open
      onOpenChange={vi.fn()}
      onDeleted={vi.fn()}
    />
  )
  expect(screen.getByRole('dialog')).not.toHaveTextContent('archived seasons')
})

it('keeps the dialog open and reports the error when trashing fails', async () => {
  installMockApi({
    trashFolder: vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'folder:trash': Error: That folder no longer exists"
        )
      )
  })
  const onDeleted = vi.fn()
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <DeleteResourceDialog target={TARGET} open onOpenChange={onOpenChange} onDeleted={onDeleted} />
  )

  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))

  expect(
    await screen.findByRole('dialog', { name: 'That folder no longer exists' })
  ).toBeInTheDocument()
  expect(onDeleted).not.toHaveBeenCalled()
  expect(onOpenChange).not.toHaveBeenCalled()
})

it('starts clean each time it opens', async () => {
  installMockApi()
  const user = userEvent.setup()
  const view = render(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} onDeleted={vi.fn()} />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )

  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  view.rerender(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog
          target={TARGET}
          open={false}
          onOpenChange={vi.fn()}
          onDeleted={vi.fn()}
        />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )
  view.rerender(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} onDeleted={vi.fn()} />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )

  expect(screen.getByLabelText('Type 2024-25 to confirm')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Delete season' })).toBeDisabled()
})

it('keeps deletion pending until trashing settles and finishes after the dialog closes', async () => {
  let finishTrash!: () => void
  installMockApi({
    trashFolder: vi.fn(() => new Promise<void>((resolve) => (finishTrash = resolve)))
  })
  const user = userEvent.setup()
  const onDeleted = vi.fn()
  const view = render(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} onDeleted={onDeleted} />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )
  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  expect(screen.getByText('Deleting 2024-25')).toBeInTheDocument()

  view.rerender(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog
          target={TARGET}
          open={false}
          onOpenChange={vi.fn()}
          onDeleted={onDeleted}
        />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )
  await act(async () => finishTrash())
  expect(screen.queryByText('Deleting 2024-25')).not.toBeInTheDocument()
  expect(await screen.findByText(/Moved “2024-25” to the/)).toBeInTheDocument()
  expect(onDeleted).not.toHaveBeenCalled()
})

it('reports a failed delete after the dialog closes without applying stale dialog state', async () => {
  let failTrash!: () => void
  installMockApi({
    trashFolder: vi.fn(
      () =>
        new Promise<void>(
          (_resolve, reject) => (failTrash = () => reject(new Error('Delete failed')))
        )
    )
  })
  const user = userEvent.setup()
  const onDeleted = vi.fn()
  const view = render(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} onDeleted={onDeleted} />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )
  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  view.rerender(
    <ToastProvider>
      <OperationFeedbackProvider>
        <DeleteResourceDialog
          target={TARGET}
          open={false}
          onOpenChange={vi.fn()}
          onDeleted={onDeleted}
        />
        <FeedbackStatus />
      </OperationFeedbackProvider>
    </ToastProvider>
  )

  await act(async () => failTrash())
  expect(await screen.findByText('Delete failed')).toBeInTheDocument()
  expect(screen.queryByText('Deleting 2024-25')).not.toBeInTheDocument()
  expect(onDeleted).not.toHaveBeenCalled()
})
