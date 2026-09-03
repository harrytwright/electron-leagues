import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@cloudflare/kumo'
import { expect, it, vi } from 'vitest'
import { installMockApi } from '../../tests/mock-api'
import { useImportFiles } from '../use-import-files'

function renderImporter(
  dest: string | undefined,
  onImported?: () => void
): ReturnType<typeof renderHook<ReturnType<typeof useImportFiles>, void>> {
  return renderHook(() => useImportFiles(dest, onImported), { wrapper: ToastProvider })
}

it('imports picked files and announces the count', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']) })
  const onImported = vi.fn()
  const { result } = renderImporter('/dest', onImported)

  await act(() => result.current.pickFiles())

  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf', '/tmp/b.pdf'])
  expect(await screen.findByText('Imported 2 files')).toBeInTheDocument()
  expect(onImported).toHaveBeenCalledOnce()
})

it('uses singular copy for one file and reports partial imports honestly', async () => {
  installMockApi({
    pickFiles: vi
      .fn()
      .mockResolvedValueOnce(['/tmp/a.pdf'])
      .mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']),
    importFiles: vi.fn().mockResolvedValue(['/dest/a.pdf'])
  })
  const { result } = renderImporter('/dest')

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('Imported 1 file')).toBeInTheDocument()

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('Imported 1 of 2 files')).toBeInTheDocument()
})

it('does nothing when the picker is cancelled or there is no destination', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue([]) })
  const onImported = vi.fn()
  const { result } = renderImporter('/dest', onImported)
  await act(() => result.current.pickFiles())

  const noDest = renderImporter(undefined, onImported)
  await act(() => noDest.result.current.importPaths(['/tmp/a.pdf']))

  expect(api.importFiles).not.toHaveBeenCalled()
  expect(onImported).not.toHaveBeenCalled()
})

it('shows an error toast when the import or the picker fails', async () => {
  installMockApi({
    pickFiles: vi
      .fn()
      .mockResolvedValueOnce(['/tmp/a.pdf'])
      .mockRejectedValue(new Error("Error invoking remote method 'files:pick': Error: No window")),
    importFiles: vi
      .fn()
      .mockRejectedValue(
        new Error("Error invoking remote method 'file:import': Error: Destination is read-only")
      )
  })
  const onImported = vi.fn()
  const { result } = renderImporter('/dest', onImported)

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('Destination is read-only')).toBeInTheDocument()

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('No window')).toBeInTheDocument()
  expect(onImported).not.toHaveBeenCalled()
})

it('imports once while an import is already pending', async () => {
  let finish!: (copied: string[]) => void
  const importFiles = vi.fn(() => new Promise<string[]>((resolve) => (finish = resolve)))
  installMockApi({ importFiles })
  const { result } = renderImporter('/dest')

  let first: Promise<void>
  act(() => {
    first = result.current.importPaths(['/tmp/a.pdf'])
  })
  await waitFor(() => expect(result.current.importing).toBe(true))
  await act(() => result.current.importPaths(['/tmp/b.pdf']))

  expect(importFiles).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish(['/dest/a.pdf'])
    await first
  })
  expect(result.current.importing).toBe(false)
  expect(await screen.findByText('Imported 1 file')).toBeInTheDocument()
})
