import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { FileEntry, LeagueNode, SeasonNode } from '@shared/tree'
import LeagueView from '../LeagueView'
import { makeLeague } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function season(name: string, status: SeasonNode['status'], files: FileEntry[] = []): SeasonNode {
  return {
    name,
    status,
    path: `/root/monday/Mixed triples/${name}`,
    files
  }
}

function leagueWithArchives(names: string[]): LeagueNode {
  return makeLeague({ archivedSeasons: names })
}

function fullLeague(): LeagueNode {
  return makeLeague({
    seasons: [
      season('2024-25', 'previous', [
        {
          name: 'Final standings.xlsx',
          kind: 'file',
          path: '/root/monday/Mixed triples/2024-25/Final standings.xlsx'
        }
      ]),
      season('2025-26', 'active', [
        {
          name: 'Week 1',
          kind: 'folder',
          path: '/root/monday/Mixed triples/2025-26/Week 1'
        }
      ])
    ],
    otherEntries: [
      {
        name: 'League notes.pdf',
        kind: 'file',
        path: '/root/monday/Mixed triples/League notes.pdf'
      }
    ],
    archivedSeasons: ['2022-23', '2023-24']
  })
}

it('renders seasons newest-first with status badges', () => {
  installMockApi()
  renderWithProviders(<LeagueView league={fullLeague()} onChanged={vi.fn()} />)

  const headings = screen.getAllByRole('heading', { level: 2 })
  const newest = screen.getByRole('heading', { level: 2, name: '2025-26' })
  const previous = screen.getByRole('heading', { level: 2, name: '2024-25' })

  expect(newest.parentElement).toContainElement(screen.getByText('Active'))
  expect(previous.parentElement).toContainElement(screen.getByText('Previous'))
  expect(headings.indexOf(newest)).toBeLessThan(headings.indexOf(previous))
})

it('opens the new-season dialog from the header button', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<LeagueView league={makeLeague()} onChanged={vi.fn()} />)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New season…' }))

  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

it('archive rows: clicking the name label toggles the checkbox once', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<LeagueView league={leagueWithArchives(['2024-25'])} onChanged={vi.fn()} />)

  await user.click(screen.getByText('2024-25'))

  expect(screen.getByRole('checkbox', { name: '2024-25' })).toBeChecked()
})

it('reveals an archived season from its own button without toggling it', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  const league = leagueWithArchives(['2024-25'])
  renderWithProviders(<LeagueView league={league} onChanged={vi.fn()} />)
  const checkbox = screen.getByRole('checkbox', { name: '2024-25' })
  const row = checkbox.closest('li')

  expect(row).not.toBeNull()
  await user.click(within(row!).getByRole('button', { name: 'Show in folder — 2024-25' }))

  expect(api.revealFile).toHaveBeenCalledWith(`${league.archivePath}/2024-25`)
  expect(checkbox).not.toBeChecked()
})

it('zips a selected archive, shows a toast, clears selection, and reports the change', async () => {
  const api = installMockApi()
  const onChanged = vi.fn()
  const user = userEvent.setup()
  const league = leagueWithArchives(['2024-25'])
  renderWithProviders(<LeagueView league={league} onChanged={onChanged} />)

  const checkbox = screen.getByRole('checkbox', { name: '2024-25' })
  await user.click(checkbox)
  await user.click(screen.getByRole('button', { name: 'Zip 1 selected' }))

  expect(api.zipArchive).toHaveBeenCalledWith(league.folderName, ['2024-25'])
  expect(await screen.findByText('Zipped 1 season')).toBeInTheDocument()
  await waitFor(() => expect(checkbox).not.toBeChecked())
  expect(screen.queryByRole('button', { name: 'Zip 1 selected' })).not.toBeInTheDocument()
  expect(onChanged).toHaveBeenCalledOnce()
})

