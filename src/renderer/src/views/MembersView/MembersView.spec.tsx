import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { MembersView } from './index'
import {
  makeMember,
  makeLeague,
  makeRosterSeason,
  makeSeasonFile,
  makeSnapshot,
  makeTree
} from '@renderer/tests/fixtures'
import { installMockApi, type RendererApi } from '@renderer/tests/mock-api'
import { renderWithProviders } from '@renderer/tests/render-helpers'
import { createMemoryWorkspaceStorage } from '@renderer/tests/memory-workspace-storage'
import { createWorkspaceStore } from '@renderer/lib/workspace-store'
import { createQueryClient } from '@renderer/lib/query-client'
import { membersQueryKey } from '@renderer/queries/members'

function renderMembers(): void {
  renderWithProviders(<MembersView tree={makeTree()} />)
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

it('offers to enable the database and refreshes once it is on', async () => {
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValue(makeSnapshot({ enabled: false }))
  const api = installMockApi({ getRoot: vi.fn().mockResolvedValue('/root'), membersSnapshot })
  const user = userEvent.setup()
  renderMembers()

  expect(await screen.findByText('Members database is off for this location')).toBeInTheDocument()
  membersSnapshot.mockResolvedValue(makeSnapshot({ members: [makeMember({ id: 1 })] }))
  await user.click(screen.getByRole('button', { name: 'Enable members database' }))

  expect(api.enableMembers).toHaveBeenCalledOnce()
  expect(await screen.findByRole('row', { name: /Jane Doe/ })).toBeInTheDocument()
})

it('lists members with numbers, contact, leagues and flags, and filters them', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        nextId: 3,
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee', phone: '07700 900000' }),
          makeMember({
            id: 2,
            firstName: 'Kid',
            lastName: 'Lee',
            dob: '2015-01-01',
            email: undefined
          })
        ],
        seasons: [
          makeRosterSeason({
            leagueName: 'Mixed Triples',
            file: makeSeasonFile({
              teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
              players: [
                { memberId: 1, teamId: 'team_a' },
                { memberId: 2, teamId: null }
              ]
            })
          })
        ],
        problems: [{ kind: 'unlinked-player', path: '/root/monday/Pairs/2025-26', memberId: 9 }]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  const ann = await screen.findByRole('row', { name: /Ann Lee/ })
  expect(within(ann).getByText('000001')).toBeInTheDocument()
  const kid = screen.getByRole('row', { name: /Kid Lee/ })
  expect(within(kid).getByText('Needs details')).toBeInTheDocument()
  await user.click(within(ann).getByRole('button', { name: /Ann Lee, member/ }))
  const profile = screen.getByRole('article', { name: 'Ann Lee profile' })
  expect(profile).toHaveTextContent('jane@example.org')
  expect(profile).toHaveTextContent('07700 900000')
  expect(profile).toHaveTextContent('Mixed Triples')
  expect(screen.getByRole('region', { name: 'Problems' })).toHaveTextContent(
    'monday/Pairs/2025-26 lists member 9, who is not in the master list'
  )
  expect(screen.getByText('2 members')).toBeInTheDocument()

  await user.type(screen.getByRole('searchbox', { name: 'Filter members' }), 'ann')
  expect(screen.queryByRole('row', { name: /Kid Lee/ })).not.toBeInTheDocument()
  expect(screen.getByRole('row', { name: /Ann Lee/ })).toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()
})

it('sorts by number or name from the headers and remembers the arrangement', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        nextId: 4,
        members: [
          makeMember({ id: 1, firstName: 'Zed', lastName: 'Young' }),
          makeMember({ id: 2, firstName: 'Ann', lastName: 'Lee', aliases: ['Annie Lee'] }),
          makeMember({ id: 3, firstName: 'Bob', lastName: 'Kay' })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  const table = await screen.findByRole('table', { name: 'Members' })
  const listed = (): string[] =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1].textContent)
  expect(listed()).toEqual(['Bob Kay', 'Ann Lee', 'Zed Young'])
  expect(screen.queryByText(/Also known as/)).not.toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'aria-sort',
    'ascending'
  )

  await user.click(screen.getByRole('button', { name: 'Number' }))
  expect(listed()).toEqual(['Zed Young', 'Ann Lee', 'Bob Kay'])
  await user.click(screen.getByRole('button', { name: 'Number' }))
  expect(listed()).toEqual(['Bob Kay', 'Ann Lee', 'Zed Young'])
  expect(screen.getByRole('columnheader', { name: /Number/ })).toHaveAttribute(
    'aria-sort',
    'descending'
  )

  const handle = screen.getByRole('separator', { name: 'Resize member list' })
  const workspace = screen.getByRole('region', { name: 'Member list' }).parentElement
  if (!workspace) throw new Error('No members workspace')
  vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 1000,
    height: 500,
    top: 0,
    right: 1000,
    bottom: 500,
    left: 0,
    toJSON: () => ({})
  })
  fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1, buttons: 1 })
  fireEvent.pointerMove(handle, { clientX: 200, pointerId: 1, buttons: 1 })
  fireEvent.pointerUp(handle, { clientX: 200, pointerId: 1, buttons: 0 })
  expect(handle).toHaveAttribute('aria-valuenow', '44')
  expect(localStorage.getItem('leagues:members-workspace:v1')).toBe('44')
  handle.focus()
  await user.keyboard('{ArrowRight}')
  expect(handle).toHaveAttribute('aria-valuenow', '46')
  expect(localStorage.getItem('leagues:members-workspace:v1')).toBe('46')

  expect(JSON.parse(localStorage.getItem('leagues:members-table:v1') ?? '{}')).toEqual({
    sort: { column: 'number', direction: 'descending' },
    widths: {}
  })
})

