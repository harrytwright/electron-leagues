import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { DirEntry } from '@shared/tree'
import { makeDirEntry } from '../../tests/fixtures'
import { emitTreeChanged, installMockApi } from '../../tests/mock-api'
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
  const { result, rerender } = renderHook(({ dir }) => useDirListing(dir), {
    initialProps: { dir: '/a' }
  })
  expect(result.current.entries).toBeNull()

  rerender({ dir: '/b' })
  await act(async () => fast.resolve([makeDirEntry({ name: 'b.txt' })]))
  expect(result.current.entries?.map((e) => e.name)).toEqual(['b.txt'])

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
  const { result, rerender } = renderHook(({ dir }) => useDirListing(dir), {
    initialProps: { dir: '/a' }
  })

  await act(async () => first.resolve([makeDirEntry({ name: 'old.txt' })]))
  act(() => emitTreeChanged())
  expect(result.current.entries?.map((e) => e.name)).toEqual(['old.txt'])
  await act(async () => second.resolve([makeDirEntry({ name: 'new.txt' })]))
  expect(result.current.entries?.map((e) => e.name)).toEqual(['new.txt'])

  rerender({ dir: '/b' })
  expect(result.current.entries).toBeNull()
  await act(async () => third.resolve([]))
  expect(result.current.entries).toEqual([])
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
  const { result } = renderHook(() => useDirListing('/a'))

  await act(async () => {})
  expect(result.current.error).toBe('That folder no longer exists')

  await act(async () => result.current.reload())
  expect(result.current.error).toBeNull()
  expect(result.current.entries).toEqual([])
})

it('lists nothing for no folder', () => {
  const api = installMockApi()
  const { result } = renderHook(() => useDirListing(null))

  expect(result.current.entries).toBeNull()
  expect(api.listDir).not.toHaveBeenCalled()
})
