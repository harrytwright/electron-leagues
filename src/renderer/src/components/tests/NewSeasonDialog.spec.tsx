import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi, type Mock } from 'vitest'
import type { SeasonNode } from '@shared/tree'
import NewSeasonDialog, { type NewSeasonDialogProps } from '../NewSeasonDialog'
import { makeLeague } from '../../tests/fixtures'
import { installMockApi, type RendererApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function makeSeason(name: string, status: SeasonNode['status'] = 'active'): SeasonNode {
  return { name, status, path: `/root/monday/Mixed triples/${name}`, files: [] }
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

function getArchiveCheckbox(name: RegExp): HTMLElement {
  return screen.getByLabelText(name, { selector: '[role="checkbox"]' })
}

interface DialogHarness {
  league: NewSeasonDialogProps['league']
  onCreated: Mock<NewSeasonDialogProps['onCreated']>
  onOpenChange: Mock<NewSeasonDialogProps['onOpenChange']>
  view: ReturnType<typeof renderWithProviders>
}

function renderDialog(props: Partial<NewSeasonDialogProps> = {}): DialogHarness {
  const onCreated = vi.fn<NewSeasonDialogProps['onCreated']>()
  const onOpenChange = vi.fn<NewSeasonDialogProps['onOpenChange']>()
  const league = props.league ?? makeLeague()
  const view = renderWithProviders(
    <NewSeasonDialog
      league={league}
      open
      onOpenChange={onOpenChange}
      onCreated={onCreated}
      {...props}
    />
  )
  return { league, onCreated, onOpenChange, view }
}

it('is a real dialog with labelled fields and a form that submits on Enter', async () => {
  const api = installMockApi()
  const { league, onCreated } = renderDialog()
  const user = userEvent.setup()

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByLabelText(/season type/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/starting documents/i)).toBeInTheDocument()
  const nameInput = screen.getByLabelText(/season name/i)
  await user.clear(nameInput)
  await user.type(nameInput, '2026-27{Enter}')

  expect(api.createSeason).toHaveBeenCalledWith({
    day: league.day,
    leagueFolder: league.folderName,
    seasonName: '2026-27',
    source: 'previous',
    // The default fixture has a single season, so no archive option is
    // offered and none must be requested.
    archiveOldest: false
  })
  await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
})

it('recomputes the suggestion from the latest season whenever it opens', () => {
  installMockApi()
  const firstLeague = makeLeague({ seasons: [makeSeason('2024-25')] })
  const nextLeague = makeLeague({ seasons: [makeSeason('2027-28')] })
  const { view } = renderDialog({ league: firstLeague })

  expect(screen.getByLabelText(/season name/i)).toHaveValue('2025-26')

  view.rerender(
    <NewSeasonDialog league={nextLeague} open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
  )
  view.rerender(
    <NewSeasonDialog league={nextLeague} open onOpenChange={vi.fn()} onCreated={vi.fn()} />
  )

  expect(screen.getByLabelText(/season name/i)).toHaveValue('2028-29')
})

it('re-suggests the name when the season type changes', async () => {
  installMockApi()
  renderDialog({ league: makeLeague({ seasons: [makeSeason('2025-26')] }) })
  const user = userEvent.setup()

  await chooseOption(user, /season type/i, /full year/i)

  expect(screen.getByLabelText(/season name/i)).toHaveValue(String(new Date().getFullYear()))
})

it('shows an invalid-name alert naming the selected type and focuses the name', async () => {
  const api = installMockApi()
  renderDialog()
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/season name/i)

  await chooseOption(user, /season type/i, /quarter/i)
  await user.clear(nameInput)
  await user.type(nameInput, '2026-Q9{Enter}')

  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('Not a valid quarter season name')
  expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  expect(nameInput).toHaveAttribute('aria-describedby', alert.id)
  expect(nameInput).toHaveFocus()
  expect(api.createSeason).not.toHaveBeenCalled()
})

