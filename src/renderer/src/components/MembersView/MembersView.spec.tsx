import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { MembersView } from './index'
import {
  makeMember,
  makeRosterSeason,
  makeSeasonFile,
  makeSnapshot,
  makeTree
} from '../../tests/fixtures'
import { installMockApi, type RendererApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

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
  expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument()

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
  expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument()
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
