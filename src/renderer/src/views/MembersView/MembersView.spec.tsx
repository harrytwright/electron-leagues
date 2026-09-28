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
    sort: { column: 'number', direction: 'descending' }
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
  expect(screen.getByRole('button', { name: /Jane Doe, member/ })).toHaveAttribute(
    'aria-current',
    'true'
  )
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

it('shows a linked guardian on a junior’s profile and opens their record', async () => {
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
            email: undefined,
            guardianMemberId: 1
          })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  const profile = screen.getByRole('article', { name: 'Kid Lee profile' })
  expect(profile).toHaveTextContent('Linked guardian')
  expect(profile).toHaveTextContent('jane@example.org, 07700 900000')
  expect(screen.queryByRole('row', { name: /Kid Lee/ })).not.toHaveTextContent('Needs details')
  await user.click(within(profile).getByRole('button', { name: 'Ann Lee' }))
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()
})

it('shows a soft-deleted linked guardian as removed rather than live', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        nextId: 3,
        members: [
          makeMember({
            id: 1,
            firstName: 'Ann',
            lastName: 'Lee',
            phone: '07700 900000',
            deleted: true
          }),
          makeMember({
            id: 2,
            firstName: 'Kid',
            lastName: 'Lee',
            dob: '2015-01-01',
            email: undefined,
            guardianMemberId: 1
          })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  const profile = screen.getByRole('article', { name: 'Kid Lee profile' })
  expect(profile).toHaveTextContent('Ann Lee (removed)')
  expect(profile).toHaveTextContent('No longer on the list')
  expect(profile).not.toHaveTextContent('07700 900000')
  await user.click(within(profile).getByRole('button', { name: 'Ann Lee (removed)' }))
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()
})

it('keeps the editor’s stale guardian option selectable after picking someone else', async () => {
  const dob = `${new Date().getFullYear() - 10}-01-01`
  const goneGuardian = makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee', deleted: true })
  const otherGuardian = makeMember({ id: 3, firstName: 'Meg', lastName: 'Lee' })
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob,
    email: undefined,
    guardianMemberId: 1
  })
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        revision: 'rev-2',
        nextId: 4,
        members: [goneGuardian, otherGuardian, junior]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  const picker = screen.getByRole('combobox', { name: 'Linked guardian' })
  expect(picker).toHaveValue('000001 Ann Lee (removed)')
  await user.click(picker)
  await user.click(await screen.findByRole('option', { name: '000003 Meg Lee' }))
  expect(picker).toHaveValue('000003 Meg Lee')

  // The stale option follows the record's own stored link, not whichever guardian is
  // picked next, so it stays available without cancelling the whole edit.
  await user.click(picker)
  expect(
    await screen.findByRole('option', { name: '000001 Ann Lee (removed)' })
  ).toBeInTheDocument()
})

it('adds a guardian as a member from the junior’s contact text and links them', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const guardian = makeMember({
    id: 3,
    firstName: 'Meg',
    lastName: 'Lee',
    dob: undefined,
    email: 'mum@example.org',
    phone: '07700 900123'
  })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const withGuardian = makeSnapshot({ revision: 'rev-3', nextId: 4, members: [junior, guardian] })
  const linked = makeSnapshot({
    revision: 'rev-4',
    nextId: 4,
    members: [{ ...junior, guardianMemberId: 3 }, guardian]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(withGuardian)
      .mockResolvedValue(linked),
    saveMember: vi
      .fn<RendererApi['saveMember']>()
      .mockResolvedValueOnce(guardian)
      .mockResolvedValueOnce({ ...junior, guardianMemberId: 3 })
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))

  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  expect(within(form).getByLabelText(/email/i)).toHaveValue('mum@example.org')
  expect(within(form).getByLabelText(/phone/i)).toHaveValue('07700 900123')
  expect(within(form).getByLabelText(/notes/i)).toHaveValue(
    'Guardian of Kid Lee (000002). Contact given as: Mum, mum@example.org, 07700 900123'
  )
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledTimes(2))
  expect(api.saveMember).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ firstName: 'Meg', email: 'mum@example.org' }),
    'rev-2'
  )
  expect(api.saveMember).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 2, firstName: 'Kid', guardianMemberId: 3 }),
    'rev-3'
  )
  const profile = await screen.findByRole('article', { name: 'Kid Lee profile' })
  expect(profile).toHaveTextContent('Linked guardian')
  expect(within(profile).getByRole('button', { name: 'Meg Lee' })).toBeInTheDocument()
})

