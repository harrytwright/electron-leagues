import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { LocationSwitcher } from './index'
import { revealLabel } from '../../lib/reveal-label'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const CURRENT = '/Users/me/LeagueDocs'
const USB = '/Volumes/USB/leagues'

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Location: LeagueDocs' }))
  return screen.findByRole('menu')
}

it('shows the current location by folder name and lists recents with the current one checked', async () => {
  installMockApi({ recentRoots: vi.fn().mockResolvedValue([CURRENT, USB]) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)

  expect(screen.getByTitle(CURRENT)).toContainElement(
    screen.getByRole('button', { name: 'Location: LeagueDocs' })
  )
  const menu = await openMenu(user)

  const current = await within(menu).findByRole('menuitemradio', { name: /^LeagueDocs/ })
  expect(current).toHaveAttribute('aria-checked', 'true')
  expect(current).toHaveTextContent(CURRENT)
  expect(within(menu).getByRole('menuitemradio', { name: /^leagues/ })).toHaveAttribute(
    'aria-checked',
    'false'
  )
})

it('lists the current location first, checked, even when it is not remembered yet', async () => {
  installMockApi({ recentRoots: vi.fn().mockResolvedValue(['/elsewhere/old']) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)

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
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)
  expect(api.recentRoots).not.toHaveBeenCalled()

  await openMenu(user)
  await user.keyboard('{Escape}')
  await openMenu(user)

  expect(api.recentRoots).toHaveBeenCalledTimes(2)
})

it('switches to a recent location and asks for a rescan', async () => {
  const api = installMockApi({ recentRoots: vi.fn().mockResolvedValue([CURRENT, USB]) })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(api.setRoot).toHaveBeenCalledWith(USB)
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('explains when a remembered location cannot be used and refreshes the list', async () => {
  const recentRoots = vi.fn().mockResolvedValueOnce([CURRENT, USB]).mockResolvedValue([CURRENT])
  const api = installMockApi({ recentRoots, setRoot: vi.fn().mockResolvedValue(null) })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(await screen.findByText('That folder is no longer available')).toBeInTheDocument()
  expect(api.setRoot).toHaveBeenCalledWith(USB)
  expect(onChanged).not.toHaveBeenCalled()
  expect(recentRoots).toHaveBeenCalledTimes(2)
})

it('reports a missing location even when refreshing recents also fails', async () => {
  const recentRoots = vi
    .fn()
    .mockResolvedValueOnce([CURRENT, USB])
    .mockRejectedValueOnce(new Error('Recents failed'))
  installMockApi({ recentRoots, setRoot: vi.fn().mockResolvedValue(null) })
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)

  const menu = await openMenu(user)
  await user.click(await within(menu).findByRole('menuitemradio', { name: /^leagues/ }))

  expect(await screen.findByText('That folder is no longer available')).toBeInTheDocument()
  await waitFor(() => expect(recentRoots).toHaveBeenCalledTimes(2))
  expect(screen.queryByText('Recents failed')).not.toBeInTheDocument()
})

it('creates a new location through the native picker', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue('/new/place') })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'New location…' }))

  expect(api.chooseRoot).toHaveBeenCalledWith('init')
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('opens an existing location through the native picker', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue('/opened/place') })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'Open location…' }))

  expect(api.chooseRoot).toHaveBeenCalledWith('select')
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('reports picker failures without rescanning', async () => {
  installMockApi({ chooseRoot: vi.fn().mockRejectedValue(new Error('Picker failed')) })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'Open location…' }))

  expect(await screen.findByText('Picker failed')).toBeInTheDocument()
  expect(onChanged).not.toHaveBeenCalled()
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
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  const open = within(menu).getByRole('menuitem', { name: 'Open location…' })
  fireEvent.click(open)
  fireEvent.click(open)

  expect(api.chooseRoot).toHaveBeenCalledOnce()
  resolvePicker('/opened/place')
  await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
})

it('does nothing when the picker is cancelled', async () => {
  installMockApi({ chooseRoot: vi.fn().mockResolvedValue(null) })
  const onChanged = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={onChanged} />)

  const menu = await openMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'New location…' }))

  await waitFor(() => expect(window.api.chooseRoot).toHaveBeenCalled())
  expect(onChanged).not.toHaveBeenCalled()
})

it('reveals the current location', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)

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
  renderWithProviders(<LocationSwitcher root={CURRENT} onChanged={vi.fn()} />)

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
