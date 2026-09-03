import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar as KumoSidebar } from '@cloudflare/kumo'
import { expect, it, vi, type Mock } from 'vitest'
import type { LeaguesTree } from '@shared/tree'
import { Sidebar } from './Sidebar'
import { HOME, type Selection } from '../../lib/selection'
import { makeLeague, makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

interface RenderSidebarOptions {
  tree?: LeaguesTree
  selection?: Selection
}

interface SidebarHarness {
  onSelect: Mock<(next: Selection) => void>
  unmount: () => void
}

function twoDayTree(root = '/root'): LeaguesTree {
  return makeTree({
    root,
    days: {
      ...makeTree().days,
      monday: [makeLeague({ folderName: 'Monday pairs', day: 'monday' })],
      friday: [makeLeague({ folderName: 'Friday triples', day: 'friday' })]
    }
  })
}

function allDayTree(): LeaguesTree {
  return makeTree({
    days: {
      monday: [makeLeague({ folderName: 'Monday league', day: 'monday' })],
      tuesday: [makeLeague({ folderName: 'Tuesday league', day: 'tuesday' })],
      wednesday: [makeLeague({ folderName: 'Wednesday league', day: 'wednesday' })],
      thursday: [makeLeague({ folderName: 'Thursday league', day: 'thursday' })],
      friday: [makeLeague({ folderName: 'Friday league', day: 'friday' })],
      saturday: [makeLeague({ folderName: 'Saturday league', day: 'saturday' })],
      sunday: [makeLeague({ folderName: 'Sunday league', day: 'sunday' })]
    }
  })
}

function renderSidebar(options: RenderSidebarOptions = {}): SidebarHarness {
  const tree = options.tree ?? makeTree()
  const selection = options.selection ?? HOME
  const onSelect = vi.fn<(next: Selection) => void>()

  const view = renderWithProviders(
    <KumoSidebar.Provider contained defaultOpen collapsible="icon" className="flex-col">
      <div>
        <KumoSidebar.Trigger />
      </div>
      <div className="flex min-h-0 flex-1">
        <Sidebar tree={tree} selection={selection} onSelect={onSelect} />
      </div>
    </KumoSidebar.Provider>
  )

  return { onSelect, unmount: view.unmount }
}

function dayTrigger(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

/** The collapsible region a day trigger controls. */
function dayRegion(name: string): HTMLElement {
  const id = dayTrigger(name).getAttribute('aria-controls')
  const region = id ? document.getElementById(id) : null
  if (!region) throw new Error(`No collapsible region for ${name}`)
  return region
}

it('groups leagues under collapsible sentence-cased days, skipping empty days', () => {
  installMockApi()
  renderSidebar({ tree: twoDayTree() })

  expect(screen.getByText('Leagues')).toBeInTheDocument()
  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'true')
  expect(screen.queryByRole('button', { name: 'Tuesday' })).not.toBeInTheDocument()
  expect(within(dayRegion('Monday')).getByRole('button', { name: 'Monday pairs' })).toBeVisible()
  expect(
    within(dayRegion('Monday')).queryByRole('button', { name: 'Friday triples' })
  ).not.toBeInTheDocument()
  expect(within(dayRegion('Friday')).getByRole('button', { name: 'Friday triples' })).toBeVisible()
})

it('hints where to start when there are no leagues at all', () => {
  installMockApi()
  renderSidebar()

  expect(screen.getByText(/No leagues yet/)).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('uses compact weekday badges while keeping full accessible names', () => {
  installMockApi()
  renderSidebar({ tree: allDayTree() })

  const expectedBadges = [
    ['Monday', 'Mon'],
    ['Tuesday', 'Tue'],
    ['Wednesday', 'Wed'],
    ['Thursday', 'Thu'],
    ['Friday', 'Fri'],
    ['Saturday', 'Sat'],
    ['Sunday', 'Sun']
  ] as const

  for (const [name, abbreviation] of expectedBadges) {
    const trigger = dayTrigger(name)
    expect(trigger).toHaveAccessibleName(name)
    const badge = within(trigger).getByText(abbreviation)
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge).toHaveClass('w-4')
  }
})

it('marks the selected league and fires onSelect with the right selection', async () => {
  installMockApi()
  const { onSelect } = renderSidebar({
    tree: twoDayTree(),
    selection: { kind: 'league', day: 'friday', folderName: 'Friday triples' }
  })
  const user = userEvent.setup()
  const selected = screen.getByRole('button', { name: 'Friday triples' })
  const unselected = screen.getByRole('button', { name: 'Monday pairs' })

  expect(selected).toHaveAttribute('aria-current', 'true')
  expect(unselected).not.toHaveAttribute('aria-current')
  await user.click(unselected)

  expect(onSelect).toHaveBeenCalledWith({
    kind: 'league',
    day: 'monday',
    folderName: 'Monday pairs'
  })
})

it('shows “Not running” on stopped leagues', () => {
  installMockApi()
  renderSidebar({
    tree: makeTree({
      days: {
        ...makeTree().days,
        wednesday: [makeLeague({ folderName: 'Winter fours', day: 'wednesday', running: false })]
      }
    })
  })

  const stopped = screen.getByRole('button', { name: 'Winter fours, not running' })
  expect(stopped).toHaveTextContent('Not running')
})

it('collapses a day on click and remembers it for this location only', async () => {
  installMockApi()
  const user = userEvent.setup()
  const first = renderSidebar({ tree: twoDayTree() })

  await user.click(dayTrigger('Monday'))

  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'false')
  expect(dayRegion('Monday')).toHaveAttribute('aria-hidden', 'true')
  expect(dayTrigger('Friday')).toHaveAttribute('aria-expanded', 'true')
  expect(localStorage.getItem('leagues:/root:collapsed-days')).toBe(JSON.stringify(['monday']))

  first.unmount()
  const second = renderSidebar({ tree: twoDayTree() })
  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'false')
  expect(dayTrigger('Friday')).toHaveAttribute('aria-expanded', 'true')

  second.unmount()
  renderSidebar({ tree: twoDayTree('/other') })
  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'true')
})