it('explains an empty list', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(makeSnapshot())
  })
  renderMembers()

  expect(await screen.findByText(/No members yet/)).toBeInTheDocument()
  expect(screen.getByText('0 members')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Select a member' })).toBeInTheDocument()
})

it('opens a profile explicitly and links roster memberships to the Players tab', async () => {
  const member = makeMember({
    id: 1,
    aliases: ['Janie Doe'],
    mbdIds: ['M-12'],
    notes: 'Left handed'
  })
  const league = makeLeague({ archivedSeasons: ['2023-24'] })
  const current = makeRosterSeason({
    file: makeSeasonFile({ players: [{ memberId: 1, teamId: null }] })
  })
  const archived = makeRosterSeason({
    season: '2023-24',
    path: '/root/_archives/Mixed triples/2023-24',
    archived: true,
    file: makeSeasonFile({ players: [{ memberId: 1, teamId: null }] })
  })
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn()
      .mockResolvedValue(
        makeSnapshot({ nextId: 2, members: [member], seasons: [current, archived] })
      )
  })
  const workspaceStore = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
  workspaceStore.getState().setRoot('/root')
  const user = userEvent.setup()
  renderWithProviders(
    <MembersView tree={makeTree({ days: { ...makeTree().days, monday: [league] } })} />,
    { workspaceStore }
  )

  expect(await screen.findByRole('heading', { name: 'Select a member' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Jane Doe, member/ }))
  const profile = screen.getByRole('article', { name: 'Jane Doe profile' })
  expect(profile).toHaveTextContent('Janie Doe')
  expect(profile).toHaveTextContent('M-12')
  expect(profile).toHaveTextContent('Left handed')
  await user.click(within(profile).getByRole('button', { name: /Mixed triples.*2025-26/i }))

  expect(workspaceStore.getState().locations['/root'].selection).toEqual({
    kind: 'league',
    day: 'monday',
    folderName: 'Mixed triples'
  })
  expect(workspaceStore.getState().leagueNavigation).toEqual({
    ownerPath: '/root/monday/Mixed triples',
    currentDir: '/root/monday/Mixed triples/2025-26',
    tab: 'players'
  })
})

it('opens an archived Windows roster link on the Players tab', async () => {
  const member = makeMember({ id: 1 })
  const league = makeLeague({
    path: 'C:\\Leagues\\monday\\Mixed triples',
    archivePath: 'C:\\Leagues\\_archives\\Mixed triples',
    archivedSeasons: ['2023-24']
  })
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('C:\\Leagues'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        nextId: 2,
        members: [member],
        seasons: [
          makeRosterSeason({
            season: '2023-24',
            path: 'C:\\Leagues\\_archives\\Mixed triples\\2023-24',
            archived: true,
            file: makeSeasonFile({ players: [{ memberId: 1, teamId: null }] })
          })
        ]
      })
    )
  })
  const workspaceStore = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
  workspaceStore.getState().setRoot('C:\\Leagues')
  const user = userEvent.setup()
  renderWithProviders(
    <MembersView
      tree={makeTree({ root: 'C:\\Leagues', days: { ...makeTree().days, monday: [league] } })}
    />,
    { workspaceStore, locationKey: 'C:\\Leagues' }
  )

  await user.click(await screen.findByRole('button', { name: /Jane Doe, member/ }))
  await user.click(screen.getByRole('button', { name: 'Previous seasons (1)' }))
  await user.click(screen.getByRole('button', { name: /Mixed triples.*2023-24/i }))

  expect(workspaceStore.getState().leagueNavigation).toEqual({
    ownerPath: 'C:\\Leagues\\monday\\Mixed triples',
    currentDir: 'C:\\Leagues\\_archives\\Mixed triples\\2023-24',
    tab: 'players'
  })
})

