import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { SeasonFile } from '@shared/members'
import { SeasonRoster, type SeasonRosterTab } from './index'
import { makeMember, makeRosterSeason, makeSeasonFile, makeSnapshot } from '../../tests/fixtures'
import { installMockApi, type RendererApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const REF = { day: 'monday', leagueFolder: 'Mixed triples', seasonName: '2025-26' }

function file(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return makeSeasonFile({
    format: 2,
    teams: [
      { id: 'team_a', teamNo: 1, name: 'Ants' },
      { id: 'team_b', teamNo: 2, name: 'Bees' }
    ],
    players: [
      { memberId: 1, teamId: 'team_a', position: 1 },
      { memberId: 2, teamId: null }
    ],
    ...overrides
  })
}

function renderTab(
  tab: SeasonRosterTab,
  seasonOverrides: Parameters<typeof makeRosterSeason>[0] = {}
): RendererApi {
  const api = installMockApi({ getRoot: vi.fn().mockResolvedValue('/root') })
  const snapshot = makeSnapshot({
    nextId: 4,
    members: [
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay' }),
      makeMember({ id: 3, firstName: 'Cy', lastName: 'Dee' })
    ]
  })
  const season = makeRosterSeason({ revision: 'season-r9', file: file(), ...seasonOverrides })
  renderWithProviders(<SeasonRoster season={season} snapshot={snapshot} tab={tab} />)
  return api
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  option: string | RegExp
): Promise<void> {
  screen.getByLabelText(label).focus()
  await user.keyboard('{ArrowDown}')
  await user.click(await screen.findByRole('option', { name: option }))
}

it('adds a member to the roster through the dialog', async () => {
  const api = renderTab('players')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Add player…' }))
  await chooseOption(user, /member/i, '000003 Cy Dee')
  await chooseOption(user, /team/i, '2. Bees')
  await user.click(screen.getByRole('button', { name: 'Add player' }))

  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(api.saveSeason).toHaveBeenCalledWith(
    REF,
    file({
      players: [
        { memberId: 1, teamId: 'team_a', position: 1 },
        { memberId: 2, teamId: null },
        { memberId: 3, teamId: 'team_b' }
      ]
    }),
    'season-r9'
  )
})

it('moves a player between teams and removes them from the row menu', async () => {
  const api = renderTab('players')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Actions for Bob Kay' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Move to 2. Bees' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(api.saveSeason).toHaveBeenLastCalledWith(
    REF,
    file({
      players: [
        { memberId: 1, teamId: 'team_a', position: 1 },
        { memberId: 2, teamId: 'team_b' }
      ]
    }),
    'season-r9'
  )

  await user.click(screen.getByRole('button', { name: 'Actions for Ann Lee' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Remove from roster' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledTimes(2))
  expect(api.saveSeason).toHaveBeenLastCalledWith(
    REF,
    file({ players: [{ memberId: 2, teamId: null }] }),
    'season-r9'
  )
})

it('lists a singles season by name with no team column, team moves or team choice', async () => {
  const api = renderTab('players', {
    file: file({
      format: 1,
      teams: [],
      players: [
        { memberId: 2, teamId: null },
        { memberId: 1, teamId: null }
      ]
    })
  })
  const user = userEvent.setup()

  expect(screen.getByText(/everyone bowls for themselves/)).toBeInTheDocument()
  const table = screen.getByRole('table', { name: 'Players' })
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
  ).toEqual(['Number', 'Player', 'Actions'])
  expect(
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent)
  ).toEqual(['000002Bob Kay', '000001Ann Lee'])

  await user.click(screen.getByRole('button', { name: 'Actions for Ann Lee' }))
  const menu = await screen.findByRole('menu')
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
  ).toEqual(['Remove from roster'])
  await user.keyboard('{Escape}')

  await user.click(screen.getByRole('button', { name: 'Add player…' }))
  expect(screen.queryByLabelText(/team/i)).not.toBeInTheDocument()
  await chooseOption(user, /member/i, '000003 Cy Dee')
  await user.click(screen.getByRole('button', { name: 'Add player' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(vi.mocked(api.saveSeason).mock.calls[0][1].players).toEqual([
    { memberId: 2, teamId: null },
    { memberId: 1, teamId: null },
    { memberId: 3, teamId: null }
  ])
})

it('creates a member from the roster and adds them as a sub', async () => {
  const api = renderTab('players')
  api.saveMember = vi
    .fn<RendererApi['saveMember']>()
    .mockResolvedValue(makeMember({ id: 4, firstName: 'New', lastName: 'Person' }))
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'New member…' }))
  await user.type(screen.getByLabelText(/first name/i), 'New')
  await user.type(screen.getByLabelText(/last name/i), 'Person')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(api.saveSeason).toHaveBeenCalledWith(
    REF,
    expect.objectContaining({
      players: [
        { memberId: 1, teamId: 'team_a', position: 1 },
        { memberId: 2, teamId: null },
        { memberId: 4, teamId: null }
      ]
    }),
    'season-r9'
  )
})

it('adds, edits and removes teams', async () => {
  const api = renderTab('teams')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Add team…' }))
  expect(screen.getByLabelText(/team number/i)).toHaveValue(3)
  await user.type(screen.getByLabelText(/team name/i), 'Cats')
  await user.click(screen.getByRole('button', { name: 'Add team' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  const [, added] = vi.mocked(api.saveSeason).mock.calls[0]
  expect(added.teams).toEqual([
    { id: 'team_a', teamNo: 1, name: 'Ants' },
    { id: 'team_b', teamNo: 2, name: 'Bees' },
    { id: expect.stringMatching(/^team_[0-9a-f]{12}$/), teamNo: 3, name: 'Cats' }
  ])

  await user.click(screen.getByRole('button', { name: 'Actions for Bees' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Edit…' }))
  await user.clear(screen.getByLabelText(/team number/i))
  await user.type(screen.getByLabelText(/team number/i), '1')
  await user.click(screen.getByRole('button', { name: 'Save team' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Another team already has number 1')

  await user.clear(screen.getByLabelText(/team number/i))
  await user.type(screen.getByLabelText(/team number/i), '5')
  await user.click(screen.getByRole('button', { name: 'Save team' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.saveSeason).mock.calls[1][1].teams).toContainEqual({
    id: 'team_b',
    teamNo: 5,
    name: 'Bees'
  })

  await user.click(screen.getByRole('button', { name: 'Actions for Ants' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Remove team' }))
  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledTimes(3))
  const [, removed] = vi.mocked(api.saveSeason).mock.calls[2]
  expect(removed.teams.map((team) => team.id)).toEqual(['team_b'])
  expect(removed.players).toEqual([
    { memberId: 1, teamId: null, position: 1 },
    { memberId: 2, teamId: null }
  ])
})

it('saves settings with numbers parsed and blanks dropped', async () => {
  const api = renderTab('settings')
  const user = userEvent.setup()
  const form = screen.getByRole('form', { name: 'Season settings' })

  await user.type(within(form).getByLabelText('Start date'), '2025-09-01')
  await user.type(within(form).getByLabelText(/weeks/i), '30')
  await user.type(within(form).getByLabelText(/player fee/i), '12.5')
  await user.click(within(form).getByRole('button', { name: 'Add fee line' }))
  await user.type(within(form).getByLabelText('Fee line 1 label'), 'Lineage')
  await user.type(within(form).getByLabelText('Fee line 1 amount'), '9')
  await user.click(within(form).getByRole('button', { name: 'Save settings' }))

  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(api.saveSeason).toHaveBeenCalledWith(
    REF,
    file({
      startDate: '2025-09-01',
      weeks: 30,
      fees: { total: 12.5, breakdown: [{ label: 'Lineage', amount: 9 }] }
    }),
    'season-r9'
  )
})

it('drops the teams and team ids when the format becomes singles', async () => {
  const api = renderTab('settings')
  const user = userEvent.setup()
  const form = screen.getByRole('form', { name: 'Season settings' })

  await chooseOption(user, /format/i, /singles/i)
  await user.click(within(form).getByRole('button', { name: 'Save settings' }))

  await waitFor(() => expect(api.saveSeason).toHaveBeenCalledOnce())
  expect(api.saveSeason).toHaveBeenCalledWith(
    REF,
    file({
      format: 1,
      teams: [],
      players: [
        { memberId: 1, teamId: null, position: 1 },
        { memberId: 2, teamId: null }
      ]
    }),
    'season-r9'
  )
})

it('adds players from an export picked or dropped on the players tab', async () => {
  const api = renderTab('players')
  vi.mocked(api.pickImportFile).mockResolvedValue('/exports/league.csv')
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Add from export…' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Add players to 2025-26 from an export'
  )
  await waitFor(() =>
    expect(api.previewImport).toHaveBeenCalledExactlyOnceWith('/exports/league.csv')
  )
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

  const zone = screen.getByRole('table', { name: 'Players' }).closest('[data-import-drop-target]')
  if (!zone) throw new Error('No drop target around the players table')
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['x'], 'league.csv')], types: ['Files'] }
  })
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'Add players to 2025-26 from an export'
  )
  await waitFor(() => expect(api.previewImport).toHaveBeenLastCalledWith('league.csv'))
})

it('keeps archived seasons read-only on every tab', () => {
  renderTab('players', { archived: true, path: '/root/_archives/Mixed triples/2023-24' })
  expect(screen.queryByRole('button', { name: 'Add player…' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Add from export…' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
})
