import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PERMISSION_DENIED_MESSAGE } from '@shared/fs-messages'
import type { LeaguesTree } from '@shared/tree'
import App from '../App'
import { createQueryClient } from '../lib/query-client'
import { registerTestQueryClient } from './query-clients'
import {
  createWorkspaceStore,
  type WorkspaceStore,
  type WorkspaceLocation
} from '../lib/workspace-store'
import { createLocalStorageWorkspaceStorage } from './local-storage-workspace-storage'
import { parseWorkspaceEnvelope } from './workspace-envelope'
import { trashLabel } from '../lib/os-labels'
import { makeDirEntry, makeLeague, makeTree } from './fixtures'
import {
  emitAppCommand,
  emitTreeChanged,
  installMockApi,
  treeChangedListenerCount,
  type RendererApi
} from './mock-api'
import { pretendPlatform } from './mock-platform'

const KUMO_EMPHASIS_CLASS = 'bg-(--kumo-button-emphasis-bg)'

function expectEmphasised(button: HTMLElement, emphasised: boolean): void {
  if (emphasised) {
    expect(button).toHaveClass(KUMO_EMPHASIS_CLASS)
  } else {
    expect(button).not.toHaveClass(KUMO_EMPHASIS_CLASS)
  }
}

function renderApp(): RenderResult & { workspaceStore: WorkspaceStore } {
  const queryClient = registerTestQueryClient(createQueryClient())
  // Real localStorage, like production, so legacy-key fixtures migrate and persistence
  // assertions can read the browser storage.
  const workspaceStore = createWorkspaceStore({ storage: createLocalStorageWorkspaceStorage() })
  const view = render(<App queryClient={queryClient} workspaceStore={workspaceStore} />)
  return { ...view, workspaceStore }
}

/** Reads a root's memory from the new `leagues:workspace` envelope. */
function storedLocation(root: string): WorkspaceLocation | undefined {
  const raw = localStorage.getItem('leagues:workspace')
  return raw === null ? undefined : parseWorkspaceEnvelope(raw).state.locations[root]
}

function installScannedRoot(root: string, overrides: Partial<RendererApi> = {}): RendererApi {
  return installMockApi({ getRoot: vi.fn().mockResolvedValue(root), ...overrides })
}

function treeWithMondayLeagues(root = '/root', ...folderNames: string[]): LeaguesTree {
  const names = folderNames.length > 0 ? folderNames : ['Mixed triples']
  return makeTree({
    root,
    templatesPath: `${root}/_templates`,
    sharedPath: `${root}/_shared`,
    days: {
      ...makeTree().days,
      monday: names.map((folderName) =>
        makeLeague({ folderName, path: `${root}/monday/${folderName}` })
      )
    }
  })
}

function remember(root: string, day: string, folderName: string): void {
  localStorage.setItem(
    `leagues:${root}:selection`,
    JSON.stringify({ kind: 'league', day, folderName })
  )
}

it('shows loading, then FirstRun when getRoot returns null', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(null) })

  renderApp()

  expect(screen.getByText(/loading…/i)).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Application activity' })).toHaveClass('fixed')
  expect(await screen.findByRole('button', { name: /open location/i })).toBeInTheDocument()
  expect(screen.queryByText(/loading…/i)).not.toBeInTheDocument()
})

it('shows a scan error without confirming an opened location', async () => {
  installMockApi({
    scan: vi.fn().mockRejectedValue(new Error('Scan failed')),
    chooseRoot: vi.fn().mockResolvedValue('/chosen/leagues')
  })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: /open location/i }))
  expect(await screen.findByText('Couldn’t read the leagues folder')).toBeInTheDocument()
  expect(screen.getAllByText('Scan failed')).toHaveLength(1)
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Application activity' })).toBeEmptyDOMElement()
})

