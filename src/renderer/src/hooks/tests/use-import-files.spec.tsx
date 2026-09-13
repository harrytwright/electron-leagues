import { act, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { installMockApi } from '../../tests/mock-api'
import { renderHookWithProviders, renderWithProviders } from '../../tests/render-helpers'
import { useImportFiles } from '../use-import-files'
import { useOperationFeedback } from '../use-operation-feedback'

function FeedbackStatus(): React.JSX.Element | null {
  const { activity } = useOperationFeedback()
  return activity ? <span role="status">{activity.label}</span> : null
}

function renderImporter(
  dest: string | undefined,
  onImported?: () => void
): ReturnType<typeof renderHookWithProviders<ReturnType<typeof useImportFiles>, void>> {
  return renderHookWithProviders(() => useImportFiles(dest, onImported), {
    wrapper: ({ children }) => (
      <>
        {children}
        <FeedbackStatus />
      </>
    )
  })
}

it('imports picked files and announces the count', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']) })
  const onImported = vi.fn()
  const { result } = renderImporter('/dest', onImported)

  await act(() => result.current.pickFiles())

  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf', '/tmp/b.pdf'])
  expect(await screen.findByRole('dialog', { name: 'Imported 2 files' })).toBeInTheDocument()
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
  expect(await screen.findByRole('dialog', { name: 'Imported 1 file' })).toBeInTheDocument()

  await act(() => result.current.pickFiles())
  expect(await screen.findByRole('dialog', { name: 'Imported 1 of 2 files' })).toBeInTheDocument()
})

it('stays pending through refresh and reports a successful copy with its refresh failure', async () => {
  let finishRefresh!: () => void
  const onImported = vi.fn(
    () =>
      new Promise<void>(
        (_resolve, reject) => (finishRefresh = () => reject(new Error('Scan failed')))
      )
  )
  installMockApi({ importFiles: vi.fn().mockResolvedValue(['/dest/a.pdf']) })
  const { result } = renderImporter('/dest', onImported)

  let importing!: Promise<void>
  act(() => {
    importing = result.current.importPaths(['/tmp/a.pdf'])
  })
  await waitFor(() => expect(onImported).toHaveBeenCalledOnce())
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
  let finishImport!: (copied: string[]) => void
  installMockApi({
    importFiles: vi.fn(() => new Promise<string[]>((resolve) => (finishImport = resolve)))
  })
  const onImported = vi.fn()
  const { result, rerender } = renderHookWithProviders(
    ({ dest }) => useImportFiles(dest, onImported),
    {
      initialProps: { dest: '/first' },
      wrapper: ({ children }) => (
        <>
          {children}
          <FeedbackStatus />
        </>
      )
    }
  )
  let importing!: Promise<void>
  act(() => {
    importing = result.current.importPaths(['/tmp/a.pdf'])
  })
  rerender({ dest: '/second' })

  await act(async () => {
    finishImport(['/first/a.pdf'])
    await importing
  })
  expect(await screen.findByRole('dialog', { name: 'Imported 1 file' })).toBeInTheDocument()
  expect(onImported).not.toHaveBeenCalled()
})

it('reports a failed import after its hook unmounts without refreshing stale content', async () => {
  let failImport!: () => void
  installMockApi({
    importFiles: vi.fn(
      () =>
        new Promise<string[]>(
          (_resolve, reject) => (failImport = () => reject(new Error('Import failed')))
        )
    )
  })
  const onImported = vi.fn()
  function ImportProbe(): React.JSX.Element {
    const importer = useImportFiles('/dest', onImported)
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
  view.rerender(shell(false))

  await act(async () => failImport())
  expect(await screen.findByRole('dialog', { name: 'Import failed' })).toBeInTheDocument()
  expect(onImported).not.toHaveBeenCalled()
})

it('reports a refresh callback rejection and releases the busy state', async () => {
  installMockApi()
  const { result } = renderHookWithProviders(() =>
    useImportFiles('/dest', () => Promise.reject(new Error('Scan failed')))
  )
  await act(() => result.current.importPaths(['/tmp/a.pdf']))
  expect(
    await screen.findByText('Imported 1 file, but the folder could not be refreshed: Scan failed')
  ).toBeInTheDocument()
  expect(result.current.importing).toBe(false)
})
