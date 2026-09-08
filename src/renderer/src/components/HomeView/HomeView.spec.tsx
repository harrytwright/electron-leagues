import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { HomeView } from './index'
import { makeDirEntry, makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function renderHome(
  tree = makeTree(),
  onCurrentDirChange = vi.fn(),
  onChanged = vi.fn(),
  onSelect = vi.fn()
): void {
  renderWithProviders(
    <HomeView
      tree={tree}
      onSelect={onSelect}
      onChanged={onChanged}
      onCurrentDirChange={onCurrentDirChange}
    />
  )
}

it('starts on one full-height Shared documents browser and lazily opens Templates', async () => {
  const api = installMockApi({
    listDir: vi.fn((dir: string) =>
      Promise.resolve(
        dir === '/root/_templates'
          ? [makeDirEntry({ name: 'Rules.docx', path: '/root/_templates/Rules.docx' })]
          : [makeDirEntry({ name: 'Opening times.docx' })]
      )
    )
  })
  const onCurrentDirChange = vi.fn()
  const user = userEvent.setup()
  renderHome(makeTree(), onCurrentDirChange)

  expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  expect(screen.queryByText('/root')).not.toBeInTheDocument()
  expect(await screen.findByRole('treegrid', { name: 'Shared documents' })).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /^Opening times.docx/ })).toBeInTheDocument()
  expect(api.listDir).toHaveBeenCalledExactlyOnceWith('/root/_shared')
  expect(onCurrentDirChange).toHaveBeenLastCalledWith('/root/_shared')

  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  expect(await screen.findByRole('row', { name: /^Rules.docx/ })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /^Opening times.docx/ })).not.toBeInTheDocument()
  expect(api.listDir).toHaveBeenLastCalledWith('/root/_templates')
  expect(onCurrentDirChange).toHaveBeenLastCalledWith('/root/_templates')
})

it('keeps genuine reserved-folder repair failures transparent and recoverable', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderHome(makeTree({ hasTemplates: false, hasShared: false }))

  expect(screen.getByText('No shared documents folder')).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  expect(screen.getByText('No templates folder')).toBeInTheDocument()
  expect(api.listDir).not.toHaveBeenCalled()
})

it('focuses the first child row after opening a Home folder with Enter', async () => {
  const folder = makeDirEntry({ name: 'Admin', kind: 'folder', path: '/root/_shared/Admin' })
  installMockApi({
    listDir: vi.fn((dir: string) =>
      Promise.resolve(
        dir === '/root/_shared'
          ? [folder]
          : [makeDirEntry({ name: 'Contacts.docx', path: `${folder.path}/Contacts.docx` })]
      )
    )
  })
  const user = userEvent.setup()
  renderHome()

  await user.click(await screen.findByRole('row', { name: /^Admin/ }))
  await user.keyboard('{Enter}')

  const child = await screen.findByRole('row', { name: /^Contacts.docx/ })
  expect(document.activeElement).toBe(child)
})

it('only offers Other items when needed, opening files and revealing folders', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderHome(
    makeTree({
      unrecognisedRootEntries: [
        { name: 'Random stuff', kind: 'folder', path: '/root/Random stuff' },
        { name: 'notes.txt', kind: 'file', path: '/root/notes.txt' }
      ]
    })
  )

  await user.click(screen.getByRole('tab', { name: 'Other items' }))
  await user.dblClick(screen.getByRole('row', { name: /^Random stuff/ }))
  await user.dblClick(screen.getByRole('row', { name: /^notes.txt/ }))

  expect(api.revealFile).toHaveBeenCalledWith('/root/Random stuff')
  expect(api.openFile).toHaveBeenCalledWith('/root/notes.txt')
})

it('resets navigation, filter, and selection when tabs switch', async () => {
  const folder = makeDirEntry({ name: 'Admin', kind: 'folder', path: '/root/_shared/Admin' })
  const api = installMockApi({
    listDir: vi.fn((dir: string) =>
      Promise.resolve(
        dir === '/root/_shared'
          ? [folder]
          : dir === folder.path
            ? [makeDirEntry({ name: 'Contacts.docx', path: `${folder.path}/Contacts.docx` })]
            : []
      )
    )
  })
  const onCurrentDirChange = vi.fn()
  const user = userEvent.setup()
  renderHome(makeTree(), onCurrentDirChange)

  await screen.findByRole('row', { name: /^Admin/ })
  await user.type(screen.getByRole('textbox', { name: 'Filter loaded files' }), 'admin')
  await user.dblClick(await screen.findByRole('row', { name: /^Admin/ }))
  expect(await screen.findByRole('row', { name: /^Contacts.docx/ })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Filter loaded files' })).toHaveValue('')
  await user.type(screen.getByRole('textbox', { name: 'Filter loaded files' }), 'contacts')
  expect(onCurrentDirChange).toHaveBeenLastCalledWith(folder.path)

  await user.click(screen.getByRole('tab', { name: 'Templates' }))
  await user.click(screen.getByRole('tab', { name: 'Shared documents' }))

  expect(await screen.findByRole('row', { name: /^Admin/ })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Filter loaded files' })).toHaveValue('')
  expect(screen.getByRole('row', { name: /^Admin/ })).toHaveAttribute('aria-selected', 'false')
  expect(onCurrentDirChange).toHaveBeenLastCalledWith('/root/_shared')
  expect(api.listDir).toHaveBeenLastCalledWith('/root/_shared')
})

it('imports into the currently navigated Home directory', async () => {
  const folder = makeDirEntry({ name: 'Admin', kind: 'folder', path: '/root/_shared/Admin' })
  const api = installMockApi({
    listDir: vi.fn((dir: string) => Promise.resolve(dir === '/root/_shared' ? [folder] : [])),
    pickFiles: vi.fn().mockResolvedValue(['/tmp/contact.pdf'])
  })
  const user = userEvent.setup()
  renderHome()

  await user.dblClick(await screen.findByRole('row', { name: /^Admin/ }))
  await screen.findByText('This folder is empty')
  await user.click(screen.getByRole('button', { name: 'Add files…' }))

  await waitFor(() =>
    expect(api.importFiles).toHaveBeenCalledWith('/root/_shared/Admin', ['/tmp/contact.pdf'])
  )
})

it('creates a league, then selects it only after the rescan', async () => {
  const api = installMockApi({
    createLeague: vi.fn().mockResolvedValue('/root/monday/Summer pairs')
  })
  const onChanged = vi.fn()
  const onSelect = vi.fn()
  const user = userEvent.setup()
  renderHome(makeTree(), vi.fn(), onChanged, onSelect)

  await user.click(screen.getByRole('button', { name: 'New league…' }))
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
  expect(onChanged.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0])
})