it('shows a scan error without confirming a recent location', async () => {
  installMockApi({
    scan: vi.fn().mockRejectedValue(new Error('Scan failed')),
    recentRoots: vi.fn().mockResolvedValue(['/recent/leagues']),
    setRoot: vi.fn().mockResolvedValue('/recent/leagues')
  })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: /leagues.*\/recent\/leagues/i }))
  expect(await screen.findByText('Couldn’t read the leagues folder')).toBeInTheDocument()
  expect(screen.getAllByText('Scan failed')).toHaveLength(1)
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Application activity' })).toBeEmptyDOMElement()
})

it('opens or creates a location from application commands during FirstRun', async () => {
  const api = installMockApi({ scan: vi.fn().mockResolvedValue(null) })
  renderApp()
  await screen.findByRole('button', { name: /open location/i })

  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  await waitFor(() => expect(api.chooseRoot).toHaveBeenCalledExactlyOnceWith('select'))
  act(() => emitAppCommand({ command: 'new-location', repeat: false, composing: false }))
  await waitFor(() => expect(api.chooseRoot).toHaveBeenLastCalledWith('init'))
})

it('keeps opening status visible through a recent-location scan, then confirms completion', async () => {
  let finishScan!: (tree: LeaguesTree) => void
  const scan = vi
    .fn()
    .mockImplementationOnce(() => new Promise<LeaguesTree>((resolve) => (finishScan = resolve)))
  installMockApi({
    scan,
    recentRoots: vi.fn().mockResolvedValue(['/recent/leagues']),
    setRoot: vi.fn().mockResolvedValue('/recent/leagues')
  })
  const user = userEvent.setup()
  renderApp()

  const activity = screen.getByRole('status', { name: 'Application activity' })
  await user.click(await screen.findByRole('button', { name: /leagues.*\/recent\/leagues/i }))
  expect(activity).toHaveTextContent('Opening location…')
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()

  await act(async () => {
    finishScan(
      makeTree({
        root: '/recent/leagues',
        templatesPath: '/recent/leagues/_templates',
        sharedPath: '/recent/leagues/_shared'
      })
    )
  })
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(await screen.findByText('Opened location')).toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Application activity' })).toBe(activity)
  expect(activity).toBeEmptyDOMElement()
  expect(screen.getAllByRole('status', { name: 'Application activity' })).toHaveLength(1)
})

it('does not confirm a superseded location scan when the winning watcher scan fails', async () => {
  let finishLocationScan!: (tree: LeaguesTree) => void
  const scan = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise<LeaguesTree>((resolve) => (finishLocationScan = resolve))
    )
    .mockRejectedValueOnce(new Error('Scan failed'))
  installMockApi({
    scan,
    chooseRoot: vi.fn().mockResolvedValue('/chosen/leagues')
  })
  renderApp()
  await screen.findByRole('button', { name: /open location/i })

  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  await waitFor(() => expect(scan).toHaveBeenCalledTimes(1))
  act(() => emitTreeChanged())
  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  await act(async () => {
    finishLocationScan(makeTree({ root: '/chosen/leagues' }))
  })

  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
  expect(screen.getAllByText('Scan failed')).toHaveLength(1)
  expect(screen.getByRole('status', { name: 'Application activity' })).toBeEmptyDOMElement()
})

it('shares one location-operation guard between FirstRun rows and app commands', async () => {
  let finishSwitch!: (path: string | null) => void
  const chooseRoot = vi.fn().mockResolvedValue('/chosen/leagues')
  installMockApi({
    scan: vi.fn().mockResolvedValue(null),
    recentRoots: vi.fn().mockResolvedValue(['/recent/leagues']),
    setRoot: vi.fn(() => new Promise<string | null>((resolve) => (finishSwitch = resolve))),
    chooseRoot
  })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: /leagues.*\/recent\/leagues/i }))
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  expect(chooseRoot).not.toHaveBeenCalled()

  await act(async () => finishSwitch(null))
})

it('shows Home on Shared documents and reports that directory in the status bar', async () => {
  installScannedRoot('/root', { scan: vi.fn().mockResolvedValue(makeTree()) })

  renderApp()

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  const status = screen.getByRole('contentinfo', { name: 'Application status' })
  const contentRow = screen.getByRole('main').parentElement
  expect(contentRow).toContainElement(screen.getByRole('navigation', { name: 'Leagues' }))
  expect(contentRow?.nextElementSibling).toBe(status)
  expect(within(status).getByTitle('/root/_shared')).toHaveTextContent('/root/_shared')
})