it('links a guardian without splitting an alias that contains a comma', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    aliases: ['Lee, Jr'],
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const guardian = makeMember({ id: 3, firstName: 'Meg', lastName: 'Lee' })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const withGuardian = makeSnapshot({ revision: 'rev-3', nextId: 4, members: [junior, guardian] })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(withGuardian),
    saveMember: vi
      .fn<RendererApi['saveMember']>()
      .mockResolvedValueOnce(guardian)
      .mockResolvedValueOnce({ ...junior, guardianMemberId: 3 })
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))
  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  // The link is built straight from the junior's record, not round-tripped through the
  // comma-separated aliases text field, so "Lee, Jr" survives as one alias.
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledTimes(2))
  expect(api.saveMember).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 2, aliases: ['Lee, Jr'], guardianMemberId: 3 }),
    'rev-3'
  )
  // The free text the guardian was seeded from is already on their own notes; keeping it
  // here too would repeat their contact details in a plain CSV export.
  expect(vi.mocked(api.saveMember).mock.calls[1][0]).not.toHaveProperty('guardianContact')
})

it('refreshes before linking a guardian whose own save refresh had failed', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const guardian = makeMember({
    id: 3,
    firstName: 'Meg',
    lastName: 'Lee',
    dob: undefined,
    email: 'mum@example.org',
    phone: '07700 900123'
  })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const withGuardian = makeSnapshot({ revision: 'rev-3', nextId: 4, members: [junior, guardian] })
  const linked = makeSnapshot({
    revision: 'rev-4',
    nextId: 4,
    members: [{ ...junior, guardianMemberId: 3 }, guardian]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error('Scan failed'))
      .mockResolvedValueOnce(withGuardian)
      .mockResolvedValue(linked),
    saveMember: vi
      .fn<RendererApi['saveMember']>()
      .mockResolvedValueOnce(guardian)
      .mockResolvedValueOnce({ ...junior, guardianMemberId: 3 })
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))
  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved Meg Lee, but the list could not be refreshed'
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))

  // The cache is still stale from the failed refresh; linking must refresh again itself
  // rather than read that stale revision, or main refuses the link as out of date.
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledTimes(2))
  expect(api.saveMember).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 2, firstName: 'Kid', guardianMemberId: 3 }),
    'rev-3'
  )
  const profile = await screen.findByRole('article', { name: 'Kid Lee profile' })
  expect(profile).toHaveTextContent('Linked guardian')
})

it('holds the workspace busy while a guardian link is being saved', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const guardian = makeMember({
    id: 3,
    firstName: 'Meg',
    lastName: 'Lee',
    dob: undefined,
    email: 'mum@example.org',
    phone: '07700 900123'
  })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const refresh = deferred<ReturnType<typeof makeSnapshot>>()
  const link = deferred<typeof junior>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      // The guardian's own save refresh fails, so the guardian is still missing from the
      // cache when linking starts and it must refresh again itself before it can write.
      .mockRejectedValueOnce(new Error('Scan failed'))
      .mockImplementationOnce(() => refresh.promise),
    saveMember: vi
      .fn<RendererApi['saveMember']>()
      .mockResolvedValueOnce(guardian)
      .mockImplementationOnce(() => link.promise)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))
  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saved Meg Lee, but the list could not be refreshed'
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))

  // The link's own pre-flight refresh is now in flight, before it has even tried to write:
  // the hold must cover that window too, not only the write that follows it.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New member…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  )
  expect(api.saveMember).toHaveBeenCalledOnce()

  await act(async () =>
    refresh.resolve(makeSnapshot({ revision: 'rev-3', nextId: 4, members: [junior, guardian] }))
  )
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledTimes(2))
  // The write itself has started; the hold must not drop between the two steps.
  expect(screen.getByRole('button', { name: 'New member…' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )

  await act(async () => link.resolve({ ...junior, guardianMemberId: 3 }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New member…' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  )
})

it('mentions a guardian link left unsaved when the page is left before the guardian saves', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const withGuardian = makeSnapshot({
    revision: 'rev-3',
    nextId: 4,
    members: [junior, makeMember({ id: 3, firstName: 'Meg', lastName: 'Lee' })]
  })
  const save = deferred<ReturnType<typeof makeMember>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(withGuardian),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  const view = renderWithProviders(<MembersView tree={makeTree()} />)

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))
  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  view.rerender(<p>Another page</p>)
  await act(async () => save.resolve(makeMember({ id: 3, firstName: 'Meg', lastName: 'Lee' })))

  // A guardian saved but not linked is a partial failure, not a success: it must go
  // through the error channel, not a green success toast.
  const toast = await screen.findByRole('dialog')
  expect(toast).toHaveTextContent(/did not link them as Kid Lee’s guardian/)
  expect(toast.className).toMatch(/kumo-danger/)
  expect(api.saveMember).toHaveBeenCalledOnce()
})

