import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { DirEntry, LeagueNode, SeasonNode } from '@shared/tree'
import { LeagueView } from './index'
import { revealLabel } from '../../lib/reveal-label'
import { makeDirEntry, makeLeague } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const LEAGUE_PATH = '/root/monday/Mixed triples'
const ARCHIVE_PATH = '/root/_archives/Mixed triples'

function season(name: string, status: SeasonNode['status']): SeasonNode {
  return { name, status, path: `${LEAGUE_PATH}/${name}`, files: [] }
}

function fullLeague(): LeagueNode {
  return makeLeague({
    seasons: [season('2024-25', 'previous'), season('2025-26', 'active')],
    otherEntries: [
      { name: 'League notes.pdf', kind: 'file', path: `${LEAGUE_PATH}/League notes.pdf` }
    ],
    archivedSeasons: ['2022-23', '2023-24'],
    archiveItemCount: 3
  })
}

function listingFor(byDir: Record<string, DirEntry[]>): (dir: string) => Promise<DirEntry[]> {
  return (dir) =>
    byDir[dir]
      ? Promise.resolve(byDir[dir])
      : Promise.reject(
          new Error("Error invoking remote method 'dir:list': Error: That folder no longer exists")
        )
}

const ARCHIVE_LISTING = {
  [ARCHIVE_PATH]: [
    makeDirEntry({ name: '2023-24', kind: 'folder', path: `${ARCHIVE_PATH}/2023-24` }),
    makeDirEntry({ name: '2022-23', kind: 'folder', path: `${ARCHIVE_PATH}/2022-23` }),
    makeDirEntry({ name: '2022-23.zip', path: `${ARCHIVE_PATH}/2022-23.zip` })
  ],
  [`${ARCHIVE_PATH}/2023-24`]: [
    makeDirEntry({ name: 'Rules.docx', path: `${ARCHIVE_PATH}/2023-24/Rules.docx` })
  ]
}

function renderLeague(league: LeagueNode = fullLeague()): ReturnType<typeof vi.fn> {
  const onChanged = vi.fn()
  renderWithProviders(<LeagueView league={league} onChanged={onChanged} />)
  return onChanged
}

async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string
): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return screen.findByRole('menu')
}

function dropZone(): HTMLElement {
  const zone = screen.getByRole('table').closest<HTMLElement>('.ring')
  if (!zone) throw new Error('No drop zone around the table')
  return zone
}

it('shows the league header with its running state', () => {
  installMockApi()
  renderLeague(makeLeague({ running: false, seasons: [] }))

  expect(screen.getByRole('heading', { level: 1, name: 'Mixed triples' })).toBeInTheDocument()
  expect(screen.getByText('Not running')).toBeInTheDocument()
  expect(screen.getByText('No seasons yet')).toBeInTheDocument()
})

it('lists seasons newest-first with badges, then other files, then the archive', () => {
  const api = installMockApi()
  renderLeague()

  const names = screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('button')[0].textContent)
  expect(names).toEqual(['2025-26', '2024-25', 'League notes.pdf', 'Archive'])
  expect(screen.getByRole('row', { name: /2025-26/ })).toHaveTextContent('Active')
  expect(screen.getByRole('row', { name: /2024-25/ })).toHaveTextContent('Previous')
  expect(screen.getByRole('row', { name: /Archive/ })).toHaveTextContent('3 items')
  expect(screen.queryByRole('columnheader', { name: 'Modified' })).not.toBeInTheDocument()
  expect(api.listDir).not.toHaveBeenCalled()
})