it('routes application commands to the visible browser and location control', async () => {
  const scan = vi.fn().mockResolvedValue(makeTree())
  const api = installScannedRoot('/root', { scan })
  renderApp()
  await screen.findByRole('heading', { name: 'Home' })

  act(() => emitAppCommand({ command: 'focus-filter', repeat: false, composing: false }))
  const filter = screen.getByRole<HTMLInputElement>('textbox', { name: 'Filter loaded files' })
  expect(filter).toHaveFocus()
  fireEvent.change(filter, { target: { value: 'rules' } })
  filter.setSelectionRange(2, 2)
  act(() => emitAppCommand({ command: 'focus-filter', repeat: false, composing: false }))
  expect(filter.selectionStart).toBe(0)
  expect(filter.selectionEnd).toBe(5)
  filter.blur()

  const listCalls = vi.mocked(api.listDir).mock.calls.length
  act(() => emitAppCommand({ command: 'refresh', repeat: false, composing: false }))
  await waitFor(() => expect(api.listDir).toHaveBeenCalledTimes(listCalls + 1))
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  await waitFor(() => expect(api.chooseRoot).toHaveBeenCalledExactlyOnceWith('select'))
})

it('updates the status path from the location root through league navigation', async () => {
  const leaguePath = '/root/monday/Pairs'
  const seasonPath = `${leaguePath}/2025-26`
  const weekPath = `${seasonPath}/Week 1`
  installScannedRoot('/root', {
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

  renderApp()

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  expect(within(status).getByTitle('/root/_shared')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Pairs' }))
  expect(within(status).getByTitle(leaguePath)).toBeInTheDocument()

  await user.dblClick(screen.getByRole('row', { name: /^2025-26/ }))
  expect(within(status).getByTitle(seasonPath)).toBeInTheDocument()

  await user.dblClick(await screen.findByRole('row', { name: /^Week 1/ }))
  expect(within(status).getByTitle(weekPath)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Trios' }))
  expect(within(status).getByTitle('/root/monday/Trios')).toBeInTheDocument()
})

it('tracks Home tabs and resets Home to Shared documents after league navigation', async () => {
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs'))
  })
  const user = userEvent.setup()

  renderApp()

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
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(makeTree()),
    listDir: vi.fn((dir: string) => Promise.resolve(dir === '/root/_templates' ? [folder] : []))
  })
  const user = userEvent.setup()
  renderApp()
  await user.click(await screen.findByRole('tab', { name: 'Templates' }))
  await user.dblClick(await screen.findByRole('row', { name: /^Admin/ }))
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
  installScannedRoot('/a', { scan, chooseRoot: vi.fn().mockResolvedValue('/b') })
  const user = userEvent.setup()

  renderApp()

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  expect(within(status).getByTitle('/a/_templates')).toBeInTheDocument()

  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Shared documents' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(within(status).getByTitle('/b/_shared')).toBeInTheDocument()
  })
})

it('rescans when the tree changes on disk', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs'))
    .mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  installScannedRoot('/root', { scan })
  renderApp()
  await screen.findByRole('button', { name: 'Pairs' })
  act(() => emitTreeChanged())
  expect(await screen.findByRole('button', { name: 'Trios' })).toBeInTheDocument()
})

it('shows a recoverable error when the scan fails, and retries', async () => {
  const scan = vi
    .fn()
    .mockRejectedValueOnce(new Error("Error invoking remote method 'leagues:scan': Error: EPERM"))
    .mockResolvedValue(makeTree())
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(screen.getByText('EPERM')).toBeInTheDocument()
  expect(screen.queryByText(/loading…/i)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(scan).toHaveBeenCalledTimes(2)
})

it('explains a permission-denied scan failure without macOS settings on Linux', async () => {
  const scan = vi
    .fn()
    .mockRejectedValue(
      new Error(`Error invoking remote method 'leagues:scan': Error: ${PERMISSION_DENIED_MESSAGE}`)
    )
  installScannedRoot('/root', { scan })

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'Folder access is blocked' })
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'The folder’s permissions are blocking this app from reading it. Check the folder’s permissions, then try again.'
    )
  ).toBeInTheDocument()
  expect(screen.queryByText(PERMISSION_DENIED_MESSAGE)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open System Settings' })).not.toBeInTheDocument()
  expectEmphasised(screen.getByRole('button', { name: 'Try again' }), true)
})