it('mentions a guardian link left unsaved when the page is left and the refresh then fails', async () => {
  const junior = makeMember({
    id: 2,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    email: undefined,
    guardianContact: 'Mum, mum@example.org, 07700 900123'
  })
  const initial = makeSnapshot({ revision: 'rev-2', nextId: 3, members: [junior] })
  const save = deferred<ReturnType<typeof makeMember>>()
  const refresh = deferred<ReturnType<typeof makeSnapshot>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => refresh.promise),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  const view = renderWithProviders(<MembersView tree={makeTree()} />)

  await user.click(await screen.findByRole('button', { name: /Kid Lee, member/ }))
  await user.click(screen.getByRole('button', { name: 'Add guardian as a member…' }))
  const form = screen.getByRole('form', { name: 'New member: guardian of Kid Lee' })
  await user.type(within(form).getByLabelText(/first name/i), 'Meg')
  await user.type(within(form).getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())

  // The guardian's own save resolves while the editor is still mounted, so its refresh
  // starts as a genuine refetch; only once that refresh is under way does the desk leave,
  // and only then does the refresh itself fail.
  await act(async () => save.resolve(makeMember({ id: 3, firstName: 'Meg', lastName: 'Lee' })))
  view.rerender(<p>Another page</p>)
  await act(async () => refresh.reject(new Error('Scan failed')))

  // Both the refresh failure and the unmade link are true; the toast must not report
  // this as a plain refresh problem and stay silent about the guardian.
  const toast = await screen.findByRole('dialog')
  expect(toast).toHaveTextContent(
    'Saved Meg Lee in /root, but the members list could not be refreshed: Scan failed'
  )
  expect(toast).toHaveTextContent('before Kid Lee could be linked as their guardian')
  expect(toast.className).toMatch(/kumo-danger/)
  expect(api.saveMember).toHaveBeenCalledOnce()
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

async function discardDraft(
  user: ReturnType<typeof userEvent.setup>,
  title: string
): Promise<void> {
  const prompt = await screen.findByRole('dialog', { name: title })
  await user.click(within(prompt).getByRole('button', { name: 'Discard' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument())
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
  await discardDraft(user, 'Discard the new member?')
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()

  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.clear(screen.getByLabelText(/first name/i))
  await user.type(screen.getByLabelText(/first name/i), 'Changed')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await discardDraft(user, 'Discard changes to Ann Lee?')
  expect(screen.getByRole('article', { name: 'Ann Lee profile' })).toBeInTheDocument()
})

it('switches rows and cancels from an untouched form without asking', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.type(screen.getByLabelText(/first name/i), '  ')
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'New member…' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
})

it('asks before a row click discards an edited record', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.type(screen.getByLabelText(/first name/i), 'ie')
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))

  const prompt = await screen.findByRole('dialog', { name: 'Discard changes to Ann Lee?' })
  expect(prompt).toHaveTextContent(
    'Their record keeps the details it had before you started editing.'
  )
  await waitFor(() =>
    expect(within(prompt).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  )
  await user.click(within(prompt).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  )
  expect(screen.getByRole('form', { name: 'Edit Ann Lee' })).toBeInTheDocument()
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Annie')

  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  await discardDraft(user, 'Discard changes to Ann Lee?')
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
})

it('closes the discard prompt without acting when a refresh lands while it is open', async () => {
  const initial = twoMembersSnapshot()
  const queryClient = createQueryClient()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(initial)
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.type(screen.getByLabelText(/first name/i), 'ie')
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  await screen.findByRole('dialog', { name: 'Discard changes to Ann Lee?' })

  // A watcher refresh lands while the prompt is open: Discard would have opened Bob's
  // editor stamped with this new revision but seeded from the record as it stood before,
  // silently overwriting whatever changed him. Closing the prompt instead keeps Ann's
  // draft open, untouched, for the desk to retry against the fresh list.
  act(() => {
    queryClient.setQueryData(membersQueryKey('/root'), { ...initial, revision: 'rev-3' })
  })

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  )
  expect(screen.getByRole('form', { name: 'Edit Ann Lee' })).toBeInTheDocument()
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Annie')
})

it('asks before New member… replaces a dirty form and keeps editing on Escape', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.click(screen.getByRole('button', { name: 'New member…' }))

  const prompt = await screen.findByRole('dialog', { name: 'Discard the new member?' })
  expect(prompt).toHaveTextContent('Nothing has been saved, so nobody is added to the list.')
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  )
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Cy')

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Edit…' }))
  await discardDraft(user, 'Discard the new member?')
  expect(screen.getByRole('form', { name: 'Edit Bob Kay' })).toBeInTheDocument()
  expect(screen.getByLabelText(/first name/i)).toHaveValue('Bob')
})