it('reports a failed read with a retry', async () => {
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockRejectedValue(new Error('disk gone'))
  installMockApi({ getRoot: vi.fn().mockResolvedValue('/root'), membersSnapshot })
  const user = userEvent.setup()
  renderMembers()

  expect(await screen.findByText('Couldn’t read the members files')).toBeInTheDocument()
  expect(screen.getByText('disk gone')).toBeInTheDocument()
  membersSnapshot.mockResolvedValue(makeSnapshot({ members: [makeMember({ id: 1 })] }))
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByRole('row', { name: /Jane Doe/ })).toBeInTheDocument()
})

function twoMembersSnapshot(): ReturnType<typeof makeSnapshot> {
  return makeSnapshot({
    revision: 'rev-2',
    nextId: 3,
    members: [
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay' })
    ]
  })
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
  await screen.findByRole('menu')
}

it('adds a new member in the pane and opens the saved profile through an active filter', async () => {
  const initial = twoMembersSnapshot()
  const saved = makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
  const refreshed = makeSnapshot({
    revision: 'rev-3',
    nextId: 4,
    members: [...initial.members, saved]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed),
    saveMember: vi.fn().mockResolvedValue(saved)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.type(await screen.findByRole('searchbox', { name: 'Filter members' }), 'Ann')
  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  expect(screen.getByRole('form', { name: 'New member' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(api.saveMember).toHaveBeenCalledWith(
    expect.objectContaining({ firstName: 'Cy', lastName: 'Dee' }),
    'rev-2'
  )
  expect(await screen.findByRole('article', { name: 'Cy Dee profile' })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /Cy Dee/ })).not.toBeInTheDocument()
})

it('cancels new and edit forms back to the appropriate profile', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Unsaved')
  await openRowMenu(user, 'Bob Kay')
  expect(screen.getByRole('form', { name: 'New member' })).toBeInTheDocument()
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Unsaved')
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()

  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.clear(screen.getByLabelText(/first name/i))
  await user.type(screen.getByLabelText(/first name/i), 'Changed')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()
})

it('saves an edit against the revision captured when the form opened', async () => {
  const initial = twoMembersSnapshot()
  const refreshedMember = makeMember({ id: 1, firstName: 'Ann', lastName: 'Li' })
  const refreshed = makeSnapshot({
    revision: 'rev-4',
    nextId: 3,
    members: [refreshedMember, initial.members[1]]
  })
  const queryClient = createQueryClient()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed),
    saveMember: vi.fn().mockResolvedValue(refreshedMember)
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  act(() => {
    queryClient.setQueryData(membersQueryKey('/root'), {
      ...initial,
      revision: 'rev-3'
    })
  })
  await user.clear(screen.getByLabelText(/last name/i))
  await user.type(screen.getByLabelText(/last name/i), 'Li')
  await user.click(screen.getByRole('button', { name: 'Save member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(api.saveMember).toHaveBeenCalledWith(expect.objectContaining({ lastName: 'Li' }), 'rev-2')
})

it('keeps a failed write draft and discards it when another row is selected', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot()),
    saveMember: vi.fn().mockRejectedValue(new Error('Revision conflict'))
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Draft')
  await user.type(screen.getByLabelText(/last name/i), 'Member')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  const error = await screen.findByRole('alert')
  expect(error).toHaveTextContent('Revision conflict')
  expect(error).toHaveFocus()
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Draft')
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
  expect(api.saveMember).toHaveBeenCalledOnce()
})

it('retries only the refresh after a successful write', async () => {
  const initial = twoMembersSnapshot()
  const saved = makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(new Error('Scan failed'))
    .mockResolvedValueOnce(
      makeSnapshot({ revision: 'rev-3', nextId: 4, members: [...initial.members, saved] })
    )
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot,
    saveMember: vi.fn().mockResolvedValue(saved)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved Cy Dee, but the list could not be refreshed: Scan failed'
  )
  expect(screen.getByRole('region', { name: 'Members list problem' })).toHaveTextContent(
    'Scan failed'
  )
  expect(screen.getByRole('button', { name: 'Add member' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Retry refresh' }))
  expect(await screen.findByRole('article', { name: 'Cy Dee profile' })).toBeInTheDocument()
  expect(api.saveMember).toHaveBeenCalledOnce()
})

it('keeps a cached-members warning after closing a completed form', async () => {
  const initial = twoMembersSnapshot()
  const saved = makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(new Error('Members scan failed'))
    .mockResolvedValueOnce(
      makeSnapshot({ revision: 'rev-3', nextId: 4, members: [...initial.members, saved] })
    )
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot,
    saveMember: vi.fn().mockResolvedValue(saved)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await user.click(await screen.findByRole('button', { name: 'Close' }))

  const warning = screen.getByRole('region', { name: 'Members list problem' })
  expect(warning).toHaveTextContent('Members scan failed')
  await user.click(within(warning).getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(warning).not.toBeInTheDocument())
  expect(api.saveMember).toHaveBeenCalledOnce()
})

it('does not let an in-flight save replace a newer row selection', async () => {
  const initial = twoMembersSnapshot()
  const save = deferred<ReturnType<typeof makeMember>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(initial),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()

  await act(async () => save.resolve(makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
})

it('reports a late save failure without replacing the newer selection', async () => {
  const save = deferred<ReturnType<typeof makeMember>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot()),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  await act(async () => save.reject(new Error('Disk is locked')))

  expect(
    await screen.findByText(/Couldn’t save Cy Dee in \/root: Disk is locked/)
  ).toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
})

it('merges two members from the row menu, keeping whichever record the desk picks', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Merge Bob Kay with…')
  expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  screen.getByLabelText(/merge with/i).focus()
  await user.keyboard('{ArrowDown}')
  await user.click(await screen.findByRole('option', { name: '000001 Ann Lee' }))
  // The chosen record stays by default; the desk can turn the merge round.
  expect(screen.getByRole('radio', { name: 'Keep 000001 Ann Lee' })).toBeChecked()
  await user.click(screen.getByRole('radio', { name: 'Keep 000002 Bob Kay' }))
  await user.click(screen.getByRole('button', { name: 'Merge members' }))

  await waitFor(() => expect(api.mergeMembers).toHaveBeenCalledExactlyOnceWith(1, 2, 'rev-2'))
})

it('deletes a member, explaining whether they are hidden or removed', async () => {
  const snapshot = twoMembersSnapshot()
  snapshot.seasons = [
    makeRosterSeason({ file: makeSeasonFile({ players: [{ memberId: 1, teamId: null }] }) })
  ]
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(snapshot),
    deleteMember: vi.fn().mockResolvedValue('soft')
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Ann Lee')
  await user.click(screen.getByRole('menuitem', { name: 'Delete…' }))
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('hidden from the list rather than removed')
  await user.click(screen.getByRole('button', { name: 'Hide member' }))

  await waitFor(() => expect(api.deleteMember).toHaveBeenCalledExactlyOnceWith(1, 'rev-2'))
})

it('lets one holder of a duplicated number keep it', async () => {
  const snapshot = makeSnapshot({
    revision: 'rev-3',
    nextId: 4,
    members: [
      makeMember({ id: 3, firstName: 'First', lastName: 'Holder' }),
      makeMember({ id: 3, firstName: 'Second', lastName: 'Holder' })
    ],
    problems: [{ kind: 'duplicate-number', id: 3, count: 2 }]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(snapshot),
    renumberDuplicates: vi.fn().mockResolvedValue([4])
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Unsaved')
  await openRowMenu(user, 'Second Holder')
  await user.click(screen.getByRole('menuitem', { name: /keep this number/i }))

  expect(screen.queryByRole('form', { name: 'New member' })).not.toBeInTheDocument()
  await waitFor(() => expect(api.renumberDuplicates).toHaveBeenCalledExactlyOnceWith(3, 1, 'rev-3'))
})

it('guards duplicate profile actions and preserves the same holder across reorder', async () => {
  const first = makeMember({ id: 3, firstName: 'First', lastName: 'Holder' })
  const second = makeMember({ id: 3, firstName: 'Second', lastName: 'Holder' })
  const duplicateProblem = [{ kind: 'duplicate-number' as const, id: 3, count: 2 }]
  const queryClient = createQueryClient()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn()
      .mockResolvedValue(makeSnapshot({ members: [first, second], problems: duplicateProblem }))
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await user.click(await screen.findByRole('button', { name: /Second Holder, member/ }))
  let profile = screen.getByRole('article', { name: 'Second Holder profile' })
  expect(within(profile).queryByRole('button', { name: 'Edit…' })).not.toBeInTheDocument()
  expect(
    within(profile).getByRole('button', { name: /keep this number, renumber the others/i })
  ).toBeInTheDocument()

  act(() => {
    queryClient.setQueryData(
      membersQueryKey('/root'),
      makeSnapshot({
        members: [{ ...second }, { ...first }],
        problems: duplicateProblem
      })
    )
  })
  profile = screen.getByRole('article', { name: 'Second Holder profile' })
  expect(profile).toHaveTextContent('000003')
})

it('clears a duplicate selection when only the other holder remains', async () => {
  const first = makeMember({ id: 3, firstName: 'First', lastName: 'Holder' })
  const second = makeMember({ id: 3, firstName: 'Second', lastName: 'Holder' })
  const queryClient = createQueryClient()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        members: [first, second],
        problems: [{ kind: 'duplicate-number', id: 3, count: 2 }]
      })
    )
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await user.click(await screen.findByRole('button', { name: /Second Holder, member/ }))
  expect(screen.getByRole('article', { name: 'Second Holder profile' })).toBeInTheDocument()
  act(() => {
    queryClient.setQueryData(membersQueryKey('/root'), makeSnapshot({ members: [{ ...first }] }))
  })

  expect(await screen.findByRole('heading', { name: 'Select a member' })).toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

it('clears a duplicate selection when that holder is renumbered', async () => {
  const first = makeMember({ id: 3, firstName: 'First', lastName: 'Holder' })
  const second = makeMember({ id: 3, firstName: 'Second', lastName: 'Holder' })
  const queryClient = createQueryClient()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        members: [first, second],
        problems: [{ kind: 'duplicate-number', id: 3, count: 2 }]
      })
    )
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await user.click(await screen.findByRole('button', { name: /Second Holder, member/ }))
  act(() => {
    queryClient.setQueryData(
      membersQueryKey('/root'),
      makeSnapshot({ members: [{ ...first }, { ...second, id: 4 }] })
    )
  })

  expect(await screen.findByRole('heading', { name: 'Select a member' })).toBeInTheDocument()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

it('starts an MBD sync from the toolbar picker or a dropped export', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(makeSnapshot({ members: [makeMember({ id: 1 })] })),
    pickImportFile: vi.fn().mockResolvedValue('/exports/all-bowlers.csv')
  })
  const user = userEvent.setup()
  renderMembers()

  await screen.findByRole('row', { name: /Jane Doe/ })
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Sync from MBD…' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Sync from the Master Bowler Database'
  )
  await waitFor(() =>
    expect(api.previewImport).toHaveBeenCalledExactlyOnceWith('/exports/all-bowlers.csv')
  )
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  const zone = screen.getByRole('table', { name: 'Members' }).closest('[data-import-drop-target]')
  if (!zone) throw new Error('No drop target around the members table')
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['x'], 'scores.docx')], types: ['Files'] }
  })
  expect(await screen.findByText(/Drop one bowler export/)).toBeInTheDocument()
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['x'], 'bowlers.csv')], types: ['Files'] }
  })
  expect(
    await screen.findByRole('dialog', { name: /Sync from the Master Bowler Database/ })
  ).toBeInTheDocument()
  await waitFor(() => expect(api.previewImport).toHaveBeenLastCalledWith('bowlers.csv'))
})

