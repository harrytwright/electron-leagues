import { act, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { DirEntry } from '@shared/tree'
import { makeDirEntry } from '../../tests/fixtures'
import { emitTreeChanged, installMockApi } from '../../tests/mock-api'
import { renderHookWithProviders } from '../../tests/render-helpers'
import { useDirListing } from '../use-dir-listing'

interface Deferred {
  promise: Promise<DirEntry[]>
  resolve: (entries: DirEntry[]) => void
  reject: (err: Error) => void
}

function deferred(): Deferred {
  let resolve!: Deferred['resolve']
  let reject!: Deferred['reject']
  const promise = new Promise<DirEntry[]>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

it('never shows a slow earlier folder over the folder now being viewed', async () => {
  const slow = deferred()
  const fast = deferred()
  const listDir = vi.fn((dir: string) => (dir === '/a' ? slow.promise : fast.promise))
  installMockApi({ listDir })
  const { result, rerender } = renderHookWithProviders(({ dir }) => useDirListing(dir), {
    initialProps: { dir: '/a' }
  })
  expect(result.current.entries).toBeNull()

  rerender({ dir: '/b' })
  await act(async () => fast.resolve([makeDirEntry({ name: 'b.txt' })]))
  await waitFor(() => expect(result.current.entries?.map((e) => e.name)).toEqual(['b.txt']))

  await act(async () => slow.resolve([makeDirEntry({ name: 'a.txt' })]))
  expect(result.current.entries?.map((e) => e.name)).toEqual(['b.txt'])
})

it('keeps the current rows while the same folder is re-listed, but not across folders', async () => {
  const first = deferred()
  const second = deferred()
  const third = deferred()
  const listDir = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise)
  installMockApi({ listDir })
  const { result, rerender } = renderHookWithProviders(({ dir }) => useDirListing(dir), {
    initialProps: { dir: '/a' }
  })

  await act(async () => first.resolve([makeDirEntry({ name: 'old.txt' })]))
  await waitFor(() => expect(result.current.entries?.map((e) => e.name)).toEqual(['old.txt']))
  act(() => emitTreeChanged())
  expect(result.current.entries?.map((e) => e.name)).toEqual(['old.txt'])
  await act(async () => second.resolve([makeDirEntry({ name: 'new.txt' })]))
  await waitFor(() => expect(result.current.entries?.map((e) => e.name)).toEqual(['new.txt']))

  rerender({ dir: '/b' })
  expect(result.current.entries).toBeNull()
  await act(async () => third.resolve([]))
  await waitFor(() => expect(result.current.entries).toEqual([]))
  expect(listDir).toHaveBeenCalledTimes(3)
})

it('reports a failure for the folder it belongs to and clears it on success', async () => {
  const listDir = vi
    .fn()
    .mockRejectedValueOnce(
      new Error("Error invoking remote method 'dir:list': Error: That folder no longer exists")
    )
    .mockResolvedValue([])
  installMockApi({ listDir })
  const { result } = renderHookWithProviders(() => useDirListing('/a'))

  await waitFor(() => expect(result.current.error).toBe('That folder no longer exists'))

  await act(async () => result.current.reload())
  await waitFor(() => expect(result.current.error).toBeNull())
  await waitFor(() => expect(result.current.entries).toEqual([]))
})

it('lists nothing for no folder', () => {
  const api = installMockApi()
  const { result } = renderHookWithProviders(() => useDirListing(null))

  expect(result.current.entries).toBeNull()
  expect(api.listDir).not.toHaveBeenCalled()
})

it('replaces an unfinished first listing after a watcher event and ignores its late result', async () => {
  const first = deferred()
  const second = deferred()
  const listDir = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  installMockApi({ listDir })
  const { result } = renderHookWithProviders(() => useDirListing('/a'))
  await waitFor(() => expect(listDir).toHaveBeenCalledOnce())

  act(() => emitTreeChanged())
  await waitFor(() => expect(listDir).toHaveBeenCalledTimes(2))

  await act(async () => first.resolve([makeDirEntry({ name: 'obsolete.txt' })]))
  expect(result.current.entries).toBeNull()

  await act(async () => second.resolve([makeDirEntry({ name: 'current.txt' })]))
  await waitFor(() =>
    expect(result.current.entries?.map((entry) => entry.name)).toEqual(['current.txt'])
  )
})

it('shares one listing fetch between two consumers of the same path', async () => {
  const listing = deferred()
  const listDir = vi.fn().mockReturnValue(listing.promise)
  installMockApi({ listDir })
  const { result } = renderHookWithProviders(() => [useDirListing('/a'), useDirListing('/a')])

  expect(listDir).toHaveBeenCalledOnce()
  await act(async () => listing.resolve([makeDirEntry({ name: 'shared.txt' })]))

  await waitFor(() =>
    expect(result.current[0].entries?.map((entry) => entry.name)).toEqual(['shared.txt'])
  )
  await waitFor(() =>
    expect(result.current[1].entries?.map((entry) => entry.name)).toEqual(['shared.txt'])
  )
})

it('keeps previous rows and exposes the error when a watcher refetch fails', async () => {
  const oldRows = [makeDirEntry({ name: 'old.txt' })]
  const failure = new Error("Error invoking remote method 'dir:list': Error: Refetch failed")
  const listDir = vi.fn().mockResolvedValueOnce(oldRows).mockRejectedValueOnce(failure)
  installMockApi({ listDir })
  const { result } = renderHookWithProviders(() => useDirListing('/a'))
  await waitFor(() => expect(result.current.entries).toEqual(oldRows))

  act(() => emitTreeChanged())

  await waitFor(() => expect(result.current.error).toBe('Refetch failed'))
  expect(result.current.entries).toEqual(oldRows)
})

it('does not refresh when reload is called without a folder', () => {
  const api = installMockApi()
  const { result } = renderHookWithProviders(() => useDirListing(null))

  act(() => result.current.reload())

  expect(api.listDir).not.toHaveBeenCalled()
})
