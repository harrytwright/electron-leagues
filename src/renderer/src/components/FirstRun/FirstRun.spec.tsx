import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { FirstRun } from './index'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

it('choosing an existing folder calls chooseRoot and onChosen on success', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue('/root') })
  const onChosen = vi.fn()
  const user = userEvent.setup()

  renderWithProviders(<FirstRun onChosen={onChosen} />)
  await user.click(screen.getByRole('button', { name: /open location/i }))

  expect(api.chooseRoot).toHaveBeenCalledWith('select')
  await waitFor(() => expect(onChosen).toHaveBeenCalled())
})

it('does not fire onChosen when the folder dialog is cancelled', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue(null) })
  const onChosen = vi.fn()
  const user = userEvent.setup()

  renderWithProviders(<FirstRun onChosen={onChosen} />)
  await user.click(screen.getByRole('button', { name: /new location/i }))

  expect(api.chooseRoot).toHaveBeenCalledWith('init')
  // Wait for the flow to settle (buttons re-enable) before asserting the negative,
  // otherwise the assertion races the pending promise and can never fail.
  await waitFor(() => expect(screen.getByRole('button', { name: /new location/i })).toBeEnabled())
  expect(onChosen).not.toHaveBeenCalled()
})

it('shows a busy state on the button that was pressed', async () => {
  let resolve!: (value: string | null) => void
  installMockApi({
    chooseRoot: vi.fn(
      () =>
        new Promise<string | null>((promiseResolve) => {
          resolve = promiseResolve
        })
    )
  })
  const user = userEvent.setup()

  renderWithProviders(<FirstRun onChosen={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /new location/i }))

  expect(screen.getByText(/creating…/i)).toBeInTheDocument()
  expect(screen.queryByText(/opening…/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /open location/i })).toBeDisabled()

  await act(async () => resolve(null))
  await waitFor(() => expect(screen.getByRole('button', { name: /open location/i })).toBeEnabled())
})

it('opens a recent location and waits for the resulting scan', async () => {
  const api = installMockApi({ recentRoots: vi.fn().mockResolvedValue(['/old/leagues']) })
  let finishScan!: () => void
  const onChosen = vi.fn(() => new Promise<void>((resolve) => (finishScan = resolve)))
  const user = userEvent.setup()
  renderWithProviders(<FirstRun onChosen={onChosen} />)

  await user.click(await screen.findByRole('button', { name: /leagues.*\/old\/leagues/i }))
  expect(api.setRoot).toHaveBeenCalledWith('/old/leagues')
  expect(screen.getByRole('button', { name: /open location/i })).toBeDisabled()
  await act(async () => finishScan())
  await waitFor(() => expect(screen.getByRole('button', { name: /open location/i })).toBeEnabled())
})

it('reports and removes a missing recent location inline', async () => {
  const recentRoots = vi.fn().mockResolvedValueOnce(['/gone/leagues']).mockResolvedValueOnce([])
  installMockApi({ recentRoots, setRoot: vi.fn().mockResolvedValue(null) })
  const user = userEvent.setup()
  renderWithProviders(<FirstRun onChosen={vi.fn()} />)

  await user.click(await screen.findByRole('button', { name: /leagues.*\/gone\/leagues/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('no longer available')
  await waitFor(() => expect(screen.queryByText('/gone/leagues')).not.toBeInTheDocument())
})

it('shows recent-list and picker failures inline while cancellation stays quiet', async () => {
  installMockApi({ recentRoots: vi.fn().mockRejectedValue(new Error('Recents unavailable')) })
  const view = renderWithProviders(<FirstRun onChosen={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Recents unavailable')

  installMockApi({
    recentRoots: vi.fn().mockResolvedValue([]),
    chooseRoot: vi.fn().mockRejectedValue(new Error('Picker unavailable'))
  })
  view.rerender(<FirstRun onChosen={vi.fn()} />)
  await userEvent.setup().click(screen.getByRole('button', { name: /open location/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Picker unavailable')
})

it('guards rapid recent activation synchronously', async () => {
  let finish!: (path: string | null) => void
  const setRoot = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)))
  installMockApi({ recentRoots: vi.fn().mockResolvedValue(['/old/leagues']), setRoot })
  renderWithProviders(<FirstRun onChosen={vi.fn()} />)
  const recent = await screen.findByRole('button', { name: /leagues.*\/old\/leagues/i })
  recent.click()
  recent.click()
  expect(setRoot).toHaveBeenCalledOnce()
  await act(async () => finish(null))
})
