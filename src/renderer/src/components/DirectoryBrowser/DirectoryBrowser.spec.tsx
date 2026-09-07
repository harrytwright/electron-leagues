import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DirectoryBrowser } from './index'
import type { BrowserRow, Props } from './interface'
import { revealLabel } from '../../lib/reveal-label'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function row(name: string, kind: BrowserRow['kind'] = 'file', mtime?: number): BrowserRow {
  return { key: name, name, kind, path: `/documents/${name}`, mtime }
}

function renderBrowser(rows: BrowserRow[], props: Partial<Props> = {}): void {
  renderWithProviders(
    <DirectoryBrowser
      name="Documents"
      heading="Files"
      rows={rows}
      metadataColumn="modified"
      readOnly={false}
      onRefresh={vi.fn()}
      onNavigate={vi.fn()}
      emptyTitle="No documents yet"
      {...props}
    />
  )
}

it('selects rows without opening, then opens files with Enter and folders with double-click', async () => {
  const api = installMockApi()
  const onNavigate = vi.fn()
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx'), row('sub', 'folder')], { onNavigate })
  await user.click(screen.getByRole('row', { name: 'a.xlsx' }))
  expect(api.openFile).not.toHaveBeenCalled()
  await user.keyboard('{Enter}')
  expect(api.openFile).toHaveBeenCalledWith('/documents/a.xlsx')
  await user.dblClick(screen.getByRole('row', { name: 'sub' }))
  expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ path: '/documents/sub' }))
})

it('moves row focus with arrows and Home/End, leaving menu key events alone', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx'), row('b.xlsx'), row('c.xlsx')])
  await user.click(screen.getByRole('row', { name: 'a.xlsx' }))
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('row', { name: 'b.xlsx' })).toHaveFocus()
  await user.keyboard('{End}')
  expect(screen.getByRole('row', { name: 'c.xlsx' })).toHaveFocus()
  await user.keyboard('{Home}')
  expect(screen.getByRole('row', { name: 'a.xlsx' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Actions for a.xlsx' }))
  expect(api.openFile).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(api.openFile).not.toHaveBeenCalled()
})

it('shows modified dates and a dash for synthetic rows', () => {
  installMockApi()
  renderBrowser([row('dated.pdf', 'file', Date.UTC(2026, 0, 15, 12)), row('Archive', 'folder')])
  expect(screen.getByText('15 Jan 2026')).toBeInTheDocument()
  expect(screen.getByText('—')).toBeInTheDocument()
})

it('composes Open and reveal with custom row actions without opening twice', async () => {
  const api = installMockApi()
  const onZip = vi.fn()
  const user = userEvent.setup()
  renderBrowser([
    row('a.xlsx'),
    { ...row('Archive', 'folder'), menuItems: [{ label: 'Zip…', onSelect: onZip }] }
  ])
  await user.click(screen.getByRole('button', { name: 'Actions for a.xlsx' }))
  await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open' }))
  expect(api.openFile).toHaveBeenCalledExactlyOnceWith('/documents/a.xlsx')
  await user.click(screen.getByRole('button', { name: 'Actions for Archive' }))
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByRole('menuitem', { name: revealLabel() })).toBeInTheDocument()
  await user.click(within(menu).getByRole('menuitem', { name: 'Zip…' }))
  expect(onZip).toHaveBeenCalledOnce()
})

it('shares row actions across pointer and keyboard menus, selecting and restoring focus', async () => {
  installMockApi()
  const unavailable = vi.fn()
  const user = userEvent.setup()
  renderBrowser([
    row('a.xlsx'),
    {
      ...row('Archive', 'folder'),
      menuItems: [{ label: 'Restricted action', disabled: true, onSelect: unavailable }]
    }
  ])

  const archive = screen.getByRole('row', { name: 'Archive' })
  fireEvent.contextMenu(archive, { clientX: 20, clientY: 30 })
  expect(archive).toHaveAttribute('aria-selected', 'true')
  expect(
    within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Open' })
  ).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Restricted action' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await user.keyboard('{Escape}')
  expect(archive).toHaveFocus()

  await user.keyboard('{Shift>}{F10}{/Shift}')
  expect(await screen.findByRole('menu')).toBeVisible()
  await user.keyboard('{Escape}')
  const trigger = screen.getByRole('button', { name: 'Actions for a.xlsx' })
  await user.click(trigger)
  expect(screen.getAllByRole('menu')).toHaveLength(1)
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  expect(unavailable).not.toHaveBeenCalled()
})