it('moves focus to the profile heading when a form is left', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.getByRole('heading', { name: 'Ann Lee' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  expect(screen.getByRole('article', { name: 'Bob Kay profile' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Bob Kay' })).not.toHaveFocus()
})

it.each(['Cancel', 'Close'] as const)(
  'shows the saved details when an edit is closed with %s after its refresh failed',
  async (buttonName) => {
    const initial = twoMembersSnapshot()
    const saved = makeMember({ id: 1, firstName: 'Ann', lastName: 'Li', phone: '0700' })
    const membersSnapshot = vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error('Scan failed'))
    const api = installMockApi({
      getRoot: vi.fn().mockResolvedValue('/root'),
      membersSnapshot,
      saveMember: vi.fn().mockResolvedValue(saved)
    })
    const user = userEvent.setup()
    renderMembers()

    await user.click(await screen.findByRole('button', { name: /Ann Lee, member/ }))
    await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Edit…' }))
    await user.clear(screen.getByLabelText(/last name/i))
    await user.type(screen.getByLabelText(/last name/i), 'Li')
    await user.click(screen.getByRole('button', { name: 'Save member' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Saved Ann Li')
    await user.click(screen.getByRole('button', { name: buttonName }))

    const profile = screen.getByRole('article', { name: 'Ann Li profile' })
    expect(profile).toHaveTextContent('0700')
    expect(screen.getByRole('row', { name: /Ann Lee/ })).toBeInTheDocument()
    expect(api.saveMember).toHaveBeenCalledOnce()
  }
)

it('resizes the list from the keyboard and abandons a cancelled drag', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 600,
    toJSON: () => ({})
  })
  const user = userEvent.setup()
  renderMembers()

  const divider = await screen.findByRole('separator', { name: 'Resize member list' })
  const list = screen.getByRole('region', { name: 'Member list' })
  expect(divider).toHaveAttribute('aria-controls', list.id)
  expect(divider).toHaveAttribute('aria-valuenow', '34')
  divider.focus()
  await user.keyboard('{End}')
  expect(divider).toHaveAttribute('aria-valuenow', '55')
  await user.keyboard('{Home}')
  expect(divider).toHaveAttribute('aria-valuenow', '24')
  await user.keyboard('{ArrowRight}')
  expect(divider).toHaveAttribute('aria-valuetext', 'List takes 26% of the width')
  expect(localStorage.getItem('leagues:members-workspace:v1')).toBe('26')

  fireEvent.pointerDown(divider, { clientX: 100, pointerId: 1, buttons: 1 })
  fireEvent.pointerMove(divider, { clientX: 200, pointerId: 1, buttons: 1 })
  expect(list).toHaveStyle({ width: '36%' })
  fireEvent.pointerCancel(divider, { pointerId: 1 })
  expect(list).toHaveStyle({ width: '26%' })
  expect(divider).toHaveAttribute('aria-valuenow', '26')
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
  await discardDraft(user, 'Discard the new member?')
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

it.each([
  {
    outcome: 'succeeds',
    settle: (save: Deferred<ReturnType<typeof makeMember>>) =>
      save.resolve(makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })),
    message: 'Saved Cy Dee in /root'
  },
  {
    outcome: 'fails',
    settle: (save: Deferred<ReturnType<typeof makeMember>>) =>
      save.reject(new Error('Disk is locked')),
    message: 'Couldn’t save Cy Dee in /root: Disk is locked'
  }
])('reports a save that $outcome after the page was left', async ({ settle, message }) => {
  const save = deferred<ReturnType<typeof makeMember>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot()),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  const view = renderWithProviders(<MembersView tree={makeTree()} />)

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  view.rerender(<p>Another page</p>)
  await act(async () => settle(save))

  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(api.saveMember).toHaveBeenCalledOnce()
})

it('merges an ordered selection in the pane and keeps manual results across source changes', async () => {
  const initial = makeSnapshot({
    revision: 'rev-3',
    nextId: 4,
    members: [
      makeMember({
        id: 1,
        firstName: 'Ann',
        lastName: 'Lee',
        aliases: ['Annie'],
        mbdIds: ['A1'],
        notes: 'Ann note'
      }),
      makeMember({
        id: 2,
        firstName: 'Bob',
        lastName: 'Kay',
        aliases: ['Bobby'],
        mbdIds: ['B2'],
        notes: 'Bob note'
      }),
      makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
    ]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(initial)
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  expect(await screen.findByRole('region', { name: 'Merge members workspace' })).toHaveTextContent(
    '1 selected'
  )
  expect(screen.getByRole('checkbox', { name: /Merge Bob Kay, member 000002/ })).toBeChecked()
  await user.click(screen.getByRole('button', { name: /Ann Lee, member 000001/ }))
  expect(screen.getByText('2 selected')).toBeInTheDocument()
  expect(screen.getByLabelText('Main record')).toHaveTextContent('000002 Bob Kay')

  await user.clear(screen.getByLabelText('First name'))
  await user.type(screen.getByLabelText('First name'), 'Robin')
  await user.click(screen.getByRole('checkbox', { name: /Merge Bob Kay, member 000002/ }))
  expect(screen.getByText('1 selected')).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: /Merge Bob Kay, member 000002/ }))
  expect(screen.getByLabelText('Main record')).toHaveTextContent('000001 Ann Lee')
  expect(screen.getByLabelText('First name')).toHaveValue('Robin')

  await user.click(screen.getByRole('checkbox', { name: /Merge Cy Dee, member 000003/ }))
  const firstNameSources = screen.getByLabelText('First name source values')
  await user.click(within(firstNameSources).getByRole('button', { name: /Cy.*Cy Dee/ }))
  expect(screen.getByLabelText('First name')).toHaveValue('Cy')
  await user.click(screen.getByRole('checkbox', { name: /Merge Cy Dee, member 000003/ }))
  expect(screen.getByRole('status')).toHaveTextContent('chosen source record was removed')
  expect(screen.getByLabelText('First name')).toHaveValue('Ann')
  await user.click(screen.getByRole('button', { name: 'Use default' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()

  const noteSources = screen.getByLabelText('Notes source values')
  await user.click(within(noteSources).getByRole('button', { name: /Bob note/ }))
  expect(screen.getByLabelText('Combined notes')).toHaveValue('Bob note')
  await user.click(screen.getByRole('button', { name: /Combined \(default\)/ }))
  expect(screen.getByLabelText('Combined notes')).toHaveValue('Ann note\n\nBob note')
  await user.clear(screen.getByLabelText('First name'))
  await user.type(screen.getByLabelText('First name'), 'Robin')

  await user.type(screen.getByRole('searchbox', { name: 'Filter members' }), 'Ann')
  expect(screen.queryByRole('row', { name: /Bob Kay/ })).not.toBeInTheDocument()
  expect(screen.getByText('2 selected')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Merge members' }))

  await waitFor(() => expect(api.mergeMemberGroup).toHaveBeenCalledOnce())
  expect(api.mergeMemberGroup).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceIds: [1, 2],
      mainId: 1,
      expectedRevision: 'rev-3',
      result: expect.objectContaining({
        firstName: 'Robin',
        aliases: expect.arrayContaining(['Annie', 'Bobby', 'Ann Lee', 'Bob Kay']),
        mbdIds: ['A1', 'B2'],
        notes: 'Ann note\n\nBob note'
      })
    })
  )
})

it('shows the linked guardian row in a merge and honestly names its source', async () => {
  const guardianA = makeMember({ id: 10, firstName: 'Gran', lastName: 'Lee' })
  const guardianB = makeMember({ id: 11, firstName: 'Pop', lastName: 'Lee' })
  const initial = makeSnapshot({
    revision: 'rev-3',
    nextId: 12,
    members: [
      guardianA,
      guardianB,
      makeMember({
        id: 1,
        firstName: 'Ann',
        lastName: 'Lee',
        dob: '2015-01-01',
        email: undefined,
        guardianMemberId: 10
      }),
      makeMember({
        id: 2,
        firstName: 'Annie',
        lastName: 'Lee',
        dob: '2015-01-01',
        email: undefined,
        guardianMemberId: 11
      })
    ]
  })
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(initial)
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Ann Lee')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Annie Lee/ }))

  const guardianSources = screen.getByLabelText('Linked guardian source values')
  expect(
    within(guardianSources).getByRole('button', { name: /000010 Gran Lee/ })
  ).toBeInTheDocument()
  expect(
    within(guardianSources).getByRole('button', { name: /000011 Pop Lee/ })
  ).toBeInTheDocument()
  expect(
    screen.getByText('Linked guardian: Gran Lee (000010), from Ann Lee (1).')
  ).toBeInTheDocument()

  await user.click(within(guardianSources).getByRole('button', { name: /000011 Pop Lee/ }))
  expect(
    screen.getByText('Linked guardian: Pop Lee (000011), from Annie Lee (2).')
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Merge members' }))
  await waitFor(() => expect(api.mergeMemberGroup).toHaveBeenCalledOnce())
  expect(api.mergeMemberGroup).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ guardianMemberId: 11 }) })
  )
})