it('keeps archive selection and shows an error toast when zipping fails', async () => {
  const api = installMockApi({
    zipArchive: vi
      .fn()
      .mockRejectedValue(
        new Error("Error invoking remote method 'archive:zip': Error: Archive is locked")
      )
  })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LeagueView league={leagueWithArchives(['2024-25'])} onChanged={onChanged} />)

  const checkbox = screen.getByRole('checkbox', { name: '2024-25' })
  await user.click(checkbox)
  await user.click(screen.getByRole('button', { name: 'Zip 1 selected' }))

  expect(await screen.findByText('Archive is locked')).toBeInTheDocument()
  expect(checkbox).toBeChecked()
  expect(screen.getByRole('button', { name: 'Zip 1 selected' })).toBeInTheDocument()
  expect(api.zipArchive).toHaveBeenCalledWith('Mixed triples', ['2024-25'])
  expect(onChanged).not.toHaveBeenCalled()
})

it('uses plural copy when two archived seasons are selected and zipped', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderWithProviders(
    <LeagueView league={leagueWithArchives(['2023-24', '2024-25'])} onChanged={vi.fn()} />
  )

  await user.click(screen.getByRole('checkbox', { name: '2023-24' }))
  await user.click(screen.getByRole('checkbox', { name: '2024-25' }))
  await user.click(screen.getByRole('button', { name: 'Zip 2 selected' }))

  expect(await screen.findByText('Zipped 2 seasons')).toBeInTheDocument()
})

it('shows "Nothing archived yet" when the archive is empty', () => {
  installMockApi()
  renderWithProviders(<LeagueView league={leagueWithArchives([])} onChanged={vi.fn()} />)

  expect(screen.getByText('Nothing archived yet')).toBeInTheDocument()
})

it('LeagueView sections match snapshot', () => {
  installMockApi()
  const { container } = renderWithProviders(
    <LeagueView league={fullLeague()} onChanged={vi.fn()} />
  )

  // useId values depend on how many components rendered before this test.
  // Replace each distinct id with a stable ordinal so id *wiring* still
  // shows up in the snapshot while the counter offsets do not.
  const seen = new Map<string, string>()
  const normalised = container.innerHTML.replace(/(?:base-ui-)?_r_[a-z0-9]+_/g, (id) => {
    if (!seen.has(id)) seen.set(id, `generated-id-${seen.size + 1}`)
    // SAFETY: the id was inserted on the line above when missing.
    return seen.get(id) as string
  })
  expect(normalised).toMatchSnapshot()
})

it('drops the archive selection when the view switches leagues', async () => {
  installMockApi()
  const user = userEvent.setup()
  const view = renderWithProviders(
    <LeagueView league={leagueWithArchives(['2024-25'])} onChanged={vi.fn()} />
  )

  await user.click(screen.getByRole('checkbox', { name: '2024-25' }))
  expect(screen.getByRole('button', { name: 'Zip 1 selected' })).toBeInTheDocument()

  view.rerender(
    <LeagueView
      league={{ ...leagueWithArchives(['2024-25']), folderName: 'Another league' }}
      onChanged={vi.fn()}
    />
  )

  expect(screen.queryByRole('button', { name: /zip \d+ selected/i })).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: '2024-25' })).not.toBeChecked()
})

it('only offers to zip archives that still exist after a rescan', async () => {
  installMockApi()
  const user = userEvent.setup()
  const view = renderWithProviders(
    <LeagueView league={leagueWithArchives(['2023-24', '2024-25'])} onChanged={vi.fn()} />
  )

  await user.click(screen.getByRole('checkbox', { name: '2023-24' }))
  await user.click(screen.getByRole('checkbox', { name: '2024-25' }))
  expect(screen.getByRole('button', { name: 'Zip 2 selected' })).toBeInTheDocument()

  // A watcher rescan removed one of the selected archives on disk.
  view.rerender(<LeagueView league={leagueWithArchives(['2024-25'])} onChanged={vi.fn()} />)

  expect(screen.getByRole('button', { name: 'Zip 1 selected' })).toBeInTheDocument()
})

it('labels archive checkboxes even when names contain spaces', () => {
  installMockApi()
  renderWithProviders(
    <LeagueView league={leagueWithArchives(['Winter 2024 backup'])} onChanged={vi.fn()} />
  )

  expect(screen.getByRole('checkbox', { name: 'Winter 2024 backup' })).toBeInTheDocument()
})