it('surfaces createSeason failure inline, focuses the name, and keeps the dialog open', async () => {
  installMockApi({ createSeason: vi.fn().mockRejectedValue(new Error('template missing')) })
  const { onOpenChange } = renderDialog()
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/season name/i)

  await user.type(nameInput, '{Enter}')

  expect(await screen.findByRole('alert')).toHaveTextContent('template missing')
  expect(nameInput).toHaveFocus()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

it('disables copy from previous season when the league is not running', async () => {
  installMockApi()
  renderDialog({ league: makeLeague({ running: false }) })
  const user = userEvent.setup()

  await user.click(screen.getByLabelText(/starting documents/i))

  expect(screen.getByLabelText(/starting documents/i)).toHaveTextContent('Copy from templates')
  expect(screen.getByRole('option', { name: 'Copy from previous season' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it('only shows the archive checkbox for two or more seasons and pre-checks it', () => {
  installMockApi()
  const oneSeason = makeLeague({ seasons: [makeSeason('2025-26')] })
  const twoSeasons = makeLeague({
    seasons: [makeSeason('2024-25', 'previous'), makeSeason('2025-26')]
  })
  const { view } = renderDialog({ league: oneSeason })

  expect(screen.queryByLabelText(/archive “2025-26”/i)).not.toBeInTheDocument()

  view.rerender(
    <NewSeasonDialog league={twoSeasons} open onOpenChange={vi.fn()} onCreated={vi.fn()} />
  )

  expect(getArchiveCheckbox(/archive “2024-25”/i)).toBeChecked()
})

it('submits exactly the selected SeasonCreateRequest payload', async () => {
  const api = installMockApi()
  const league = makeLeague({
    day: 'thursday',
    folderName: 'Thursday fours',
    seasons: [makeSeason('2024-Q4', 'previous'), makeSeason('2025-Q1')]
  })
  renderDialog({ league })
  const user = userEvent.setup()

  await chooseOption(user, /starting documents/i, 'Start empty')
  await chooseOption(user, /season type/i, /quarter/i)
  const nameInput = screen.getByLabelText(/season name/i)
  await user.clear(nameInput)
  await user.type(nameInput, '2026-q2')
  await user.click(getArchiveCheckbox(/archive “2024-Q4”/i))
  await user.click(screen.getByRole('button', { name: 'Create season' }))

  expect(api.createSeason).toHaveBeenCalledOnce()
  expect(api.createSeason).toHaveBeenCalledWith({
    day: 'thursday',
    leagueFolder: 'Thursday fours',
    seasonName: '2026-Q2',
    source: 'empty',
    archiveOldest: false
  })
})

it('never asks main to archive when the option was not offered', async () => {
  const api = installMockApi()
  renderDialog({ league: makeLeague({ seasons: [makeSeason('2025-26')] }) })
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Create season' }))

  await waitFor(() => expect(api.createSeason).toHaveBeenCalledOnce())
  expect(api.createSeason).toHaveBeenCalledWith(expect.objectContaining({ archiveOldest: false }))
})

it('keeps typed input when the league refreshes while the dialog is open', async () => {
  installMockApi()
  const { view } = renderDialog({ league: makeLeague({ seasons: [makeSeason('2025-26')] }) })
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/season name/i)

  await user.clear(nameInput)
  await user.type(nameInput, '2030-31')

  // A watcher-driven rescan hands the dialog a fresh league object mid-edit.
  view.rerender(
    <NewSeasonDialog
      league={makeLeague({ seasons: [makeSeason('2025-26'), makeSeason('2026-27')] })}
      open
      onOpenChange={vi.fn()}
      onCreated={vi.fn()}
    />
  )

  expect(screen.getByLabelText(/season name/i)).toHaveValue('2030-31')
})

it('refuses to dismiss while a create is pending', async () => {
  let resolve!: (value: { seasonPath: string; archived: string | null }) => void
  installMockApi({
    createSeason: vi.fn(
      () =>
        new Promise<{ seasonPath: string; archived: string | null }>(
          (promiseResolve) => (resolve = promiseResolve)
        )
    )
  })
  const { onOpenChange } = renderDialog()
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Create season' }))
  await user.keyboard('{Escape}')

  expect(onOpenChange).not.toHaveBeenCalledWith(false)
  expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  await act(async () => resolve({ seasonPath: '/root/monday/league/2026-27', archived: null }))
})

it('resets every field and clears errors each time it opens', async () => {
  installMockApi({ createSeason: vi.fn().mockRejectedValue(new Error('stale error')) })
  const league = makeLeague({
    seasons: [makeSeason('2024-25', 'previous'), makeSeason('2025-26')]
  })
  const { view } = renderDialog({ league })
  const user = userEvent.setup()

  await chooseOption(user, /season type/i, /full year/i)
  await chooseOption(user, /starting documents/i, 'Start empty')
  await user.click(getArchiveCheckbox(/archive “2024-25”/i))
  await user.type(screen.getByLabelText(/season name/i), '{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('stale error')

  view.rerender(
    <NewSeasonDialog league={league} open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />
  )
  view.rerender(<NewSeasonDialog league={league} open onOpenChange={vi.fn()} onCreated={vi.fn()} />)

  expect(screen.getByLabelText(/season type/i)).toHaveTextContent('Cross-year')
  expect(screen.getByLabelText(/season name/i)).toHaveValue('2026-27')
  expect(screen.getByLabelText(/starting documents/i)).toHaveTextContent(
    'Copy from previous season'
  )
  expect(getArchiveCheckbox(/archive “2024-25”/i)).toBeChecked()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('provides the required season input attributes', () => {
  installMockApi()
  renderDialog()

  expect(screen.getByLabelText(/season name/i)).toHaveAttribute('name', 'season-name')
  expect(screen.getByLabelText(/season name/i)).toHaveAttribute('autocomplete', 'off')
})

it('disables submit while the name is empty and while creation is pending', async () => {
  let resolve!: (value: { seasonPath: string; archived: string | null }) => void
  const createSeason = vi.fn<RendererApi['createSeason']>(
    () =>
      new Promise((promiseResolve) => {
        resolve = promiseResolve
      })
  )
  installMockApi({ createSeason })
  renderDialog()
  const user = userEvent.setup()
  const nameInput = screen.getByLabelText(/season name/i)

  await user.clear(nameInput)
  expect(screen.getByRole('button', { name: /create season/i })).toBeDisabled()
  await user.type(nameInput, '2026-27{Enter}')
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

  await act(async () => resolve({ seasonPath: '/root/2026-27', archived: null }))
})