const TWENTY_CLICKS_TIMEOUT = 20_000

it(
  'keeps twenty merge selections compact and refuses duplicate records',
  async () => {
    const members = Array.from({ length: 20 }, (_, index) =>
      makeMember({ id: index + 1, firstName: `Member${index + 1}`, lastName: 'Test' })
    )
    members.push(makeMember({ id: 21, firstName: 'Duplicate one', lastName: 'Test' }))
    members.push(makeMember({ id: 21, firstName: 'Duplicate two', lastName: 'Test' }))
    installMockApi({
      getRoot: vi.fn().mockResolvedValue('/root'),
      membersSnapshot: vi.fn().mockResolvedValue(
        makeSnapshot({
          nextId: 22,
          members,
          problems: [{ kind: 'duplicate-number', id: 21, count: 2 }]
        })
      )
    })
    const user = userEvent.setup()
    renderMembers()

    await openRowMenu(user, 'Member1 Test')
    await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
    for (let id = 2; id <= 20; id += 1) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(`Merge Member${id} Test`) }))
    }
    expect(screen.getByText('20 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Selected records (20)' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    for (const checkbox of screen.getAllByRole('checkbox', { name: /Merge Duplicate/ })) {
      expect(checkbox).toHaveAttribute('aria-disabled', 'true')
    }
  },
  TWENTY_CLICKS_TIMEOUT
)

