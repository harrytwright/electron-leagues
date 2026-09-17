import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { LocationSwitcher } from './index'
import { revealLabel } from '../../lib/os-labels'
import { makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const CURRENT = '/Users/me/LeagueDocs'
const USB = '/Volumes/USB/leagues'

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: 'Location: LeagueDocs' })
  // Clicking the trigger toggles, so an open menu would close instead.
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  return screen.findByRole('menu')
}

it('shows the current location by folder name and lists recents with the current one checked', async () => {
  installMockApi({ recentRoots: vi.fn().mockResolvedValue([CURRENT, USB]) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  expect(screen.getByTitle(CURRENT)).toContainElement(
    screen.getByRole('button', { name: 'Location: LeagueDocs' })
  )
  const menu = await openMenu(user)

  const current = await within(menu).findByRole('menuitemradio', { name: /^LeagueDocs/ })
  expect(current).toHaveAttribute('aria-checked', 'true')
  expect(current).toHaveTextContent(CURRENT)
  const usb = within(menu).getByRole('menuitemradio', { name: /^leagues/ })
  expect(usb).toHaveAttribute('aria-checked', 'false')
  expect(within(usb).getByText(USB)).toHaveClass('text-base')
})

it('lists the current location first, checked, even when it is not remembered yet', async () => {
  installMockApi({ recentRoots: vi.fn().mockResolvedValue(['/elsewhere/old']) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await within(menu).findByRole('menuitemradio', { name: /^old/ })

  const radios = within(menu).getAllByRole('menuitemradio')
  expect(radios).toHaveLength(2)
  expect(radios[0]).toHaveTextContent('LeagueDocs')
  expect(radios[0]).toHaveAttribute('aria-checked', 'true')
})

it('fetches recents each time the menu opens, not on mount', async () => {
  const api = installMockApi({ recentRoots: vi.fn().mockResolvedValue([CURRENT]) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)
  expect(api.recentRoots).not.toHaveBeenCalled()

  await openMenu(user)
  await user.keyboard('{Escape}')
  await openMenu(user)

  expect(api.recentRoots).toHaveBeenCalledTimes(2)
})

it('switches to a recent location and asks for a rescan', async () => {
  const api = installMockApi({
    recentRoots: vi.fn().mockResolvedValue([CURRENT, USB]),
    scan: vi.fn().mockResolvedValue(makeTree({ root: USB }))
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(api.setRoot).toHaveBeenCalledWith(USB)
  await waitFor(() => expect(window.api.scan).toHaveBeenCalledOnce())
  expect(await screen.findByText('Opened location')).toBeInTheDocument()
})

it('explains when a remembered location cannot be used and refreshes the list', async () => {
  const recentRoots = vi.fn().mockResolvedValueOnce([CURRENT, USB]).mockResolvedValue([CURRENT])
  const api = installMockApi({ recentRoots, setRoot: vi.fn().mockResolvedValue(null) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(await screen.findByText(`“leagues” is no longer available at ${USB}`)).toBeInTheDocument()
  expect(api.setRoot).toHaveBeenCalledWith(USB)
  expect(window.api.scan).not.toHaveBeenCalled()
  expect(recentRoots).toHaveBeenCalledTimes(2)
})

it('reports a missing location even when refreshing recents also fails', async () => {
  const recentRoots = vi
    .fn()
    .mockResolvedValueOnce([CURRENT, USB])
    .mockRejectedValue(new Error('Recents failed'))
  installMockApi({ recentRoots, setRoot: vi.fn().mockResolvedValue(null) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(await screen.findByText(`“leagues” is no longer available at ${USB}`)).toBeInTheDocument()
  await waitFor(() => expect(recentRoots).toHaveBeenCalledTimes(2))
  // Choosing a radio item leaves the menu open, so the refreshed error shows in place.
  expect(await within(menu).findByRole('menuitem', { name: 'Recents failed' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it('names a missing Windows location and includes its full path', async () => {
  const windowsPath = 'C:\\Users\\me\\Bowling leagues'
  installMockApi({
    recentRoots: vi.fn().mockResolvedValueOnce([CURRENT, windowsPath]).mockResolvedValue([CURRENT]),
    setRoot: vi.fn().mockResolvedValue(null)
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^Bowling leagues/ }))
  expect(
    await screen.findByText(`“Bowling leagues” is no longer available at ${windowsPath}`)
  ).toBeInTheDocument()
})

it('creates a new location through the native picker', async () => {
  const api = installMockApi({
    chooseRoot: vi.fn().mockResolvedValue('/new/place'),
    scan: vi.fn().mockResolvedValue(makeTree({ root: '/new/place' }))
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'New location…' }))

  expect(api.chooseRoot).toHaveBeenCalledWith('init')
  await waitFor(() => expect(window.api.scan).toHaveBeenCalledOnce())
})

it('opens an existing location through the native picker', async () => {
  const api = installMockApi({
    chooseRoot: vi.fn().mockResolvedValue('/opened/place'),
    scan: vi.fn().mockResolvedValue(makeTree({ root: '/opened/place' }))
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'Open location…' }))

  expect(api.chooseRoot).toHaveBeenCalledWith('select')
  await waitFor(() => expect(window.api.scan).toHaveBeenCalledOnce())
})

it('reports picker failures without rescanning', async () => {
  installMockApi({ chooseRoot: vi.fn().mockRejectedValue(new Error('Picker failed')) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'Open location…' }))

  expect(await screen.findByText('Picker failed')).toBeInTheDocument()
  expect(window.api.scan).not.toHaveBeenCalled()
})

it('ignores duplicate picker activation while the first operation is pending', async () => {
  let resolvePicker: (path: string | null) => void = () => undefined
  const chooseRoot = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        resolvePicker = resolve
      })
  )
  const api = installMockApi({ chooseRoot })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  const open = within(menu).getByRole('menuitem', { name: 'Open location…' })
  fireEvent.click(open)
  fireEvent.click(open)

  await waitFor(() => expect(api.chooseRoot).toHaveBeenCalledOnce())
  resolvePicker('/opened/place')
  await waitFor(() => expect(window.api.scan).toHaveBeenCalledOnce())
})

it('does nothing when the picker is cancelled', async () => {
  installMockApi({ chooseRoot: vi.fn().mockResolvedValue(null) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'New location…' }))

  await waitFor(() => expect(window.api.chooseRoot).toHaveBeenCalled())
  expect(window.api.scan).not.toHaveBeenCalled()
  expect(screen.queryByText('Created location')).not.toBeInTheDocument()
})

it('reveals the current location', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: revealLabel() }))

  expect(api.revealFile).toHaveBeenCalledWith(CURRENT)
})

it('repairs the current location from the item after reveal', async () => {
  const api = installMockApi({
    repairLocation: vi
      .fn()
      .mockResolvedValueOnce({ repaired: ['_shared', '_templates/Rules.docx'], warnings: [] })
      .mockResolvedValueOnce({ repaired: [], warnings: [] })
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)

  const menu = await openMenu(user)
  const items = within(menu).getAllByRole('menuitem')
  expect(items.at(-2)).toHaveTextContent(revealLabel())
  expect(items.at(-1)).toHaveTextContent('Repair location…')
  await user.click(within(menu).getByRole('menuitem', { name: 'Repair location…' }))

  expect(api.repairLocation).toHaveBeenCalledOnce()
  expect(await screen.findByText('Repaired _shared, _templates/Rules.docx')).toBeInTheDocument()

  const reopened = await openMenu(user)
  await user.click(within(reopened).getByRole('menuitem', { name: 'Repair location…' }))

  expect(await screen.findByText('Nothing to repair')).toBeInTheDocument()
})

it('shows recents failures inline while keeping current location and pickers available', async () => {
  installMockApi({ recentRoots: vi.fn().mockRejectedValue(new Error('Recents unavailable')) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)
  const menu = await openMenu(user)
  expect(
    await within(menu).findByRole('menuitem', { name: 'Recents unavailable' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(within(menu).getByRole('menuitemradio', { name: /^LeagueDocs/ })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  expect(within(menu).getByRole('menuitem', { name: 'Open location…' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  )
  expect(within(menu).getByRole('menuitem', { name: 'New location…' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

it('recovers the recents list when the menu is reopened after a failure', async () => {
  const api = installMockApi({
    recentRoots: vi
      .fn()
      .mockRejectedValueOnce(new Error('Recents unavailable'))
      .mockResolvedValue([CURRENT, USB])
  })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} />)
  const menu = await openMenu(user)
  await within(menu).findByRole('menuitem', { name: 'Recents unavailable' })
  await user.keyboard('{Escape}')
  const reopened = await openMenu(user)
  expect(
    await within(reopened).findByRole('menuitemradio', { name: /^leagues/ })
  ).toBeInTheDocument()
  expect(within(reopened).queryByText('Recents unavailable')).not.toBeInTheDocument()
  expect(api.recentRoots).toHaveBeenCalledTimes(2)
})
