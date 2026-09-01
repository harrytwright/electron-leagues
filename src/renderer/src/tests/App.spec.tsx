import { act, render, screen } from '@testing-library/react'
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
