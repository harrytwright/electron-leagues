import { act, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DeleteResourceDialog, type DeleteTarget } from './index'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'
import { trashLabel } from '../../lib/trash-label'
import { useOperationFeedback } from '../../hooks/use-operation-feedback'
import { createQueryClient } from '../../lib/query-client'
import { ROOT_QUERY_KEY } from '../../queries/root'
import { treeQuery, treeQueryKey } from '../../queries/tree'
import { makeTree } from '../../tests/fixtures'

const TARGET: DeleteTarget = {
  kind: 'season',
  name: '2024-25',
  path: '/root/monday/League/2024-25'
}

function FeedbackStatus(): React.JSX.Element {
  const { activity } = useOperationFeedback()
  return (
    <span role="status" aria-label="Operation feedback">
      {activity?.label ?? null}
    </span>
  )
}

function ActiveTree(): null {
  useQuery(treeQuery('/root'))
  return null
}

function renderDeleteWithActiveTree(onOpenChange = vi.fn()): void {
  const queryClient = createQueryClient()
  queryClient.setQueryData(ROOT_QUERY_KEY, '/root')
  queryClient.setQueryData(treeQueryKey('/root'), makeTree())
  renderWithProviders(
    <>
      <ActiveTree />
      <DeleteResourceDialog target={TARGET} open onOpenChange={onOpenChange} />
      <FeedbackStatus />
    </>,
    { queryClient }
  )
}

it('enables deletion only once the exact name is typed', async () => {
  const api = installMockApi({ scan: vi.fn().mockResolvedValue(makeTree()) })
  const user = userEvent.setup()
  renderDeleteWithActiveTree()
  const confirm = screen.getByRole('button', { name: 'Delete season' })
  const input = screen.getByLabelText('Type 2024-25 to confirm')

  await user.type(input, '2024-2')
  expect(confirm).toBeDisabled()
  await user.type(input, '5')
  expect(confirm).toBeEnabled()

  await user.click(confirm)

  expect(api.trashFolder).toHaveBeenCalledWith(TARGET.path)
  expect(await screen.findByText(/Moved “2024-25” to the/)).toBeInTheDocument()
  expect(api.scan).toHaveBeenCalledOnce()
})

it('forgives surrounding whitespace and Unicode normalisation differences', async () => {
  installMockApi()
  const user = userEvent.setup()
  const cafe: DeleteTarget = {
    kind: 'league',
    name: ' Café league ',
    path: '/root/monday/Café league'
  }
  renderWithProviders(<DeleteResourceDialog target={cafe} open onOpenChange={vi.fn()} />)

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
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<DeleteResourceDialog target={TARGET} open onOpenChange={onOpenChange} />)

  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))

  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('That folder no longer exists')
  const input = screen.getByLabelText('Type 2024-25 to confirm')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAttribute('aria-describedby', error.id)
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(window.api.scan).not.toHaveBeenCalled()
})

it('stays pending through refresh and reports both a successful move and refresh failure inline', async () => {
  let failRefresh!: () => void
  const api = installMockApi({
    scan: vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof window.api.scan>>>((_resolve, reject) => {
          failRefresh = () => reject(new Error('Scan failed'))
        })
    )
  })
  const user = userEvent.setup()
  renderDeleteWithActiveTree()

  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  await waitFor(() => expect(api.scan).toHaveBeenCalledOnce())
  expect(screen.getByText('Deleting 2024-25')).toBeInTheDocument()

  await act(async () => failRefresh())
  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent(
    `Moved “2024-25” to the ${trashLabel()}, but the folder could not be refreshed: Scan failed`
  )
  const input = screen.getByLabelText('Type 2024-25 to confirm')
  expect(input).toHaveFocus()
  expect(input).toHaveAttribute('readonly')
  expect(input).not.toBeDisabled()
  expect(screen.getByRole('button', { name: `Moved to ${trashLabel()}` })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: `Moved to ${trashLabel()}` }))
  expect(api.trashFolder).toHaveBeenCalledOnce()
  expect(screen.queryByText('Deleting 2024-25')).not.toBeInTheDocument()
  expect(screen.getAllByText(/Moved “2024-25” to the/)).toHaveLength(1)
})

it('starts clean each time it opens', async () => {
  installMockApi()
  const user = userEvent.setup()
  const view = renderWithProviders(
    <>
      <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )

  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  view.rerender(
    <>
      <DeleteResourceDialog target={TARGET} open={false} onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )
  view.rerender(
    <>
      <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
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
  const view = renderWithProviders(
    <>
      <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )
  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  expect(screen.getByText('Deleting 2024-25')).toBeInTheDocument()

  view.rerender(
    <>
      <DeleteResourceDialog target={TARGET} open={false} onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )
  await act(async () => finishTrash())
  expect(screen.queryByText('Deleting 2024-25')).not.toBeInTheDocument()
  expect(await screen.findByText(/Moved “2024-25” to the/)).toBeInTheDocument()
})

it('names a stale failed delete after the dialog closes and reopens for another target', async () => {
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
  const view = renderWithProviders(
    <>
      <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )
  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  view.rerender(
    <>
      <DeleteResourceDialog target={TARGET} open={false} onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )

  const replacement: DeleteTarget = {
    kind: 'season',
    name: '2025-26',
    path: '/root/monday/League/2025-26'
  }
  view.rerender(
    <>
      <DeleteResourceDialog target={replacement} open onOpenChange={vi.fn()} />
      <FeedbackStatus />
    </>
  )

  await act(async () => failTrash())
  expect(await screen.findByText(`Couldn’t delete “2024-25”: Delete failed`)).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Delete season “2025-26”' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByText('Deleting 2024-25')).not.toBeInTheDocument()
})

it('reports a failed delete after the dialog component unmounts', async () => {
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
  const shell = (show: boolean): React.JSX.Element => (
    <>
      {show ? <DeleteResourceDialog target={TARGET} open onOpenChange={vi.fn()} /> : null}
      <FeedbackStatus />
    </>
  )
  const view = renderWithProviders(shell(true))
  await user.type(screen.getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(screen.getByRole('button', { name: 'Delete season' }))
  view.rerender(shell(false))

  await act(async () => failTrash())
  expect(await screen.findByText(`Couldn’t delete “2024-25”: Delete failed`)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
