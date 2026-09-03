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
  await user.click(screen.getByRole('button', { name: /select existing folder/i }))

  expect(api.chooseRoot).toHaveBeenCalledWith('select')
  await waitFor(() => expect(onChosen).toHaveBeenCalled())
})

it('does not fire onChosen when the folder dialog is cancelled', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue(null) })
  const onChosen = vi.fn()
  const user = userEvent.setup()

  renderWithProviders(<FirstRun onChosen={onChosen} />)
  await user.click(screen.getByRole('button', { name: /initialise new folder/i }))

  expect(api.chooseRoot).toHaveBeenCalledWith('init')
  // Wait for the flow to settle (buttons re-enable) before asserting the negative,
  // otherwise the assertion races the pending promise and can never fail.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /initialise new folder/i })).toBeEnabled()
  )
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
  await user.click(screen.getByRole('button', { name: /initialise new folder/i }))

  expect(screen.getByText(/initialising…/i)).toBeInTheDocument()
  expect(screen.queryByText(/opening…/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /select existing folder/i })).toBeDisabled()

  await act(async () => resolve(null))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /select existing folder/i })).toBeEnabled()
  )
})