it('opens macOS permission settings and still retries the scan', async () => {
  pretendPlatform('darwin')
  const scan = vi
    .fn()
    .mockRejectedValueOnce(
      new Error(`Error invoking remote method 'leagues:scan': Error: ${PERMISSION_DENIED_MESSAGE}`)
    )
    .mockResolvedValue(makeTree())
  const api = installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()

  expect(
    await screen.findByText(
      'macOS is blocking this app from reading the folder. Grant access under Privacy & Security, Files and Folders, then try again.'
    )
  ).toBeInTheDocument()
  const settings = screen.getByRole('button', { name: 'Open System Settings' })
  expectEmphasised(settings, true)
  expect(document.activeElement).toBe(settings)
  const retry = screen.getByRole('button', { name: 'Try again' })
  expectEmphasised(retry, false)

  await user.click(settings)
  expect(api.openPermissionSettings).toHaveBeenCalledExactlyOnceWith()
  expect(scan).toHaveBeenCalledOnce()

  await user.click(retry)
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(scan).toHaveBeenCalledTimes(2)
})

it('keeps retry available when opening permission settings fails', async () => {
  pretendPlatform('darwin')
  const api = installScannedRoot('/root', {
    scan: vi.fn().mockRejectedValue(new Error(PERMISSION_DENIED_MESSAGE)),
    openPermissionSettings: vi.fn().mockRejectedValue(new Error('Couldn’t open System Settings'))
  })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: 'Open System Settings' }))

  expect(api.openPermissionSettings).toHaveBeenCalledExactlyOnceWith()
  expect(api.scan).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeEnabled()
})

it('shows one scan error when a league overview refresh fails', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs'))
    .mockRejectedValueOnce(new Error('Scan failed'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: 'Pairs' }))
  await user.click(screen.getByRole('button', { name: 'Refresh files' }))

  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(screen.getAllByText('Scan failed')).toHaveLength(1)
})

it('keeps the completed-delete context when its refresh replaces the dialog with ScanError', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs'))
    .mockRejectedValueOnce(new Error('Scan failed'))
  const api = installScannedRoot('/root', { scan })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: 'Pairs' }))
  await user.click(screen.getByRole('button', { name: 'Actions for 2025-26' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Delete season…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete season “2025-26”' })
  await user.type(within(dialog).getByLabelText('Type 2025-26 to confirm'), '2025-26')
  await user.click(within(dialog).getByRole('button', { name: 'Delete season' }))

  expect(api.trashFolder).toHaveBeenCalledWith('/root/monday/Pairs/2025-26')
  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(
    await screen.findByText(
      `Moved “2025-26” to the ${trashLabel()}, but the folder could not be refreshed: Scan failed`
    )
  ).toBeInTheDocument()
})

it('shows one scan error when refreshing a missing Home folder fails', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(makeTree({ hasShared: false }))
    .mockRejectedValueOnce(new Error('Scan failed'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()
  renderApp()

  await screen.findByText('No shared documents folder')
  await user.click(screen.getByRole('button', { name: 'Refresh files' }))

  expect(
    await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  ).toBeInTheDocument()
  expect(screen.getAllByText('Scan failed')).toHaveLength(1)
})

it('keeps offering retry when the rescan fails again', async () => {
  const scan = vi.fn().mockRejectedValue(new Error('still broken'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()

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
  const api = installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()

  await screen.findByRole('heading', { name: 'Couldn’t read the leagues folder' })
  await user.click(screen.getByRole('button', { name: 'Choose another folder' }))

  expect(api.forgetRoot).toHaveBeenCalled()
  expect(await screen.findByRole('button', { name: /open location/i })).toBeInTheDocument()
})

it('restores the remembered league for the location after the first scan', async () => {
  remember('/root', 'monday', 'Trios')
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  })

  renderApp()

  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trios' })).toHaveAttribute('aria-current', 'true')
})

it('falls back to home when the remembered league is not where it was, keeping the memory', async () => {
  // Same folder name, but remembered under a different day than the tree has it.
  remember('/root', 'tuesday', 'Trios')
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  })

  renderApp()

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')
  expect(storedLocation('/root')?.selection).toEqual({
    kind: 'league',
    day: 'tuesday',
    folderName: 'Trios'
  })
})