it('expands a collapsed day for keyboard focus without changing the memory', async () => {
  localStorage.setItem('leagues:/root:collapsed-days', JSON.stringify(['monday']))
  installMockApi()
  const user = userEvent.setup()
  renderSidebar({ tree: twoDayTree() })
  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'false')
  expect(dayRegion('Monday')).toHaveAttribute('inert')

  dayTrigger('Monday').focus()
  await user.keyboard('{Tab}')

  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'true')
  expect(dayRegion('Monday')).not.toHaveAttribute('inert')
  expect(screen.getByRole('button', { name: 'Monday pairs' })).toHaveFocus()
  expect(localStorage.getItem('leagues:/root:collapsed-days')).toBe(JSON.stringify(['monday']))

  await user.tab()

  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'false')
  expect(dayRegion('Monday')).toHaveAttribute('inert')
  expect(localStorage.getItem('leagues:/root:collapsed-days')).toBe(JSON.stringify(['monday']))
})

it('expands the sidebar instead of toggling a day from the icon rail', async () => {
  localStorage.setItem('leagues:/root:collapsed-days', JSON.stringify(['monday']))
  installMockApi()
  const user = userEvent.setup()
  renderSidebar({ tree: twoDayTree() })

  await user.click(screen.getByRole('button', { name: /collapse sidebar/i }))
  expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
  await user.click(dayTrigger('Monday'))

  expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
  expect(dayTrigger('Monday')).toHaveAttribute('aria-expanded', 'false')
  expect(localStorage.getItem('leagues:/root:collapsed-days')).toBe(JSON.stringify(['monday']))
})
