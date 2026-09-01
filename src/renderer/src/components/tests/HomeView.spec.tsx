import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import HomeView from '../HomeView'
import { makeDirEntry, makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function section(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name })
  const element = heading.closest('section')
  if (!element) throw new Error(`No section for ${name}`)
  return element
}

it('lists templates and shared documents from their own folders', async () => {
  installMockApi({
    listDir: vi.fn((dir: string) =>
      Promise.resolve(
        dir === '/root/_templates'
          ? [makeDirEntry({ name: 'Rules.docx', path: '/root/_templates/Rules.docx' })]
          : [makeDirEntry({ name: 'Opening times.docx' })]
      )
    )
  })
  renderWithProviders(<HomeView tree={makeTree()} onSelect={vi.fn()} onChanged={vi.fn()} />)

  expect(screen.getByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
  expect(screen.getByText('/root')).toBeInTheDocument()
  expect(
    await within(section('Templates')).findByRole('button', { name: 'Rules.docx' })
  ).toBeInTheDocument()
  expect(
    await within(section('Shared documents')).findByRole('button', { name: 'Opening times.docx' })
  ).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Other items' })).not.toBeInTheDocument()
})

it('explains missing special folders instead of listing them', () => {
  const api = installMockApi()
  renderWithProviders(
    <HomeView
      tree={makeTree({ hasTemplates: false, hasShared: false })}
      onSelect={vi.fn()}
      onChanged={vi.fn()}
    />
  )

  expect(screen.getByText('No templates folder')).toBeInTheDocument()
  expect(screen.getByText('No shared folder')).toBeInTheDocument()
  expect(api.listDir).not.toHaveBeenCalled()
})

it('shows unrecognised root entries as reveal-only rows', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(
    <HomeView
      tree={makeTree({
        unrecognisedRootEntries: [
          { name: 'Random stuff', kind: 'folder', path: '/root/Random stuff' }
        ]
      })}
      onSelect={vi.fn()}
      onChanged={vi.fn()}
    />
  )

  await user.click(within(section('Other items')).getByRole('button', { name: 'Random stuff' }))

  expect(api.revealFile).toHaveBeenCalledWith('/root/Random stuff')
})

it('creates a league, then selects it only after the rescan', async () => {
  const api = installMockApi({
    createLeague: vi.fn().mockResolvedValue('/root/monday/Summer pairs')
  })
  const onChanged = vi.fn()
  const onSelect = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<HomeView tree={makeTree()} onSelect={onSelect} onChanged={onChanged} />)

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
  // Selection must wait for the rescan so the new league exists in the tree.
  expect(onChanged.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0])
})
