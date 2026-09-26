import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { MappingPreview, RosterPlan } from '@shared/imports'
import { RosterImportDialog } from './index'
import { makeMember, makeRosterSeason, makeSeasonFile, makeSnapshot } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const PATH = '/Users/desk/league.csv'
const REF = { day: 'monday', leagueFolder: 'Mixed triples', seasonName: '2025-26' }

const PREVIEW: MappingPreview = {
  path: PATH,
  fileName: 'league.csv',
  columns: ['ID', 'Name', 'Team'],
  sample: [['10', 'Lee, Ann', 'Ants']],
  rowCount: 3,
  choices: [],
  mapping: {
    mbdId: 0,
    firstName: null,
    lastName: null,
    fullName: 1,
    gender: null,
    team: 2,
    league: null
  },
  remembered: false
}

const PLAN: RosterPlan = {
  rows: [
    {
      row: { line: 2, mbdId: '10', firstName: 'Ann', lastName: 'Lee', team: 'Ants' },
      match: { kind: 'on-roster', memberId: 1 }
    },
    {
      row: { line: 3, mbdId: '20', firstName: 'Bob', lastName: 'Kay', team: 'Bees' },
      match: { kind: 'add', memberId: 2 }
    },
    {
      row: { line: 4, mbdId: '99', firstName: 'New', lastName: 'Person', team: 'Bees' },
      match: { kind: 'unknown' }
    }
  ],
  invalid: [],
  newTeams: ['Bees']
}

it('previews, plans and adds the players, creating only the ticked unknowns', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi.fn().mockResolvedValue(PREVIEW),
    planPlayersImport: vi.fn().mockResolvedValue({
      plan: PLAN,
      membersRevision: 'members-r2',
      seasonRevision: 'season-r5',
      sourceRevision: 'export-r1'
    }),
    addPlayersFromExport: vi.fn().mockResolvedValue({
      rows: 3,
      added: 2,
      created: 1,
      restored: 0,
      teamsCreated: 1,
      skipped: 1,
      unknown: 0,
      failed: []
    })
  })
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <RosterImportDialog
      season={makeRosterSeason({
        file: makeSeasonFile({ players: [{ memberId: 1, teamId: null }] })
      })}
      snapshot={makeSnapshot({
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
          makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay' })
        ]
      })}
      path={PATH}
      onOpenChange={onOpenChange}
    />
  )

  expect(await screen.findByText(/First 1 of 3 rows in league.csv/)).toBeInTheDocument()
  expect(screen.getByLabelText('Full name')).toHaveTextContent('Name')
  expect(screen.getByLabelText('Team')).toHaveTextContent('Team')
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() =>
    expect(api.planPlayersImport).toHaveBeenCalledExactlyOnceWith(REF, PATH, PREVIEW.mapping, null)
  )
  expect(await screen.findByText('1 player to add: Bob Kay')).toBeInTheDocument()
  expect(screen.getByText('1 already on the roster')).toBeInTheDocument()
  expect(screen.getByText('1 team to create: Bees')).toBeInTheDocument()
  // Unknown ids are offered, not assumed.
  const create = screen.getByRole('checkbox', { name: 'New Person (MBD 99)' })
  expect(create).not.toBeChecked()
  await user.click(create)
  await user.click(screen.getByRole('button', { name: 'Add players' }))

  await waitFor(() =>
    expect(api.addPlayersFromExport).toHaveBeenCalledExactlyOnceWith(
      REF,
      PATH,
      PREVIEW.mapping,
      null,
      [4],
      'members-r2',
      'season-r5',
      'export-r1'
    )
  )
  expect(
    await screen.findByText(
      'Imported 3 rows: 2 added, 1 new, 1 team created, 1 already on the roster'
    )
  ).toBeInTheDocument()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
