import { act, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { installMockApi } from '../../tests/mock-api'
import { renderHookWithProviders, renderWithProviders } from '../../tests/render-helpers'
import { makeTree } from '../../tests/fixtures'
import { createQueryClient } from '../../lib/query-client'
import { ROOT_QUERY_KEY } from '../../queries/root'
import { treeQuery, treeQueryKey } from '../../queries/tree'
import type { ImportFilesResult } from '../../../../shared/ipc'
import { useImportFiles } from '../use-import-files'
import { useOperationFeedback } from '../use-operation-feedback'

function FeedbackStatus(): React.JSX.Element | null {
  const { activity } = useOperationFeedback()
  return activity ? <span role="status">{activity.label}</span> : null
}

function ActiveTree(): null {
  useQuery(treeQuery('/root'))
  return null
}

function renderImporter(
  dest: string | undefined
): ReturnType<typeof renderHookWithProviders<ReturnType<typeof useImportFiles>, void>> {
  return renderHookWithProviders(() => useImportFiles(dest), {
    wrapper: ({ children }) => (
      <>
        {children}
        <FeedbackStatus />
      </>
    )
  })
}

function renderImporterWithActiveTree(
  dest: string | undefined
): ReturnType<typeof renderHookWithProviders<ReturnType<typeof useImportFiles>, void>> {
  const queryClient = createQueryClient()
  queryClient.setQueryData(ROOT_QUERY_KEY, '/root')
  queryClient.setQueryData(treeQueryKey('/root'), makeTree())
  return renderHookWithProviders(() => useImportFiles(dest), {
    queryClient,
    wrapper: ({ children }) => (
      <>
        <ActiveTree />
        {children}
        <FeedbackStatus />
      </>
    )
  })
}

it('imports picked files, refreshes, and announces the count', async () => {
  const api = installMockApi({
    pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']),
    scan: vi.fn().mockResolvedValue(makeTree())
  })
  const { result } = renderImporterWithActiveTree('/dest')

  await act(() => result.current.pickFiles())

  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf', '/tmp/b.pdf'])
  expect(api.scan).toHaveBeenCalledOnce()
  expect(await screen.findByRole('dialog', { name: 'Imported 2 files' })).toBeInTheDocument()
})

it('uses singular copy for one file and reports partial imports honestly', async () => {
  installMockApi({
    pickFiles: vi
      .fn()
      .mockResolvedValueOnce(['/tmp/a.pdf'])
      .mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']),
    importFiles: vi
      .fn()
      .mockResolvedValueOnce({ copied: ['/dest/a.pdf'], failed: [] })
      .mockResolvedValue({
        copied: ['/dest/a.pdf'],
        failed: [{ source: '/tmp/b.pdf', message: 'That folder no longer exists' }]
      })
  })
  const { result } = renderImporter('/dest')

  await act(() => result.current.pickFiles())
  expect(await screen.findByRole('dialog', { name: 'Imported 1 file' })).toBeInTheDocument()

  await act(() => result.current.pickFiles())
  expect(await screen.findByRole('dialog', { name: 'Imported 1 of 2 files' })).toBeInTheDocument()
  expect(
    await screen.findByText('Couldn’t import “b.pdf”: That folder no longer exists')
  ).toBeInTheDocument()
})

it('stays pending through refresh and reports a successful copy with its refresh failure', async () => {
  let finishRefresh!: () => void
  const api = installMockApi({
    importFiles: vi.fn().mockResolvedValue({ copied: ['/dest/a.pdf'], failed: [] }),
    scan: vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof window.api.scan>>>((_resolve, reject) => {
          finishRefresh = () => reject(new Error('Scan failed'))
        })
    )
  })
  const { result } = renderImporterWithActiveTree('/dest')

  let importing!: Promise<void>
  act(() => {
    importing = result.current.importPaths(['/tmp/a.pdf'])
  })
  await waitFor(() => expect(api.scan).toHaveBeenCalledOnce())
  expect(screen.getByRole('status')).toHaveTextContent('Importing 1 file')
  expect(screen.queryByRole('dialog', { name: 'Imported 1 file' })).not.toBeInTheDocument()
  expect(result.current.importing).toBe(true)

  await act(async () => {
    finishRefresh()
    await importing
  })
  expect(
    await screen.findByRole('dialog', {
      name: 'Imported 1 file, but the folder could not be refreshed: Scan failed'
    })
  ).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(result.current.importing).toBe(false)
})