it('blocks a merge draft when the members revision changes', async () => {
  const queryClient = createQueryClient()
  const initial = twoMembersSnapshot()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(initial)
  })
  const user = userEvent.setup()
  renderWithProviders(<MembersView tree={makeTree()} />, { queryClient })

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
  act(() => queryClient.setQueryData(membersQueryKey('/root'), { ...initial, revision: 'rev-3' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('members list changed')
  expect(screen.getByRole('button', { name: 'Merge members' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Merge Ann Lee/ })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it.each(['Cancel', 'Close'] as const)(
  'opens the written survivor when a merge refresh fails and %s is used',
  async (buttonName) => {
    const initial = twoMembersSnapshot()
    const saved = makeMember({ id: 2, firstName: 'Robert', lastName: 'Kay' })
    const membersSnapshot = vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error('Members scan failed'))
    const api = installMockApi({
      getRoot: vi.fn().mockResolvedValue('/root'),
      membersSnapshot,
      mergeMemberGroup: vi.fn().mockResolvedValue(saved)
    })
    const user = userEvent.setup()
    renderMembers()

    await openRowMenu(user, 'Bob Kay')
    await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
    await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
    await user.click(screen.getByRole('button', { name: 'Merge members' }))

    expect(
      await screen.findByText(/Merged Robert Kay, but the list could not be refreshed/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Cancel and start the merge again/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: buttonName }))
    expect(screen.getByRole('article', { name: 'Robert Kay profile' })).toBeInTheDocument()
    expect(api.mergeMemberGroup).toHaveBeenCalledOnce()
  }
)

it('retries only the refresh after a completed merge', async () => {
  const initial = twoMembersSnapshot()
  const saved = makeMember({ id: 2, firstName: 'Robert', lastName: 'Kay' })
  const refreshed = makeSnapshot({
    revision: 'rev-3',
    nextId: 3,
    members: [saved, { ...initial.members[0], mergedInto: 2 }]
  })
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(new Error('Members scan failed'))
    .mockResolvedValueOnce(refreshed)
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot,
    mergeMemberGroup: vi.fn().mockResolvedValue(saved)
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
  await user.click(screen.getByRole('button', { name: 'Merge members' }))
  await user.click(await screen.findByRole('button', { name: 'Retry refresh' }))

  expect(await screen.findByRole('article', { name: 'Robert Kay profile' })).toBeInTheDocument()
  expect(api.mergeMemberGroup).toHaveBeenCalledOnce()
  expect(membersSnapshot).toHaveBeenCalledTimes(3)
})

it('asks before Cancel discards a merge whose selection changed', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await screen.findByRole('region', { name: 'Merge members workspace' })
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Merge members workspace' })).not.toBeInTheDocument()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  const prompt = await screen.findByRole('dialog', { name: 'Discard the merge?' })
  expect(prompt).toHaveTextContent('No records are changed')
  await user.click(within(prompt).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Discard/ })).not.toBeInTheDocument()
  )
  expect(screen.getByText('2 selected')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await discardDraft(user, 'Discard the merge?')
  expect(screen.queryByRole('region', { name: 'Merge members workspace' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Select a member' })).toBeInTheDocument()
})

it('holds Cancel while a merge is being written', async () => {
  const merge = deferred<ReturnType<typeof makeMember>>()
  const saved = makeMember({ id: 2, firstName: 'Robert', lastName: 'Kay' })
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValueOnce(twoMembersSnapshot())
    .mockResolvedValue(makeSnapshot({ revision: 'rev-3', nextId: 3, members: [saved] }))
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot,
    mergeMemberGroup: vi.fn(() => merge.promise)
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
  await user.click(screen.getByRole('button', { name: 'Merge members' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled())
  expect(screen.getByRole('button', { name: 'Merging…' })).toBeDisabled()
  await act(async () => merge.resolve(saved))
  expect(await screen.findByRole('article', { name: 'Robert Kay profile' })).toBeInTheDocument()
})

it.each([
  {
    outcome: 'succeeds',
    settle: (merge: Deferred<ReturnType<typeof makeMember>>) =>
      merge.resolve(makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay' })),
    message: 'Merged Bob Kay in /root'
  },
  {
    outcome: 'fails',
    settle: (merge: Deferred<ReturnType<typeof makeMember>>) =>
      merge.reject(new Error('Disk is locked')),
    message: 'Couldn’t merge Bob Kay in /root: Disk is locked'
  }
])('reports a merge that $outcome after the page was left', async ({ settle, message }) => {
  const merge = deferred<ReturnType<typeof makeMember>>()
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot()),
    mergeMemberGroup: vi.fn(() => merge.promise)
  })
  const user = userEvent.setup()
  const view = renderWithProviders(<MembersView tree={makeTree()} />)

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee/ }))
  await user.click(screen.getByRole('button', { name: 'Merge members' }))
  expect(screen.getByRole('checkbox', { name: /Merge Ann Lee/ })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  view.rerender(<p>Another page</p>)
  await act(async () => settle(merge))

  expect(await screen.findByText(message)).toBeInTheDocument()
  expect(api.mergeMemberGroup).toHaveBeenCalledOnce()
})

