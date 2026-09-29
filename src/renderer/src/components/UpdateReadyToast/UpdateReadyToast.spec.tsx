import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { renderWithProviders } from '../../tests/render-helpers'
import { emitAppUpdateChanged, installMockApi } from '../../tests/mock-api'
import { UpdateReadyToast } from './index'

function StartOperation(): React.JSX.Element {
  const { begin, activity, finish } = useOperationFeedback()
  return (
    <>
      <button onClick={() => begin('Importing')}>Start operation</button>
      <button onClick={() => activity && finish(activity.id)}>Finish operation</button>
    </>
  )
}

function renderToast(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <>
      <UpdateReadyToast />
      <StartOperation />
    </>
  )
}

/** Settles the query cache's cancel-then-set between updates so each status renders on its own. */
async function emit(status: Parameters<typeof emitAppUpdateChanged>[0]): Promise<void> {
  await act(async () => {
    emitAppUpdateChanged(status)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const ready = (version: string): Parameters<typeof emitAppUpdateChanged>[0] => ({
  version: '0.2.3',
  update: { kind: 'ready', version }
})

it('stays quiet until an update is ready', async () => {
  installMockApi()
  renderToast()
  await act(async () => {})
  await emit({ version: '0.2.3', update: { kind: 'checking' } })

  expect(screen.queryByText('Update ready')).not.toBeInTheDocument()
})

it('offers a persistent restart toast when the update is ready', async () => {
  installMockApi()
  renderToast()
  await act(async () => {})

  await emit(ready('0.2.4'))

  expect(await screen.findByText('Update ready')).toBeVisible()
  expect(
    screen.getByText('Version 0.2.4 is ready. Restart GoBowling Leagues to update.')
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Restart now' })).toBeEnabled()
})

it('restarts through the API from the toast', async () => {
  const api = installMockApi()
  renderToast()
  await act(async () => {})
  await emit(ready('0.2.4'))

  await userEvent.setup().click(await screen.findByRole('button', { name: 'Restart now' }))

  expect(api.installAppUpdate).toHaveBeenCalledOnce()
})

it('dismisses on Later and does not repeat the toast for the same version', async () => {
  const api = installMockApi()
  renderToast()
  await act(async () => {})
  await emit(ready('0.2.4'))
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Later' }))
  await waitFor(() => expect(screen.queryByText('Update ready')).not.toBeInTheDocument())
  expect(api.installAppUpdate).not.toHaveBeenCalled()

  await emit({ version: '0.2.3', update: { kind: 'checking' } })
  await emit(ready('0.2.4'))

  expect(screen.queryByText('Update ready')).not.toBeInTheDocument()
})

it('toasts again for a newer version', async () => {
  installMockApi()
  renderToast()
  await act(async () => {})
  await emit(ready('0.2.4'))
  await screen.findByText(/Version 0.2.4 is ready/)

  await emit(ready('0.2.5'))

  expect(await screen.findByText(/Version 0.2.5 is ready/)).toBeVisible()
})

it('removes the toast when the update stops being ready', async () => {
  installMockApi()
  renderToast()
  await act(async () => {})
  await emit(ready('0.2.4'))
  await screen.findByText('Update ready')

  await emit({ version: '0.2.3', update: { kind: 'idle' } })

  await waitFor(() => expect(screen.queryByText('Update ready')).not.toBeInTheDocument())
})

it('disables Restart now while a file operation runs and re-enables it afterwards', async () => {
  const api = installMockApi()
  renderToast()
  await act(async () => {})
  await emit(ready('0.2.4'))
  const user = userEvent.setup()
  await screen.findByRole('button', { name: 'Restart now' })

  await user.click(screen.getByRole('button', { name: 'Start operation' }))

  const restart = await screen.findByRole('button', { name: 'Restart now' })
  expect(restart).toBeDisabled()
  expect(
    within(document.body).getByText(
      'Version 0.2.4 is ready. Restart is unavailable while importing is running.'
    )
  ).toBeVisible()
  await user.click(restart)
  expect(api.installAppUpdate).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Finish operation' }))
  expect(await screen.findByRole('button', { name: 'Restart now' })).toBeEnabled()
})

it('reports when a file operation starts and finishes', async () => {
  const api = installMockApi()
  renderToast()
  await act(async () => {})
  expect(api.fileOperationRunningChanged).toHaveBeenLastCalledWith(false)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Start operation' }))
  expect(api.fileOperationRunningChanged).toHaveBeenLastCalledWith(true)

  await user.click(screen.getByRole('button', { name: 'Finish operation' }))
  expect(api.fileOperationRunningChanged).toHaveBeenLastCalledWith(false)
  expect(api.fileOperationRunningChanged).toHaveBeenCalledTimes(3)
})
