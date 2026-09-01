import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { FileEntry } from '@shared/tree'
import FileList from '../FileList'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

function fileEntry(name: string, kind: FileEntry['kind'] = 'file'): FileEntry {
  return { name, kind, path: `/documents/${name}` }
}

it('opens files and reveals folders from a real button via keyboard', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[fileEntry('a.xlsx'), fileEntry('sub', 'folder')]} />)

  const fileButton = screen.getByRole('button', { name: 'a.xlsx' })
  fileButton.focus()
  await user.keyboard('{Enter}')

  expect(api.openFile).toHaveBeenCalledWith('/documents/a.xlsx')

  await user.click(screen.getByRole('button', { name: 'sub' }))

  expect(api.revealFile).toHaveBeenCalledWith('/documents/sub')
})

it('imports via the add-files button and announces the result', async () => {
  const api = installMockApi({
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf'])
  })
  const onImported = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" onImported={onImported} />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))

  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf', '/tmp/b.pdf'])
  expect(await screen.findByText('Imported 2 files')).toBeInTheDocument()
  expect(onImported).toHaveBeenCalledOnce()
})

it('does nothing when the picker is cancelled', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue([]) })
  const onImported = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" onImported={onImported} />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))
  await waitFor(() => expect(api.pickFiles).toHaveBeenCalledOnce())

  expect(api.importFiles).not.toHaveBeenCalled()
  expect(screen.queryByText(/Imported \d+ files?/)).not.toBeInTheDocument()
  expect(onImported).not.toHaveBeenCalled()
})

it('still imports on drop', async () => {
  const api = installMockApi({
    pathForFile: vi.fn((file: File) => `/drop/${file.name}`)
  })
  const onImported = vi.fn()
  renderWithProviders(<FileList files={[]} dropInto="/dest" onImported={onImported} />)
  const files = [new File(['one'], 'one.pdf'), new File(['two'], 'two.xlsx')]

  fireEvent.drop(screen.getByRole('list'), { dataTransfer: { files } })

  await waitFor(() =>
    expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/drop/one.pdf', '/drop/two.xlsx'])
  )
  expect(await screen.findByText('Imported 2 files')).toBeInTheDocument()
  expect(onImported).toHaveBeenCalledOnce()
})

it('shows an error toast and keeps the list intact when import fails', async () => {
  const api = installMockApi({
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf']),
    importFiles: vi
      .fn()
      .mockRejectedValue(
        new Error("Error invoking remote method 'file:import': Error: Destination is read-only")
      )
  })
  const onImported = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(
    <FileList files={[fileEntry('existing.pdf')]} dropInto="/dest" onImported={onImported} />
  )

  await user.click(screen.getByRole('button', { name: /add files…/i }))

  expect(await screen.findByText('Destination is read-only')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'existing.pdf' })).toBeInTheDocument()
  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf'])
  expect(onImported).not.toHaveBeenCalled()
})

it('hides the add-files button when dropInto is unset', () => {
  installMockApi()

  renderWithProviders(<FileList files={[]} />)

  expect(screen.queryByRole('button', { name: /add files…/i })).not.toBeInTheDocument()
})

it('renders custom and default empty labels', () => {
  installMockApi()
  const view = renderWithProviders(<FileList files={[]} emptyLabel="Nothing shared yet" />)

  expect(screen.getByText('Nothing shared yet')).toBeInTheDocument()

  view.rerender(<FileList files={[]} />)

  expect(screen.getByText('No documents yet')).toBeInTheDocument()
})

it('uses singular toast copy for one imported file', async () => {
  installMockApi({ pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf']) })
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))

  expect(await screen.findByText('Imported 1 file')).toBeInTheDocument()
})

it('reports partial imports honestly', async () => {
  installMockApi({
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']),
    importFiles: vi.fn().mockResolvedValue(['/dest/a.pdf'])
  })
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))

  expect(await screen.findByText('Imported 1 of 2 files')).toBeInTheDocument()
})

it('imports once when the add-files button is clicked while an import is pending', async () => {
  let resolve!: (copied: string[]) => void
  const importFiles = vi.fn(
    () => new Promise<string[]>((promiseResolve) => (resolve = promiseResolve))
  )
  installMockApi({
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf']),
    importFiles
  })
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))
  expect(screen.getByRole('button', { name: /importing…/i })).toBeDisabled()
  fireEvent.drop(screen.getByRole('list'), {
    dataTransfer: { files: [new File(['x'], 'x.pdf')] }
  })

  await waitFor(() => expect(importFiles).toHaveBeenCalledTimes(1))
  resolve(['/dest/a.pdf'])
  expect(await screen.findByText('Imported 1 file')).toBeInTheDocument()
})

it('surfaces a failing file picker as an error toast', async () => {
  installMockApi({
    pickFiles: vi
      .fn()
      .mockRejectedValue(new Error("Error invoking remote method 'files:pick': Error: No window"))
  })
  const user = userEvent.setup()
  renderWithProviders(<FileList files={[]} dropInto="/dest" />)

  await user.click(screen.getByRole('button', { name: /add files…/i }))

  expect(await screen.findByText('No window')).toBeInTheDocument()
})

it('keeps the drop highlight while dragging over child rows', () => {
  installMockApi()
  const view = renderWithProviders(<FileList files={[fileEntry('a.xlsx')]} dropInto="/dest" />)
  // SAFETY: the component's root is always rendered with the .ring class.
  const zone = view.container.querySelector('.ring') as HTMLElement
  const childButton = screen.getByRole('button', { name: 'a.xlsx' })

  fireEvent.dragEnter(zone)
  expect(zone).toHaveAttribute('data-dragging')

  // Crossing into a child fires enter+leave pairs; the highlight must hold.
  fireEvent.dragEnter(childButton)
  fireEvent.dragLeave(childButton)
  expect(zone).toHaveAttribute('data-dragging')

  fireEvent.dragLeave(zone)
  expect(zone).not.toHaveAttribute('data-dragging')
})
