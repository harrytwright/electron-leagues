import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DirectoryTable, type DirectoryRow } from './index'
import { revealLabel } from '../../lib/reveal-label'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function row(name: string, kind: DirectoryRow['kind'] = 'file', mtime?: number): DirectoryRow {
  return { key: name, name, kind, path: `/documents/${name}`, mtime }
}

it('opens files and navigates into folders from the name button', async () => {
  const api = installMockApi()
  const onNavigate = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <DirectoryTable
      aria-label="Documents"
      rows={[row('a.xlsx'), row('sub', 'folder')]}
      onNavigate={onNavigate}
    />
  )

  const fileButton = screen.getByRole('button', { name: 'a.xlsx' })
  fileButton.focus()
  await user.keyboard('{Enter}')
  expect(api.openFile).toHaveBeenCalledWith('/documents/a.xlsx')

  await user.click(screen.getByRole('button', { name: 'sub' }))
  expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ path: '/documents/sub' }))
  expect(api.revealFile).not.toHaveBeenCalled()
})

it('reveals folders when there is nowhere to navigate', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<DirectoryTable aria-label="Documents" rows={[row('sub', 'folder')]} />)

  await user.click(screen.getByRole('button', { name: 'sub' }))

  expect(api.revealFile).toHaveBeenCalledWith('/documents/sub')
})

it('shows modified dates, or a dash for rows without one', () => {
  installMockApi()
  renderWithProviders(
    <DirectoryTable
      aria-label="Documents"
      rows={[row('dated.pdf', 'file', Date.UTC(2026, 0, 15, 12)), row('Archive', 'folder')]}
    />
  )

  expect(screen.getByRole('cell', { name: '15 Jan 2026' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument()
})

it('offers Open and reveal for files, reveal only for folders, plus custom items', async () => {
  const api = installMockApi()
  const onZip = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <DirectoryTable
      aria-label="Documents"
      rows={[
        row('a.xlsx'),
        { ...row('2023-24', 'folder'), menuItems: [{ label: 'Zip…', onSelect: onZip }] }
      ]}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Actions for a.xlsx' }))
  const fileMenu = await screen.findByRole('menu')
  await user.click(within(fileMenu).getByRole('menuitem', { name: 'Open' }))
  expect(api.openFile).toHaveBeenCalledWith('/documents/a.xlsx')

  await user.click(screen.getByRole('button', { name: 'Actions for 2023-24' }))
  const folderMenu = await screen.findByRole('menu')
  expect(within(folderMenu).queryByRole('menuitem', { name: 'Open' })).not.toBeInTheDocument()
  expect(within(folderMenu).getByRole('menuitem', { name: revealLabel() })).toBeInTheDocument()
  await user.click(within(folderMenu).getByRole('menuitem', { name: 'Zip…' }))
  expect(onZip).toHaveBeenCalledOnce()
})

it('renders badges beside the name', () => {
  installMockApi()
  renderWithProviders(
    <DirectoryTable
      aria-label="Seasons"
      rows={[{ ...row('2025-26', 'folder'), badge: <span>Active</span> }]}
    />
  )

  expect(screen.getByRole('row', { name: /2025-26/ })).toHaveTextContent('Active')
})

it('imports dropped files into the current folder', async () => {
  installMockApi({ pathForFile: vi.fn((file: File) => `/drop/${file.name}`) })
  const onDropFiles = vi.fn()
  renderWithProviders(<DirectoryTable aria-label="Documents" rows={[]} onDropFiles={onDropFiles} />)
  const files = [new File(['one'], 'one.pdf'), new File(['two'], 'two.xlsx')]

  fireEvent.drop(screen.getByText('No documents yet'), { dataTransfer: { files } })

  expect(onDropFiles).toHaveBeenCalledWith(['/drop/one.pdf', '/drop/two.xlsx'])
})

it('keeps the drop highlight while dragging over child rows', () => {
  installMockApi()
  const view = renderWithProviders(
    <DirectoryTable aria-label="Documents" rows={[row('a.xlsx')]} onDropFiles={vi.fn()} />
  )
  // SAFETY: the component's root is always rendered with the .ring class.
  const zone = view.container.querySelector('.ring') as HTMLElement
  const childButton = screen.getByRole('button', { name: 'a.xlsx' })

  fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } })
  expect(zone).toHaveAttribute('data-dragging')

  // Crossing into a child fires enter+leave pairs; the highlight must hold.
  fireEvent.dragEnter(childButton, { dataTransfer: { types: ['Files'] } })
  fireEvent.dragLeave(childButton)
  expect(zone).toHaveAttribute('data-dragging')

  fireEvent.dragLeave(zone)
  expect(zone).not.toHaveAttribute('data-dragging')
})

it('ignores drags when dropping is not enabled', () => {
  installMockApi()
  const view = renderWithProviders(<DirectoryTable aria-label="Documents" rows={[row('a.xlsx')]} />)
  // SAFETY: the component's root is always rendered with the .ring class.
  const zone = view.container.querySelector('.ring') as HTMLElement

  fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } })

  expect(zone).not.toHaveAttribute('data-dragging')
})

it('renders custom and default empty states', () => {
  installMockApi()
  const view = renderWithProviders(
    <DirectoryTable aria-label="Documents" rows={[]} emptyTitle="Nothing shared yet" />
  )
  expect(screen.getByText('Nothing shared yet')).toBeInTheDocument()

  view.rerender(<DirectoryTable aria-label="Documents" rows={[]} />)
  expect(screen.getByText('No documents yet')).toBeInTheDocument()
})