it('remembers selections and returns to Home from the title bar', async () => {
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs'))
  })
  const user = userEvent.setup()

  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Pairs' }))

  expect(storedLocation('/root')?.selection).toEqual({
    kind: 'league',
    day: 'monday',
    folderName: 'Pairs'
  })

  const home = screen.getByRole('button', { name: 'Go home' })
  expect(home).not.toHaveAttribute('aria-current')
  await user.click(home)

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(home).toHaveAttribute('aria-current', 'page')
  expect(storedLocation('/root')?.selection).toEqual({ kind: 'home' })
})

it('drops the selection to home when the selected league disappears from a rescan', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
    .mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Trios' }))
  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()

  act(() => emitTreeChanged())

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')
})

it('reselects a league once it returns after a temporary disappearance from a rescan', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs'))
    .mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Trios' }))
  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()

  act(() => emitTreeChanged())
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()

  act(() => emitTreeChanged())
  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Trios' })).toHaveAttribute('aria-current', 'true')
})

it('keeps an explicit Home selection through a league disappearing and returning', async () => {
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
    .mockResolvedValueOnce(treeWithMondayLeagues('/root', 'Pairs'))
    .mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  installScannedRoot('/root', { scan })
  const user = userEvent.setup()

  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Trios' }))
  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Go home' }))
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()

  act(() => emitTreeChanged())
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()

  act(() => emitTreeChanged())
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')
})

it('ignores a delayed league directory report for a league that is no longer selected', async () => {
  installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs', 'Trios'))
  })
  const user = userEvent.setup()
  const { workspaceStore } = renderApp()

  const status = await screen.findByRole('contentinfo', { name: 'Application status' })
  await user.click(screen.getByRole('button', { name: 'Pairs' }))
  expect(within(status).getByTitle('/root/monday/Pairs')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Trios' }))
  expect(within(status).getByTitle('/root/monday/Trios')).toBeInTheDocument()

  // A directory report from the pane the user has already navigated away from.
  act(() =>
    workspaceStore.getState().reportLeagueDir({
      ownerPath: '/root/monday/Pairs',
      currentDir: '/root/monday/Pairs/2025-26'
    })
  )

  expect(within(status).getByTitle('/root/monday/Trios')).toBeInTheDocument()
})

