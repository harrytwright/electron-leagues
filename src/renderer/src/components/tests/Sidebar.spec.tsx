import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar as KumoSidebar } from '@cloudflare/kumo'
import { expect, it, vi, type Mock } from 'vitest'
import Sidebar from '../Sidebar'
import { HOME, type Selection } from '../../lib/selection'
import { makeLeague, makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

interface RenderSidebarOptions {
  tree?: ReturnType<typeof makeTree>
  selection?: Selection
}

interface SidebarHarness {
  onChanged: Mock<() => void>
  onSelect: Mock<(next: Selection) => void>
}

function renderSidebar(options: RenderSidebarOptions = {}): SidebarHarness {
  const tree = options.tree ?? makeTree()
  const selection = options.selection ?? HOME
  const onChanged = vi.fn<() => void>()
  const onSelect = vi.fn<(next: Selection) => void>()

  renderWithProviders(
    <KumoSidebar.Provider contained defaultOpen>
      <Sidebar tree={tree} selection={selection} onSelect={onSelect} onChanged={onChanged} />
    </KumoSidebar.Provider>
  )

  return { onChanged, onSelect }
}

it('lists leagues grouped under sentence-cased day headings, skipping empty days', () => {
  installMockApi()
  const mondayLeague = makeLeague({ folderName: 'Monday pairs', day: 'monday' })
  const fridayLeague = makeLeague({ folderName: 'Friday triples', day: 'friday' })
  renderSidebar({
    tree: makeTree({
      days: {
        monday: [mondayLeague],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [fridayLeague],
        saturday: [],
        sunday: []
      }
    })
  })

  const mondayGroup = screen.getByText('Monday').closest<HTMLElement>('[data-sidebar="group"]')
  const fridayGroup = screen.getByText('Friday').closest<HTMLElement>('[data-sidebar="group"]')

  expect(mondayGroup).not.toBeNull()
  expect(fridayGroup).not.toBeNull()
  if (!mondayGroup || !fridayGroup) throw new Error('Expected rendered weekday groups')
  expect(within(mondayGroup).getByRole('button', { name: 'Monday pairs' })).toBeInTheDocument()
  expect(within(fridayGroup).getByRole('button', { name: 'Friday triples' })).toBeInTheDocument()
  expect(screen.queryByText('Tuesday')).not.toBeInTheDocument()
})

it('marks the selected league and fires onSelect with the right selection', async () => {
  installMockApi()
  const mondayLeague = makeLeague({ folderName: 'Monday pairs', day: 'monday' })
  const fridayLeague = makeLeague({ folderName: 'Friday triples', day: 'friday' })
  const tree = makeTree({
    days: {
      monday: [mondayLeague],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [fridayLeague],
      saturday: [],
      sunday: []
    }
  })
  const { onSelect } = renderSidebar({
    tree,
    selection: { kind: 'league', day: 'friday', folderName: 'Friday triples' }
  })
  const user = userEvent.setup()
  const selected = screen.getByRole('button', { name: 'Friday triples' })
  const unselected = screen.getByRole('button', { name: 'Monday pairs' })

  expect(selected).toHaveAttribute('aria-current', 'true')
  expect(unselected).not.toHaveAttribute('aria-current')
  expect(screen.getByRole('button', { name: 'Shared documents' })).not.toHaveAttribute(
    'aria-current'
  )
  await user.click(unselected)

  expect(onSelect).toHaveBeenCalledWith({
    kind: 'league',
    day: 'monday',
    folderName: 'Monday pairs'
  })
})

it('selects shared documents', async () => {
  installMockApi()
  const { onSelect } = renderSidebar({
    selection: { kind: 'league', day: 'monday', folderName: 'Monday pairs' }
  })
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Shared documents' }))

  expect(onSelect).toHaveBeenCalledWith({ kind: 'home' })
})

it('shows “Not running” on stopped leagues', () => {
  installMockApi()
  const stoppedLeague = makeLeague({
    folderName: 'Winter fours',
    day: 'wednesday',
    running: false
  })
  renderSidebar({
    tree: makeTree({
      days: {
        monday: [],
        tuesday: [],
        wednesday: [stoppedLeague],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: []
      }
    })
  })

  const stopped = screen.getByRole('button', { name: 'Winter fours, not running' })
  expect(stopped).toHaveTextContent('Not running')
})

it('opens the new-league dialog and forwards creation', async () => {
  const api = installMockApi({
    createLeague: vi.fn().mockResolvedValue('/root/monday/Summer pairs')
  })
  const { onChanged, onSelect } = renderSidebar()
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'New league' }))
  expect(screen.getByRole('dialog', { name: 'New league' })).toBeInTheDocument()

  await user.type(screen.getByLabelText('League name'), 'Summer pairs')
  await user.click(screen.getByRole('button', { name: 'Create league' }))

  expect(api.createLeague).toHaveBeenCalledWith('monday', 'Summer pairs')
  await waitFor(() => {
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'league',
      day: 'monday',
      folderName: 'Summer pairs'
    })
  })
  // Selection must wait for the rescan so the new league exists in the tree.
  expect(onChanged.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0])
})

it('collapses to the icon rail from the footer trigger', async () => {
  installMockApi()
  renderSidebar()
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: /collapse sidebar/i })

  await user.click(trigger)

  expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
})

it('reveals the leagues root from the footer', async () => {
  const api = installMockApi()
  const tree = makeTree({ root: '/leagues-root' })
  renderSidebar({ tree })
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Show leagues folder' }))

  expect(api.revealFile).toHaveBeenCalledWith('/leagues-root')
})