it('does nothing when the picker is cancelled or there is no destination', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue([]) })
  const { result } = renderImporter('/dest')
  await act(() => result.current.pickFiles())

  const noDest = renderImporter(undefined)
  await act(() => noDest.result.current.importPaths(['/tmp/a.pdf']))

  expect(api.importFiles).not.toHaveBeenCalled()
})

it('shows an error toast when the import or the picker fails', async () => {
  const api = installMockApi({
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
  const { result } = renderImporter('/dest')

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('Destination is read-only')).toBeInTheDocument()

  await act(() => result.current.pickFiles())
  expect(await screen.findByText('No window')).toBeInTheDocument()
  expect(api.scan).not.toHaveBeenCalled()
})

it('imports once while an import is already pending', async () => {
  let finish!: (result: ImportFilesResult) => void
  const importFiles = vi.fn(() => new Promise<ImportFilesResult>((resolve) => (finish = resolve)))
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
    finish({ copied: ['/dest/a.pdf'], failed: [] })
    await first
  })
  expect(result.current.importing).toBe(false)
})

it('ignores a picker result after the destination changes in StrictMode', async () => {
  let finishPicker!: (paths: string[]) => void
  const api = installMockApi({
    pickFiles: vi.fn(() => new Promise<string[]>((resolve) => (finishPicker = resolve)))
  })
  const { result, rerender } = renderHookWithProviders(({ dest }) => useImportFiles(dest), {
    initialProps: { dest: '/first' },
    reactStrictMode: true
  })
  let picking!: Promise<void>
  act(() => {
    picking = result.current.pickFiles()
  })
  rerender({ dest: '/second' })
  await act(async () => {
    finishPicker(['/tmp/a.pdf'])
    await picking
  })
  expect(api.importFiles).not.toHaveBeenCalled()
  expect(await screen.findByText('The folder changed. No files were imported.')).toBeInTheDocument()
})

it('reports a completed import after the destination changes without refreshing the stale view', async () => {
  let finishImport!: (result: ImportFilesResult) => void
  const api = installMockApi({
    importFiles: vi.fn(() => new Promise<ImportFilesResult>((resolve) => (finishImport = resolve)))
  })
  const { result, rerender } = renderHookWithProviders(({ dest }) => useImportFiles(dest), {
    initialProps: { dest: '/first' },
    wrapper: ({ children }) => (
      <>
        {children}
        <FeedbackStatus />
      </>
    )
  })
  let importing!: Promise<void>
  act(() => {
    importing = result.current.importPaths(['/tmp/a.pdf'])
  })
  await waitFor(() => expect(api.importFiles).toHaveBeenCalledOnce())
  rerender({ dest: '/second' })

  await act(async () => {
    finishImport({ copied: ['/first/a.pdf'], failed: [] })
    await importing
  })
  expect(await screen.findByRole('dialog', { name: 'Imported 1 file' })).toBeInTheDocument()
})

it('reports a failed import after its hook unmounts without refreshing stale content', async () => {
  let failImport!: () => void
  const api = installMockApi({
    importFiles: vi.fn(
      () =>
        new Promise<ImportFilesResult>(
          (_resolve, reject) => (failImport = () => reject(new Error('Import failed')))
        )
    )
  })
  function ImportProbe(): React.JSX.Element {
    const importer = useImportFiles('/dest')
    return <button onClick={() => void importer.importPaths(['/tmp/a.pdf'])}>Start import</button>
  }
  const shell = (show: boolean): React.JSX.Element => (
    <>
      {show ? <ImportProbe /> : null}
      <FeedbackStatus />
    </>
  )
  const view = renderWithProviders(shell(true))
  screen.getByRole('button', { name: 'Start import' }).click()
  await waitFor(() => expect(api.importFiles).toHaveBeenCalledOnce())
  view.rerender(shell(false))

  await act(async () => failImport())
  expect(await screen.findByRole('dialog', { name: 'Import failed' })).toBeInTheDocument()
})

it('reports a scan rejection and releases the busy state', async () => {
  installMockApi({ scan: vi.fn().mockRejectedValue(new Error('Scan failed')) })
  const { result } = renderImporterWithActiveTree('/dest')
  await act(() => result.current.importPaths(['/tmp/a.pdf']))
  expect(
    await screen.findByText('Imported 1 file, but the folder could not be refreshed: Scan failed')
  ).toBeInTheDocument()
  expect(result.current.importing).toBe(false)
})
