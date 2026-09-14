import { act, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { dirQueryKey } from '@renderer/queries/dir'
import { createQueryClient } from '../../lib/query-client'
import { makeDirEntry } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderHookWithProviders } from '../../tests/render-helpers'
import { useDirListing } from '../use-dir-listing'
import { useTreeFolders } from '../use-tree-folders'

const collectionInterval = 5 * 60 * 1000
const scope = '/leagues/monday/Triples/2025-26'
const weeklyResults = `${scope}/Weekly results`
const weekOne = makeDirEntry({
  name: 'Week 1',
  kind: 'folder',
  path: `${weeklyResults}/Week 1`
})

it('keeps a collapsed branch until pruning detaches its observer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    const queryClient = createQueryClient()
    const api = installMockApi({ listDir: vi.fn().mockResolvedValue([weekOne]) })
    const { result, rerender } = renderHookWithProviders(
      ({ currentDir }) => useTreeFolders(currentDir),
      { initialProps: { currentDir: scope }, queryClient }
    )

    act(() => result.current.toggle(weeklyResults))
    await waitFor(() =>
      expect(result.current.branches.get(weeklyResults)?.entries).toEqual([weekOne])
    )
    act(() => result.current.toggle(weeklyResults))
    act(() => vi.advanceTimersByTime(collectionInterval + 1))

    expect(result.current.branches.get(weeklyResults)?.entries).toEqual([weekOne])
    expect(api.listDir).toHaveBeenCalledOnce()

    rerender({ currentDir: '/leagues/tuesday' })
    act(() => vi.advanceTimersByTime(collectionInterval + 1))

    expect(
      queryClient.getQueryCache().find({ queryKey: dirQueryKey(weeklyResults) })
    ).toBeUndefined()
  } finally {
    vi.useRealTimers()
  }
})

it("does not remove another consumer's data when abandoning a branch", async () => {
  let finishListing!: (entries: (typeof weekOne)[]) => void
  const api = installMockApi({
    listDir: vi.fn(() => new Promise<(typeof weekOne)[]>((resolve) => (finishListing = resolve)))
  })
  const { result, rerender } = renderHookWithProviders(
    ({ currentDir }) => ({
      tree: useTreeFolders(currentDir),
      listing: useDirListing(weeklyResults)
    }),
    { initialProps: { currentDir: scope } }
  )

  act(() => result.current.tree.toggle(weeklyResults))
  await act(async () => finishListing([weekOne]))
  await waitFor(() => expect(result.current.listing.entries).toEqual([weekOne]))

  rerender({ currentDir: '/leagues/tuesday' })

  expect(result.current.listing.entries).toEqual([weekOne])
  expect(api.listDir).toHaveBeenCalledOnce()
})

it('reloads only expanded paths inside the current scope', async () => {
  const otherScope = '/leagues/tuesday/Pairs/2025-26'
  const expandedPath = `${scope}/Weekly results`
  const collapsedPath = `${scope}/Admin`
  const outsidePath = `${otherScope}/Weekly results`
  const api = installMockApi()
  const { result } = renderHookWithProviders(() => useTreeFolders(scope))

  act(() => {
    result.current.toggle(expandedPath)
    result.current.toggle(collapsedPath)
    result.current.toggle(outsidePath)
  })
  await waitFor(() => expect(api.listDir).toHaveBeenCalledTimes(3))
  act(() => result.current.toggle(collapsedPath))
  vi.mocked(api.listDir).mockClear()

  act(() => result.current.reload())

  await waitFor(() => expect(api.listDir).toHaveBeenCalledExactlyOnceWith(expandedPath))
})

it('surfaces a load error and clears it after a successful retry', async () => {
  const api = installMockApi({
    listDir: vi
      .fn()
      .mockRejectedValueOnce(new Error('Folder is offline'))
      .mockResolvedValue([weekOne])
  })
  const { result } = renderHookWithProviders(() => useTreeFolders(scope))

  await act(() => result.current.load(weeklyResults))
  await waitFor(() =>
    expect(result.current.branches.get(weeklyResults)?.error).toBe('Folder is offline')
  )
  expect(result.current.branches.get(weeklyResults)?.entries).toBeNull()

  await act(() => result.current.load(weeklyResults))

  await waitFor(() =>
    expect(result.current.branches.get(weeklyResults)?.entries).toEqual([weekOne])
  )
  expect(result.current.branches.get(weeklyResults)?.error).toBeNull()
  expect(api.listDir).toHaveBeenCalledTimes(2)
})

it('fetches once when reopening a collapsed branch and shows fresh rows', async () => {
  const weekTwo = { ...weekOne, name: 'Week 2', path: `${weeklyResults}/Week 2` }
  const api = installMockApi({
    listDir: vi.fn().mockResolvedValueOnce([weekOne]).mockResolvedValue([weekTwo])
  })
  const { result } = renderHookWithProviders(() => useTreeFolders(scope))

  act(() => result.current.toggle(weeklyResults))
  await waitFor(() =>
    expect(result.current.branches.get(weeklyResults)?.entries).toEqual([weekOne])
  )
  act(() => result.current.toggle(weeklyResults))

  act(() => result.current.toggle(weeklyResults))

  await waitFor(() =>
    expect(result.current.branches.get(weeklyResults)?.entries).toEqual([weekTwo])
  )
  expect(api.listDir).toHaveBeenCalledTimes(2)
})
