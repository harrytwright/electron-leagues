import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import App from '../App'
import { makeTree } from './fixtures'
import { emitTreeChanged, installMockApi } from './mock-api'

it('shows loading, then FirstRun when scan returns null', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(null) })

  render(<App />)

  expect(screen.getByText(/loading…/i)).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /select existing folder/i })).toBeInTheDocument()
  expect(screen.queryByText(/loading…/i)).not.toBeInTheDocument()
})

it('shows the shared view when scan returns a tree', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(makeTree()) })

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
})

it('rescans when the tree changes on disk', async () => {
  const scan = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(makeTree())
  installMockApi({ scan })

  render(<App />)
  expect(await screen.findByRole('button', { name: /select existing folder/i })).toBeInTheDocument()

  act(() => emitTreeChanged())

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
})

it('shows a recoverable error when the scan fails, and retries', async () => {
  const scan = vi
    .fn()
    .mockRejectedValueOnce(new Error("Error invoking remote method 'leagues:scan': Error: EPERM"))
    .mockResolvedValue(makeTree())
  installMockApi({ scan })
  const user = userEvent.setup()

  render(<App />)

  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(screen.getByText('EPERM')).toBeInTheDocument()
  expect(screen.queryByText(/loading…/i)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
  expect(scan).toHaveBeenCalledTimes(2)
})

it('keeps offering retry when the rescan fails again', async () => {
  const scan = vi.fn().mockRejectedValue(new Error('still broken'))
  installMockApi({ scan })
  const user = userEvent.setup()

  render(<App />)

  await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(scan).toHaveBeenCalledTimes(2)
  expect(
    screen.getByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
})

it('escapes a broken folder by choosing another', async () => {
  const scan = vi.fn().mockRejectedValue(new Error('unreadable'))
  const api = installMockApi({ scan })
  const user = userEvent.setup()

  render(<App />)

  await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  await user.click(screen.getByRole('button', { name: 'Choose another folder' }))

  expect(api.forgetRoot).toHaveBeenCalled()
  expect(
    await screen.findByRole('button', { name: /select existing folder/i })
  ).toBeInTheDocument()
})

it('unsubscribes from tree changes on unmount', async () => {
  const unsubscribe = vi.fn()
  installMockApi({
    scan: vi.fn().mockResolvedValue(null),
    onTreeChanged: vi.fn(() => unsubscribe)
  })

  const { unmount } = render(<App />)
  await screen.findByRole('button', { name: /select existing folder/i })

  unmount()
  expect(unsubscribe).toHaveBeenCalled()
})