it('offers a development-only reset that empties every roster and the list', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await screen.findByRole('row', { name: /Ann Lee/ })
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Delete all members…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete every member?' })
  expect(dialog).toHaveTextContent('removes all 2 member records')
  await user.click(within(dialog).getByRole('button', { name: 'Delete everything' }))

  await waitFor(() => expect(api.resetMembers).toHaveBeenCalledExactlyOnceWith('rev-2'))
  // The toast is a dialog too, so the check names the one that should have gone.
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Delete every member?' })).not.toBeInTheDocument()
  )
})

it('parks card printing until there is a template, and opens the export', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        revision: 'rev-5',
        nextId: 4,
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
          makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay' }),
          makeMember({ id: 3, firstName: 'Gone', lastName: 'Away', deleted: true })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Ann Lee')
  expect(
    screen.getByRole('menuitem', { name: 'Print card (needs a card template)' })
  ).toHaveAttribute('aria-disabled', 'true')
  await user.keyboard('{Escape}')

  // Hidden members would never be on the sheet, so the count still reads the two listed.
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  expect(
    await screen.findByRole('menuitem', { name: 'Print 2 cards (needs a card template)' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(api.printCards).not.toHaveBeenCalled()

  await user.click(await screen.findByRole('menuitem', { name: 'Export list to CSV…' }))
  expect(await screen.findByRole('dialog', { name: 'Export members to CSV' })).toBeInTheDocument()
})
