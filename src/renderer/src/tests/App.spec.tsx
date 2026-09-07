import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { LeaguesTree } from '@shared/tree'
import App from '../App'
import { makeDirEntry, makeLeague, makeTree } from './fixtures'
import { emitAppCommand, emitTreeChanged, installMockApi } from './mock-api'

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

it('shows Home on Shared documents and reports that directory in the status bar', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(makeTree()) })

  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  const status = screen.getByRole('contentinfo', { name: 'Application status' })
  const contentRow = screen.getByRole('main').parentElement
  expect(contentRow).toContainElement(screen.getByRole('navigation', { name: 'Leagues' }))
  expect(contentRow?.nextElementSibling).toBe(status)
  expect(within(status).getByTitle('/root/_shared')).toHaveTextContent('/root/_shared')
})

it('routes application commands to the visible browser and location control', async () => {
  const scan = vi.fn().mockResolvedValue(makeTree())
  const api = installMockApi({ scan })
  render(<App />)
  await screen.findByRole('heading', { name: 'Home' })

  act(() => emitAppCommand({ command: 'focus-filter', repeat: false, composing: false }))
  const filter = screen.getByRole('textbox', { name: 'Filter loaded files' })
  expect(filter).toHaveFocus()
  filter.blur()

  const listCalls = vi.mocked(api.listDir).mock.calls.length
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  await waitFor(() => expect(api.listDir).toHaveBeenCalledTimes(listCalls + 1))
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  expect(api.chooseRoot).toHaveBeenCalledExactlyOnceWith('select')
})

it('updates the status path from the location root through league navigation', async () => {
  const leaguePath = '/root/monday/Pairs'
  const seasonPath = `${leaguePath}/2025-26`
  const weekPath = `${seasonPath}/Week 1`
  installMockApi({
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios')),
    listDir: vi.fn((path: string) =>
      Promise.resolve(
        path === seasonPath
          ? [makeDirEntry({ name: 'Week 1', kind: 'folder', path: weekPath })]
          : []
      )
    )
  })
  const user = userEvent.setup()

  render(<App />)

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  expect(within(status).getByTitle('/root/_shared')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Pairs' }))
  expect(within(status).getByTitle(leaguePath)).toBeInTheDocument()

  await user.dblClick(screen.getByRole('row', { name: '2025-26' }))
  expect(within(status).getByTitle(seasonPath)).toBeInTheDocument()

  await user.dblClick(await screen.findByRole('row', { name: 'Week 1' }))
  expect(within(status).getByTitle(weekPath)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Trios' }))
  expect(within(status).getByTitle('/root/monday/Trios')).toBeInTheDocument()
})

it('tracks Home tabs and resets Home to Shared documents after league navigation', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs')) })
  const user = userEvent.setup()

  render(<App />)

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  expect(within(status).getByTitle('/root/_templates')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Pairs' }))
  expect(within(status).getByTitle('/root/monday/Pairs')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Go home' }))

  expect(await screen.findByRole('tab', { name: 'Shared documents' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(within(status).getByTitle('/root/_shared')).toBeInTheDocument()
})

it('keeps the current Home pane and status in sync on a redundant Home click', async () => {
  const folder = makeDirEntry({ name: 'Admin', kind: 'folder', path: '/root/_templates/Admin' })
  installMockApi({
    scan: vi.fn().mockResolvedValue(makeTree()),
    listDir: vi.fn((dir: string) => Promise.resolve(dir === '/root/_templates' ? [folder] : []))
  })
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByRole('tab', { name: 'Templates' }))
  await user.dblClick(await screen.findByRole('row', { name: 'Admin' }))
  await user.click(screen.getByRole('button', { name: 'Go home' }))

  expect(screen.getByRole('tab', { name: 'Templates' })).toHaveAttribute('aria-selected', 'true')
  const status = screen.getByRole('contentinfo', { name: 'Application status' })
  expect(within(status).getByTitle(folder.path)).toBeInTheDocument()
  expect(await screen.findByRole('treegrid', { name: 'Admin' })).toBeInTheDocument()
})

it('resets Home and its status directory when the location changes', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(
      makeTree({ root: '/a', templatesPath: '/a/_templates', sharedPath: '/a/_shared' })
    )
    .mockResolvedValue(
      makeTree({
        root: '/b',
        templatesPath: '/b/_templates',
        sharedPath: '/b/_shared'
      })
    )
  installMockApi({ scan })
  const user = userEvent.setup()

  render(<App />)

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  expect(within(status).getByTitle('/a/_templates')).toBeInTheDocument()

  act(() => emitTreeChanged())

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Shared documents' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(within(status).getByTitle('/b/_shared')).toBeInTheDocument()
  })
})

it('rescans when the tree changes on disk', async () => {
  const scan = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(makeTree())
  installMockApi({ scan })

  render(<App />)
  expect(await screen.findByRole('button', { name: /select existing folder/i })).toBeInTheDocument()

  act(() => emitTreeChanged())

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
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

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
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