it('holds the rows and toolbar while a member is being written', async () => {
  const initial = twoMembersSnapshot()
  const saved = makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
  const save = deferred<ReturnType<typeof makeMember>>()
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi
      .fn<RendererApi['membersSnapshot']>()
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(
        makeSnapshot({ revision: 'rev-3', nextId: 4, members: [...initial.members, saved] })
      ),
    saveMember: vi.fn(() => save.promise)
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  expect(screen.getByRole('button', { name: 'New member…' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /Bob Kay, member/ }))
  expect(screen.getByRole('form', { name: 'New member' })).toBeInTheDocument()
  // The form is dirty (Cy Dee typed above), so without the busy hold this click would
  // have opened the discard prompt instead of doing nothing.
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Keep editing' })).not.toBeInTheDocument()
  await openRowMenu(user, 'Bob Kay')
  expect(screen.getByRole('menuitem', { name: 'Edit…' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('menuitem', { name: 'Merge with…' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await user.keyboard('{Escape}')
  await act(async () => save.resolve(saved))

  expect(await screen.findByRole('article', { name: 'Cy Dee profile' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New member…' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it('reviews a guardian contact carried onto an adult result', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        revision: 'rev-2',
        nextId: 3,
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
          makeMember({
            id: 2,
            firstName: 'Annie',
            lastName: 'Lee',
            dob: '2000-01-01',
            email: undefined,
            guardianContact: 'Mum 07700 900001'
          })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Ann Lee')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Annie Lee/ }))

  const guardian = screen.getByLabelText('Parent or guardian contact')
  expect(guardian).toHaveValue('Mum 07700 900001')
  expect(screen.getByText(/stays on the result until it is cleared here/)).toBeInTheDocument()
  await user.clear(guardian)
  await user.click(screen.getByRole('button', { name: 'Merge members' }))

  await waitFor(() => expect(api.mergeMemberGroup).toHaveBeenCalledOnce())
  const [request] = vi.mocked(api.mergeMemberGroup).mock.calls[0]
  expect(request.result.guardianContact).toBeUndefined()
  expect(request.result.email).toBe('jane@example.org')
})

it('shows which roster entry a merge keeps, without calling singles bowlers substitutes', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(
      makeSnapshot({
        revision: 'rev-2',
        nextId: 8,
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
          makeMember({ id: 2, firstName: 'Annie', lastName: 'Lee' }),
          makeMember({ id: 6, firstName: 'Old Ann', lastName: 'Lee', mergedInto: 1 })
        ],
        seasons: [
          makeRosterSeason({
            leagueName: 'Mixed Triples',
            path: '/root/monday/Mixed triples/2025-26',
            file: makeSeasonFile({
              teams: [
                { id: 'team_a', teamNo: 1, name: 'Strikers' },
                { id: 'team_b', teamNo: 2, name: 'Spares' }
              ],
              players: [
                { memberId: 6, teamId: 'team_b' },
                { memberId: 1, teamId: 'team_a', position: 2 },
                { memberId: 2, teamId: null, leagueSecretaryId: 'ls-2' }
              ]
            })
          }),
          makeRosterSeason({
            leagueName: 'Tuesday Singles',
            leagueFolder: 'Singles',
            day: 'tuesday',
            file: makeSeasonFile({
              format: 1,
              players: [
                { memberId: 1, teamId: null, position: 1 },
                { memberId: 2, teamId: null, position: 4 }
              ]
            })
          })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Annie Lee')
  await user.click(screen.getByRole('menuitem', { name: 'Merge with…' }))
  await user.click(screen.getByRole('checkbox', { name: /Merge Ann Lee, member 000001/ }))

  const rosters = screen.getByRole('heading', { name: 'Roster assignments' }).closest('section')!
  const triples = within(rosters)
    .getByText(/Mixed Triples/)
    .closest('li')!
  expect(within(triples).getByText(/Old Ann Lee|listed as 000006/)).toHaveTextContent(
    'Ann Lee (1): Spares, listed as 000006 (dropped)'
  )
  expect(within(triples).getByText(/Strikers/)).toHaveTextContent(
    'Ann Lee (1): Strikers, position 2 (dropped)'
  )
  expect(within(triples).getByText(/LeagueSecretary/)).toHaveTextContent(
    'Annie Lee (2): Substitute, LeagueSecretary id ls-2 (kept)'
  )
  const singles = within(rosters)
    .getByText(/Tuesday Singles/)
    .closest('li')!
  expect(singles).not.toHaveTextContent('Substitute')
  expect(within(singles).getByText(/position 4/)).toHaveTextContent(
    'Annie Lee (2): position 4 (kept)'
  )

  await user.click(screen.getByLabelText('Main record'))
  await user.click(await screen.findByRole('option', { name: /000001 Ann Lee/ }))
  expect(within(rosters).getByText(/Strikers/)).toHaveTextContent('(kept)')
  expect(within(rosters).getByText(/LeagueSecretary/)).toHaveTextContent('(dropped)')
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

it('names a roster still listing an absorbed number and tidies it on request', async () => {
  const members = [
    makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
    makeMember({ id: 6, firstName: 'Old Ann', lastName: 'Lee', mergedInto: 1 })
  ]
  const membersSnapshot = vi
    .fn<RendererApi['membersSnapshot']>()
    .mockResolvedValueOnce(
      makeSnapshot({
        revision: 'rev-2',
        nextId: 7,
        members,
        problems: [
          { kind: 'absorbed-number', path: '/root/monday/Pairs/2026-27', memberId: 6, into: 1 }
        ]
      })
    )
    .mockResolvedValue(makeSnapshot({ revision: 'rev-3', nextId: 7, members }))
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot,
    repairRosters: vi.fn().mockResolvedValue(1)
  })
  const user = userEvent.setup()
  renderMembers()

  const problems = await screen.findByRole('region', { name: 'Problems' })
  expect(problems).toHaveTextContent(
    'monday/Pairs/2026-27 lists member 6 under a number that was merged into member 1'
  )
  // A second machine can see this banner before OneDrive has actually synced the roster.
  expect(problems).toHaveTextContent('wait until syncing has finished before tidying up')
  await user.click(within(problems).getByRole('button', { name: 'Tidy up rosters' }))

  expect(await screen.findByText('Tidied 1 roster')).toBeInTheDocument()
  expect(api.repairRosters).toHaveBeenCalledWith('rev-2')
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Problems' })).not.toBeInTheDocument()
  )
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
  await discardDraft(user, 'Discard the new member?')

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

it('ignores a dropped export while a pane write is pending', async () => {
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

  const zone = screen.getByRole('table', { name: 'Members' }).closest('[data-import-drop-target]')
  if (!zone) throw new Error('No drop target around the members table')
  // Dropping a file while the save is pending would otherwise show "Discard the new
  // member?" with copy that says nothing was saved, which is false, and Discard would
  // unmount the editor mid-write.
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['x'], 'bowlers.csv')], types: ['Files'] }
  })

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.previewImport).not.toHaveBeenCalled()
  expect(screen.getByRole('form', { name: 'New member' })).toBeInTheDocument()
  await act(async () => save.resolve(makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })))
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