it('switching location restores that location’s memory without touching the other’s', async () => {
  remember('/a', 'monday', 'Pairs')
  remember('/b', 'monday', 'Trios')
  localStorage.setItem('leagues:/a:collapsed-days', JSON.stringify(['monday']))
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/a', 'Pairs'))
    .mockResolvedValue(treeWithMondayLeagues('/b', 'Trios'))
  installScannedRoot('/a', { scan, chooseRoot: vi.fn().mockResolvedValue('/b') })

  renderApp()
  expect(await screen.findByRole('heading', { name: 'Pairs' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-expanded', 'false')

  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))

  expect(await screen.findByRole('heading', { name: 'Trios' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-expanded', 'true')
  expect(storedLocation('/a')?.selection).toEqual({
    kind: 'league',
    day: 'monday',
    folderName: 'Pairs'
  })
})

it('refetches a previously visited folder after switching away and back', async () => {
  const seasonPath = '/a/monday/Pairs/2025-26'
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/a', 'Pairs'))
    .mockResolvedValueOnce(treeWithMondayLeagues('/b', 'Trios'))
    .mockResolvedValueOnce(treeWithMondayLeagues('/a', 'Pairs', 'Fours'))
  const listDir = vi.fn().mockResolvedValue([])
  installScannedRoot('/a', {
    scan,
    listDir,
    recentRoots: vi.fn().mockResolvedValue(['/a', '/b'])
  })
  const user = userEvent.setup()
  renderApp()

  await user.click(await screen.findByRole('button', { name: 'Pairs' }))
  await user.dblClick(screen.getByRole('row', { name: /^2025-26/ }))
  await waitFor(() =>
    expect(listDir.mock.calls.filter(([path]) => path === seasonPath)).toHaveLength(1)
  )

  await user.click(screen.getByRole('button', { name: 'Location: a' }))
  let menu = await screen.findByRole('menu')
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^b/ }))
  await screen.findByRole('heading', { name: 'Home' })
  // Items stay disabled until the switch has finished, which the cleared activity region confirms.
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Application activity' })).toBeEmptyDOMElement()
  )
  await user.click(screen.getByRole('button', { name: 'Location: b' }))
  menu = await screen.findByRole('menu')
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^a/ }))
  await screen.findByRole('heading', { name: 'Pairs' })
  expect(await screen.findByRole('button', { name: 'Fours' })).toBeInTheDocument()
  expect(scan).toHaveBeenCalledTimes(3)
  await user.dblClick(screen.getByRole('row', { name: /^2025-26/ }))

  await waitFor(() =>
    expect(listDir.mock.calls.filter(([path]) => path === seasonPath)).toHaveLength(2)
  )
})

it('unsubscribes from tree changes on unmount', async () => {
  const unsubscribe = vi.fn()
  installMockApi({
    scan: vi.fn().mockResolvedValue(null),
    onTreeChanged: vi.fn(() => unsubscribe)
  })

  const { unmount } = renderApp()
  await screen.findByRole('button', { name: /open location/i })

  unmount()
  expect(unsubscribe).toHaveBeenCalled()
})