it('shows the archive row for zipped-only archives and hides it when empty', () => {
  installMockApi()
  const view = renderWithProviders(
    <LeagueView
      league={makeLeague({ archivedSeasons: [], archiveItemCount: 1 })}
      onChanged={vi.fn()}
    />
  )
  expect(screen.getByRole('row', { name: /Archive/ })).toHaveTextContent('1 item')

  view.rerender(<LeagueView league={makeLeague()} onChanged={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
})

it('drills into a season and back out through the breadcrumbs', async () => {
  installMockApi({
    listDir: vi.fn(
      listingFor({
        [`${LEAGUE_PATH}/2025-26`]: [
          makeDirEntry({ name: 'Week 1', kind: 'folder', path: `${LEAGUE_PATH}/2025-26/Week 1` }),
          makeDirEntry({ name: 'Rules.docx', path: `${LEAGUE_PATH}/2025-26/Rules.docx` })
        ],
        [`${LEAGUE_PATH}/2025-26/Week 1`]: [
          makeDirEntry({ name: 'Scores.xlsx', path: `${LEAGUE_PATH}/2025-26/Week 1/Scores.xlsx` })
        ]
      })
    )
  })
  const user = userEvent.setup()
  renderLeague()

  await user.click(screen.getByRole('button', { name: '2025-26' }))
  await user.click(await screen.findByRole('button', { name: 'Week 1' }))
  expect(await screen.findByRole('button', { name: 'Scores.xlsx' })).toBeInTheDocument()
  expect(document.querySelector('[aria-current="page"]')).toHaveTextContent('Week 1')

  // Kumo renders a CSS-hidden mobile copy of the trail; the first link is the desktop one.
  await user.click(screen.getAllByRole('link', { name: 'Mixed triples' })[0])

  expect(await screen.findByRole('button', { name: '2024-25' })).toBeInTheDocument()
})

it('opens the new-season dialog from the header', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderLeague()

  await user.click(screen.getByRole('button', { name: 'New season…' }))

  expect(await screen.findByRole('dialog', { name: /new season/i })).toBeInTheDocument()
})

it('imports picked files into the folder being viewed', async () => {
  const api = installMockApi({
    listDir: vi.fn(listingFor({ [`${LEAGUE_PATH}/2025-26`]: [] })),
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf'])
  })
  const user = userEvent.setup()
  const onChanged = renderLeague()

  await user.click(screen.getByRole('button', { name: 'Add files…' }))
  await waitFor(() => expect(api.importFiles).toHaveBeenCalledWith(LEAGUE_PATH, ['/tmp/a.pdf']))

  await user.click(screen.getByRole('button', { name: '2025-26' }))
  await screen.findByText('This folder is empty')
  await user.click(screen.getByRole('button', { name: 'Add files…' }))

  await waitFor(() =>
    expect(api.importFiles).toHaveBeenCalledWith(`${LEAGUE_PATH}/2025-26`, ['/tmp/a.pdf'])
  )
  expect(onChanged).toHaveBeenCalledTimes(2)
})

it('drops files into the folder being viewed, but never into the archive', async () => {
  const api = installMockApi({
    listDir: vi.fn(
      listingFor({
        ...ARCHIVE_LISTING,
        [`${LEAGUE_PATH}/2025-26`]: [
          makeDirEntry({ name: 'Rules.docx', path: `${LEAGUE_PATH}/2025-26/Rules.docx` })
        ]
      })
    ),
    pathForFile: vi.fn((file: File) => `/drop/${file.name}`)
  })
  const user = userEvent.setup()
  renderLeague()
  const files = [new File(['x'], 'x.pdf')]

  fireEvent.drop(dropZone(), { dataTransfer: { files } })
  await waitFor(() => expect(api.importFiles).toHaveBeenCalledWith(LEAGUE_PATH, ['/drop/x.pdf']))

  await user.click(screen.getByRole('button', { name: '2025-26' }))
  await screen.findByRole('button', { name: 'Rules.docx' })
  fireEvent.drop(dropZone(), { dataTransfer: { files } })
  await waitFor(() =>
    expect(api.importFiles).toHaveBeenCalledWith(`${LEAGUE_PATH}/2025-26`, ['/drop/x.pdf'])
  )

  await user.click(screen.getAllByRole('link', { name: 'Mixed triples' })[0])
  await user.click(await screen.findByRole('button', { name: 'Archive' }))
  await screen.findByRole('button', { name: '2023-24' })
  fireEvent.drop(dropZone(), { dataTransfer: { files } })

  expect(api.importFiles).toHaveBeenCalledTimes(2)
})

it('keeps the archive read-only at every depth', async () => {
  installMockApi({ listDir: vi.fn(listingFor(ARCHIVE_LISTING)) })
  const user = userEvent.setup()
  renderLeague()

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  await user.click(await screen.findByRole('button', { name: '2023-24' }))
  await screen.findByRole('button', { name: 'Rules.docx' })

  expect(screen.getByRole('button', { name: 'Add files…' })).toBeDisabled()
  const menu = await openRowMenu(user, 'Rules.docx')
  expect(within(menu).queryByRole('menuitem', { name: /zip/i })).not.toBeInTheDocument()
})

it('offers to zip archived seasons, once at a time, and reports the outcome', async () => {
  let finish!: (zips: string[]) => void
  const api = installMockApi({
    listDir: vi.fn(listingFor(ARCHIVE_LISTING)),
    zipArchive: vi.fn(() => new Promise<string[]>((resolve) => (finish = resolve)))
  })
  const user = userEvent.setup()
  const onChanged = renderLeague()

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  await screen.findByRole('button', { name: '2023-24' })
  expect(screen.getByRole('button', { name: 'Add files…' })).toBeDisabled()

  let menu = await openRowMenu(user, '2023-24')
  await user.click(within(menu).getByRole('menuitem', { name: 'Zip season' }))
  expect(api.zipArchive).toHaveBeenCalledWith('Mixed triples', ['2023-24'])
  expect(screen.getByRole('row', { name: /2023-24/ })).toHaveTextContent('Zipping…')

  // A second zip is refused while the first is still running.
  menu = await openRowMenu(user, '2022-23')
  expect(within(menu).getByRole('menuitem', { name: 'Zip season again' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await user.keyboard('{Escape}')
  finish([`${ARCHIVE_PATH}/2023-24.zip`])

  expect(await screen.findByText('Zipped 2023-24')).toBeInTheDocument()
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(api.zipArchive).toHaveBeenCalledTimes(1)

  menu = await openRowMenu(user, '2022-23.zip')
  expect(within(menu).queryByRole('menuitem', { name: /zip/i })).not.toBeInTheDocument()
})

it('shows an error toast when zipping fails', async () => {
  installMockApi({
    listDir: vi.fn(listingFor(ARCHIVE_LISTING)),
    zipArchive: vi
      .fn()
      .mockRejectedValue(
        new Error("Error invoking remote method 'archive:zip': Error: Archive is locked")
      )
  })
  const user = userEvent.setup()
  const onChanged = renderLeague()

  await user.click(screen.getByRole('button', { name: 'Archive' }))
  await screen.findByRole('button', { name: '2023-24' })
  const menu = await openRowMenu(user, '2023-24')
  await user.click(within(menu).getByRole('menuitem', { name: 'Zip season' }))

  expect(await screen.findByText('Archive is locked')).toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
})

it('deletes a season only after its name is typed', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  const onChanged = renderLeague()

  const menu = await openRowMenu(user, '2024-25')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete season…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete season “2024-25”' })
  const confirm = within(dialog).getByRole('button', { name: 'Delete season' })
  expect(confirm).toBeDisabled()

  await user.type(within(dialog).getByLabelText('Type 2024-25 to confirm'), '2024-25')
  await user.click(confirm)

  expect(api.trashFolder).toHaveBeenCalledWith(`${LEAGUE_PATH}/2024-25`)
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
  expect(await screen.findByText(/Moved “2024-25” to the/)).toBeInTheDocument()
})

it('deletes the league from the header menu, warning about archives', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  const onChanged = renderLeague()

  await user.click(screen.getByRole('button', { name: 'League actions' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Delete league…' }))
  const dialog = await screen.findByRole('dialog', { name: 'Delete league “Mixed triples”' })
  expect(dialog).toHaveTextContent('Its archived seasons in _archives move too.')

  await user.type(within(dialog).getByLabelText('Type Mixed triples to confirm'), 'Mixed triples')
  await user.click(within(dialog).getByRole('button', { name: 'Delete league' }))

  expect(api.trashFolder).toHaveBeenCalledWith(LEAGUE_PATH)
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('reveals the folder being viewed from the header menu', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderLeague()

  await user.click(screen.getByRole('button', { name: 'League actions' }))
  await user.click(await screen.findByRole('menuitem', { name: revealLabel() }))

  expect(api.revealFile).toHaveBeenCalledWith(LEAGUE_PATH)
})
