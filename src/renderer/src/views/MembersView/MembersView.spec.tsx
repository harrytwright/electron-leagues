import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { MembersView } from './index'
import {
  makeMember,
  makeRosterSeason,
  makeSeasonFile,
  makeSnapshot,
  makeTree
} from '@renderer/tests/fixtures'
import { installMockApi, type RendererApi } from '@renderer/tests/mock-api'
import { renderWithProviders } from '@renderer/tests/render-helpers'

function renderMembers(): void {
  renderWithProviders(<MembersView tree={makeTree()} />)
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
  expect(within(ann).getByText('jane@example.org · 07700 900000')).toBeInTheDocument()
  expect(within(ann).getByText('Mixed Triples')).toBeInTheDocument()
  const kid = screen.getByRole('row', { name: /Kid Lee/ })
  expect(within(kid).getByText('Needs details')).toBeInTheDocument()
  expect(within(kid).getByText('Mixed Triples (sub)')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Problems' })).toHaveTextContent(
    'monday/Pairs/2025-26 lists member 9, who is not in the master list'
  )
  expect(screen.getByText('2 members')).toBeInTheDocument()

  await user.type(screen.getByRole('searchbox', { name: 'Filter members' }), 'ann')
  expect(screen.queryByRole('row', { name: /Kid Lee/ })).not.toBeInTheDocument()
  expect(screen.getByRole('row', { name: /Ann Lee/ })).toBeInTheDocument()
})

it('explains an empty list', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(makeSnapshot())
  })
  renderMembers()

  expect(await screen.findByText(/No members yet/)).toBeInTheDocument()
  expect(screen.getByText('0 members')).toBeInTheDocument()
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

it('adds a new member from the toolbar', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await user.click(await screen.findByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'Cy')
  await user.type(screen.getByLabelText(/last name/i), 'Dee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(api.saveMember).toHaveBeenCalledWith(
    expect.objectContaining({ firstName: 'Cy', lastName: 'Dee' }),
    'rev-2'
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('merges one member into another from the row menu', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    membersSnapshot: vi.fn().mockResolvedValue(twoMembersSnapshot())
  })
  const user = userEvent.setup()
  renderMembers()

  await openRowMenu(user, 'Bob Kay')
  await user.click(screen.getByRole('menuitem', { name: 'Merge into…' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Merge Bob Kay into…')
  screen.getByLabelText(/keep/i).focus()
  await user.keyboard('{ArrowDown}')
  await user.click(await screen.findByRole('option', { name: '000001 Ann Lee' }))
  await user.click(screen.getByRole('button', { name: 'Merge members' }))

  await waitFor(() => expect(api.mergeMembers).toHaveBeenCalledExactlyOnceWith(2, 1, 'rev-2'))
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

  await openRowMenu(user, 'Second Holder')
  await user.click(screen.getByRole('menuitem', { name: /keep this number/i }))

  await waitFor(() => expect(api.renumberDuplicates).toHaveBeenCalledExactlyOnceWith(3, 1, 'rev-3'))
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
    dataTransfer: { files: [new File(['x'], 'scores.xlsx')], types: ['Files'] }
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

it('prints a card from the row menu and a sheet for everyone shown, and opens the export', async () => {
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
  await user.click(screen.getByRole('menuitem', { name: 'Print card' }))
  await waitFor(() => expect(api.printCards).toHaveBeenCalledExactlyOnceWith([1], 'rev-5'))
  expect(await screen.findByText(/Made a sheet of 1 card/)).toBeInTheDocument()

  // Hidden members are never on the sheet, so only the two listed go.
  await user.click(screen.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Print 2 cards' }))
  await waitFor(() => expect(api.printCards).toHaveBeenLastCalledWith([2, 1], 'rev-5'))

  await user.click(screen.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Export list to CSV…' }))
  expect(await screen.findByRole('dialog', { name: 'Export members to CSV' })).toBeInTheDocument()
})