it('keeps the sidebar and location control usable after a pane render fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const api = installScannedRoot('/root', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/root', 'Pairs')),
    listDir: vi.fn().mockResolvedValue([null])
  })
  const user = userEvent.setup()
  renderApp()

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Leagues' })).toBeInTheDocument()
  expect(screen.getByRole('contentinfo', { name: 'Application status' })).toBeInTheDocument()
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  await waitFor(() => expect(api.chooseRoot).toHaveBeenCalledExactlyOnceWith('select'))

  await user.click(screen.getByRole('button', { name: 'Pairs' }))
  expect(await screen.findByRole('heading', { name: 'Pairs' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps B displayed when a slow A scan settles after switching', async () => {
  let finishA!: (tree: LeaguesTree) => void
  const scan = vi
    .fn()
    .mockImplementationOnce(() => new Promise<LeaguesTree>((resolve) => (finishA = resolve)))
    .mockResolvedValue(treeWithMondayLeagues('/b', 'B league'))
  installScannedRoot('/a', { scan, chooseRoot: vi.fn().mockResolvedValue('/b') })
  renderApp()
  await waitFor(() => expect(scan).toHaveBeenCalledOnce())
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  expect(await screen.findByRole('button', { name: 'B league' })).toBeInTheDocument()
  await act(async () => finishA(treeWithMondayLeagues('/a', 'A league')))
  expect(screen.queryByRole('button', { name: 'A league' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'B league' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Location: b' })).toBeInTheDocument()
})

it('leaves root, tree and status untouched when the picker is cancelled', async () => {
  const api = installScannedRoot('/a', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/a', 'Pairs'))
  })
  renderApp()
  await screen.findByRole('button', { name: 'Pairs' })
  const status = screen.getByRole('contentinfo', { name: 'Application status' })
  act(() => emitAppCommand({ command: 'open-location', repeat: false, composing: false }))
  await waitFor(() => expect(api.chooseRoot).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Application activity' })).toBeEmptyDOMElement()
  )
  expect(screen.getByRole('button', { name: 'Location: a' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pairs' })).toBeInTheDocument()
  expect(within(status).getByTitle('/a/_shared')).toBeInTheDocument()
  expect(api.scan).toHaveBeenCalledOnce()
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
})

it('prunes a missing recent root and keeps the current location', async () => {
  const api = installScannedRoot('/a', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/a', 'Pairs')),
    recentRoots: vi.fn().mockResolvedValueOnce(['/a', '/gone']).mockResolvedValue(['/a']),
    setRoot: vi.fn().mockResolvedValue(null)
  })
  const user = userEvent.setup()
  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Location: a' }))
  await user.click(await screen.findByRole('menuitemradio', { name: /^gone/ }))
  expect(await screen.findByText('“gone” is no longer available at /gone')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Location: a' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pairs' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Location: a' }))
  const menu = await screen.findByRole('menu')
  expect(await within(menu).findByRole('menuitemradio', { name: /^a/ })).toBeInTheDocument()
  expect(within(menu).queryByRole('menuitemradio', { name: /^gone/ })).not.toBeInTheDocument()
  expect(api.scan).toHaveBeenCalledOnce()
})

it('stays on FirstRun when a forgotten outstanding scan settles', async () => {
  let finishScan!: (tree: LeaguesTree) => void
  const scan = vi
    .fn()
    .mockResolvedValueOnce(treeWithMondayLeagues('/a', 'Pairs'))
    .mockRejectedValueOnce(new Error('Unreadable'))
    .mockImplementationOnce(() => new Promise<LeaguesTree>((resolve) => (finishScan = resolve)))
  const api = installScannedRoot('/a', { scan })
  const user = userEvent.setup()
  renderApp()
  await screen.findByRole('button', { name: 'Pairs' })
  act(() => emitTreeChanged())
  await screen.findByRole('button', { name: 'Choose another folder' })
  act(() => emitTreeChanged())
  await waitFor(() => expect(scan).toHaveBeenCalledTimes(3))
  // A background retry retains the error screen while the scan is outstanding.
  await user.click(screen.getByRole('button', { name: 'Choose another folder' }))
  expect(api.forgetRoot).toHaveBeenCalledOnce()
  await screen.findByRole('button', { name: /open location/i })
  await act(async () => finishScan(treeWithMondayLeagues('/a', 'Pairs')))
  expect(screen.getByRole('button', { name: /open location/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Pairs' })).not.toBeInTheDocument()
})

it('reconciles a rejected switch with getRoot and keeps the old location', async () => {
  const api = installScannedRoot('/a', {
    scan: vi.fn().mockResolvedValue(treeWithMondayLeagues('/a', 'Pairs')),
    recentRoots: vi.fn().mockResolvedValue(['/a', '/b']),
    setRoot: vi.fn().mockRejectedValue(new Error('Switch failed'))
  })
  const user = userEvent.setup()
  renderApp()
  await user.click(await screen.findByRole('button', { name: 'Location: a' }))
  await user.click(await screen.findByRole('menuitemradio', { name: /^b/ }))
  expect(await screen.findByText('Switch failed')).toBeInTheDocument()
  expect(api.getRoot).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Location: a' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pairs' })).toBeInTheDocument()
})

it('keeps one tree watcher subscriber for a mounted ready App', async () => {
  installScannedRoot('/root', { scan: vi.fn().mockResolvedValue(makeTree()) })
  const view = renderApp()
  await screen.findByRole('heading', { name: 'Home' })
  expect(treeChangedListenerCount()).toBe(1)
  view.unmount()
  expect(treeChangedListenerCount()).toBe(0)
})

it('retries a failed root bootstrap without scanning before the root is confirmed', async () => {
  const api = installMockApi({
    getRoot: vi
      .fn()
      .mockRejectedValueOnce(new Error('Root unavailable'))
      .mockResolvedValue('/root'),
    scan: vi.fn().mockResolvedValue(makeTree())
  })
  const user = userEvent.setup()
  renderApp()
  expect(await screen.findByRole('alert')).toHaveTextContent('Root unavailable')
  expect(api.scan).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  expect(api.getRoot).toHaveBeenCalledTimes(2)
  expect(api.scan).toHaveBeenCalledOnce()
})