it('reports native open and reveal failures as toasts', async () => {
  installMockApi({
    openFile: vi.fn().mockResolvedValue('No associated application'),
    revealFile: vi.fn().mockRejectedValue(new Error('Reveal failed'))
  })
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx')])
  await user.dblClick(screen.getByRole('row', { name: 'a.xlsx' }))
  expect(await screen.findByText('No associated application')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Actions for a.xlsx' }))
  await user.click(
    within(await screen.findByRole('menu')).getByRole('menuitem', { name: revealLabel() })
  )
  expect(await screen.findByText('Reveal failed')).toBeInTheDocument()
})

it('exposes the visible actions button as a keyboard-operable menu trigger', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx')])
  const trigger = screen.getByRole('button', { name: 'Actions for a.xlsx' })
  expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  trigger.focus()
  await user.keyboard('{ArrowDown}')
  const menu = await screen.findByRole('menu')
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const controlled = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
  expect(controlled).toContainElement(menu)
  await user.keyboard('{Escape}')
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveFocus()
})

it('redirects delayed popup focus return away from its invisible positioning trigger', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx')])
  const trigger = screen.getByRole('button', { name: 'Actions for a.xlsx' })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  const positioningTrigger = document.querySelector<HTMLButtonElement>('button[aria-hidden="true"]')
  expect(positioningTrigger).not.toBeNull()
  positioningTrigger?.focus()
  expect(trigger).toHaveFocus()

  // A late popup teardown must also preserve focus in a newly opened dialog.
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  const input = document.createElement('input')
  dialog.append(input)
  document.body.append(dialog)
  input.focus()
  positioningTrigger?.focus()
  expect(input).toHaveFocus()
  dialog.remove()
})

it('returns delayed focus to the browser filter when the menu row has disappeared', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderBrowser([row('a.xlsx')])
  await user.click(screen.getByRole('button', { name: 'Actions for a.xlsx' }))
  const filter = screen.getByRole('textbox', { name: 'Filter this folder' })
  fireEvent.change(filter, { target: { value: 'missing' } })
  expect(screen.queryByRole('row', { name: 'a.xlsx' })).not.toBeInTheDocument()
  const positioningTrigger = document.querySelector<HTMLButtonElement>('button[aria-hidden="true"]')
  positioningTrigger?.focus()
  expect(filter).toHaveFocus()
})

it('keeps badges beside the name', () => {
  installMockApi()
  renderBrowser([{ ...row('Season', 'folder'), badge: <span>Active</span> }])
  expect(screen.getByRole('row', { name: 'Season' })).toHaveTextContent('Active')
})

it('filters and clears without changing the supplied scan order', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderBrowser([row('b.xlsx'), row('a.xlsx')])
  await user.type(screen.getByRole('textbox', { name: 'Filter this folder' }), 'missing')
  expect(screen.getByText('No matching items')).toBeInTheDocument()
  await user.click(screen.getAllByRole('button', { name: 'Clear filter' })[0])
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((item) => item.getAttribute('aria-label'))
  ).toEqual(['b.xlsx', 'a.xlsx'])
})

it('imports drops and maintains the highlight over child rows', () => {
  installMockApi({ pathForFile: vi.fn((file: File) => `/drop/${file.name}`) })
  const onDropFiles = vi.fn()
  renderBrowser([row('a.xlsx')], { onDropFiles })
  const zone = screen.getByRole('region', { name: 'Documents files' })
  const child = screen.getByRole('row', { name: 'a.xlsx' })
  fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } })
  fireEvent.dragEnter(child, { dataTransfer: { types: ['Files'] } })
  fireEvent.dragLeave(child)
  expect(screen.getByText('Add files to Documents')).toBeInTheDocument()
  fireEvent.dragLeave(zone)
  expect(screen.queryByText('Add files to Documents')).not.toBeInTheDocument()
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['one'], 'one.pdf')] } })
  expect(onDropFiles).toHaveBeenCalledExactlyOnceWith(['/drop/one.pdf'])
})

it('rejects drops in a read-only pane', () => {
  installMockApi()
  const onDropFiles = vi.fn()
  renderBrowser([], { readOnly: true, onDropFiles })
  const zone = screen.getByRole('region', { name: 'Documents files' })
  fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } })
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['one'], 'one.pdf')] } })
  expect(onDropFiles).not.toHaveBeenCalled()
  expect(screen.queryByText('Add files to Documents')).not.toBeInTheDocument()
})

it('keeps folder errors transparent and offers retry and back actions', async () => {
  installMockApi()
  const retry = vi.fn()
  const back = vi.fn()
  const user = userEvent.setup()
  renderBrowser([], {
    listing: { entries: null, error: 'Missing folder', reload: retry },
    onRefresh: retry,
    onBack: { label: 'Back', action: back }
  })
  expect(screen.getByText('Missing folder')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await user.click(screen.getByRole('button', { name: 'Back' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(back).toHaveBeenCalledOnce()
})
