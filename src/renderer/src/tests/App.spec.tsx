import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { LeaguesTree } from '@shared/tree'
import App from '../App'
import { makeLeague, makeTree } from './fixtures'
import { emitTreeChanged, installMockApi } from './mock-api'

function treeWithMondayLeagues(root = '/root', ...folderNames: string[]): LeaguesTree {
  const names = folderNames.length > 0 ? folderNames : ['Mixed triples']
  return makeTree({
    root,
    days: {
      ...makeTree().days,
      monday: names.map((folderName) =>
        makeLeague({ folderName, path: `${root}/monday/${folderName}` })
      )
    }
  })
}

function remember(root: string, day: string, folderName: string): string {
  const stored = JSON.stringify({ kind: 'league', day, folderName })
  localStorage.setItem(`leagues:${root}:selection`, stored)
  return stored
}

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
  expect(await screen.findByRole('button', { name: /select existing folder/i })).toBeInTheDocument()
})

it('restores the remembered league for the location after the first scan', async () => {
  remember('/root', 'monday', 'Trios')
  installMockApi({
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  })

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trios' })).toHaveAttribute('aria-current', 'true')
})

it('falls back to home when the remembered league is not where it was, keeping the memory', async () => {
  // Same folder name, but remembered under a different day than the tree has it.
  const stored = remember('/root', 'tuesday', 'Trios')
  installMockApi({
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  })

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')
  expect(localStorage.getItem('leagues:/root:selection')).toBe(stored)
})

it('remembers selections and returns to Home from the title bar', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs')) })
  const user = userEvent.setup()

  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Pairs' }))

  expect(localStorage.getItem('leagues:/root:selection')).toBe(
    JSON.stringify({ kind: 'league', day: 'monday', folderName: 'Pairs' })
  )

  const home = screen.getByRole('button', { name: 'Go home' })
  expect(home).not.toHaveAttribute('aria-current')
  await user.click(home)

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
  expect(home).toHaveAttribute('aria-current', 'page')
  expect(localStorage.getItem('leagues:/root:selection')).toBe(JSON.stringify({ kind: 'home' }))
})

it('drops the selection to home when the selected league disappears from a rescan', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
    .mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs'))
  installMockApi({ scan })
  const user = userEvent.setup()

  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Trios' }))
  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()

  act(() => emitTreeChanged())

  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')
})

it('switching location restores that location’s memory without touching the other’s', async () => {
  const storedA = remember('/a', 'monday', 'Pairs')
  remember('/b', 'monday', 'Trios')
  localStorage.setItem('leagues:/a:collapsed-days', JSON.stringify(['monday']))
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/a', 'Pairs'))
    .mockResolvedValue(treeWithMondayLeagues('/b', 'Trios'))
  installMockApi({ scan })

  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Pairs' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-expanded', 'false')

  act(() => emitTreeChanged())

  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-expanded', 'true')
  expect(localStorage.getItem('leagues:/a:selection')).toBe(storedA)
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
