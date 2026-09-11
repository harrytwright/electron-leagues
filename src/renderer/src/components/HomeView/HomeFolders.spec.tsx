import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { DirEntry } from '@shared/tree'
import { HomeView } from './index'
import { makeDirEntry, makeTree } from '../../tests/fixtures'
import { emitTreeChanged, installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const SHARED = '/root/_shared'

function listingFor(byDir: Record<string, DirEntry[]>): (dir: string) => Promise<DirEntry[]> {
  return (dir) => {
    const entries = byDir[dir]
    return entries
      ? Promise.resolve(entries)
      : Promise.reject(
          new Error("Error invoking remote method 'dir:list': Error: That folder no longer exists")
        )
  }
}

// Kumo renders a second, CSS-hidden copy of the trail for narrow screens, so
// crumb queries resolve to the first (desktop) match.
function crumbLink(name: string): HTMLElement {
  return screen.getAllByRole('link', { name })[0]
}

function currentCrumb(): HTMLElement | null {
  return document.querySelector('[aria-current="page"]')
}

const tree = {
  [SHARED]: [
    makeDirEntry({ name: 'Forms', kind: 'folder', path: `${SHARED}/Forms` }),
    makeDirEntry({ name: 'Opening times.docx', path: `${SHARED}/Opening times.docx` })
  ],
  [`${SHARED}/Forms`]: [
    makeDirEntry({ name: 'Entry form.pdf', path: `${SHARED}/Forms/Entry form.pdf` })
  ]
}

it('drills into folders and back out through the breadcrumbs', async () => {
  installMockApi({ listDir: vi.fn(listingFor(tree)) })
  const user = userEvent.setup()
  renderWithProviders(
    <HomeView
      tree={makeTree()}
      onSelect={vi.fn()}
      onCurrentDirChange={vi.fn()}
      onChanged={vi.fn()}
      onRefresh={vi.fn()}
    />
  )

  expect(await screen.findByRole('row', { name: /^Opening times.docx/ })).toBeInTheDocument()
  await user.dblClick(screen.getByRole('row', { name: /^Forms/ }))

  expect(await screen.findByRole('row', { name: /^Entry form.pdf/ })).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: /^Opening times.docx/ })).not.toBeInTheDocument()
  expect(currentCrumb()).toHaveTextContent('Forms')

  await user.click(crumbLink('Shared documents'))

  expect(await screen.findByRole('row', { name: /^Opening times.docx/ })).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(currentCrumb()).toHaveTextContent('Shared documents')
})

it('re-lists the current folder when the tree changes on disk', async () => {
  const listDir = vi
    .fn()
    .mockResolvedValueOnce([makeDirEntry({ name: 'Old.docx' })])
    .mockResolvedValue([makeDirEntry({ name: 'New.docx' })])
  installMockApi({ listDir })
  renderWithProviders(
    <HomeView
      tree={makeTree()}
      onSelect={vi.fn()}
      onCurrentDirChange={vi.fn()}
      onChanged={vi.fn()}
      onRefresh={vi.fn()}
    />
  )

  expect(await screen.findByRole('row', { name: /^Old.docx/ })).toBeInTheDocument()
  act(() => emitTreeChanged())

  expect(await screen.findByRole('row', { name: /^New.docx/ })).toBeInTheDocument()
  expect(listDir).toHaveBeenCalledTimes(2)
})

it('offers a way back when the folder being viewed can no longer be read', async () => {
  const listDir = vi.fn(listingFor(tree))
  installMockApi({ listDir })
  const user = userEvent.setup()
  renderWithProviders(
    <HomeView
      tree={makeTree()}
      onSelect={vi.fn()}
      onCurrentDirChange={vi.fn()}
      onChanged={vi.fn()}
      onRefresh={vi.fn()}
    />
  )

  await user.dblClick(await screen.findByRole('row', { name: /^Forms/ }))
  await screen.findByRole('row', { name: /^Entry form.pdf/ })
  // The folder is deleted under us; the next listing fails.
  listDir.mockRejectedValue(
    new Error("Error invoking remote method 'dir:list': Error: That folder no longer exists")
  )
  act(() => emitTreeChanged())

  expect(await screen.findByText('That folder no longer exists')).toBeInTheDocument()
  listDir.mockImplementation(listingFor(tree))
  await user.click(screen.getByRole('button', { name: 'Back to Shared documents' }))

  expect(await screen.findByRole('row', { name: /^Opening times.docx/ })).toBeInTheDocument()
})

it('imports picked files into the folder being viewed', async () => {
  const api = installMockApi({
    listDir: vi.fn(listingFor(tree)),
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf'])
  })
  const onImported = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <HomeView
      tree={makeTree()}
      onSelect={vi.fn()}
      onCurrentDirChange={vi.fn()}
      onChanged={onImported}
      onRefresh={vi.fn()}
    />
  )

  await user.dblClick(await screen.findByRole('row', { name: /^Forms/ }))
  await screen.findByRole('row', { name: /^Entry form.pdf/ })
  await user.click(screen.getByRole('button', { name: /add files…/i }))

  await waitFor(() =>
    expect(api.importFiles).toHaveBeenCalledWith(`${SHARED}/Forms`, ['/tmp/a.pdf'])
  )
  expect(onImported).toHaveBeenCalledOnce()
})
