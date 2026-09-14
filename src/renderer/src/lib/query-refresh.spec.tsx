import { act, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { createQueryClient } from './query-client'
import { createRefreshCoordinator } from './query-refresh'
import { renderHookWithProviders } from '../tests/render-helpers'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

it('cancels an unfinished initial read before refetching and ignores its late result', async () => {
  const first = deferred<string>()
  const second = deferred<string>()
  const queryFn = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())

  const refreshing = createRefreshCoordinator(client).refresh({ queryKey: key })
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))

  await act(async () => first.resolve('obsolete'))
  expect(result.current.data).toBeUndefined()

  await act(async () => second.resolve('replacement'))
  await expect(refreshing).resolves.toBeUndefined()
  await waitFor(() => expect(result.current.data).toBe('replacement'))
})

it('marks inactive matches stale without fetching them', async () => {
  const client = createQueryClient()
  const key = ['dir', '/inactive'] as const
  const queryFn = vi.fn().mockResolvedValue('cached')
  await client.fetchQuery({ queryKey: key, queryFn })

  await createRefreshCoordinator(client).refresh({ queryKey: key })

  expect(queryFn).toHaveBeenCalledOnce()
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
})

it('routine refresh excludes root and refetches an active directory query', async () => {
  const client = createQueryClient()
  const rootKey = ['root'] as const
  const dirKey = ['dir', '/a'] as const
  const rootQuery = vi.fn().mockResolvedValue('/new-root')
  const dirQuery = vi.fn().mockResolvedValue('new-dir')
  client.setQueryData(rootKey, '/root')
  client.setQueryData(dirKey, 'old-dir')
  const { result } = renderHookWithProviders(
    () => [
      useQuery({ queryKey: rootKey, queryFn: rootQuery }),
      useQuery({ queryKey: dirKey, queryFn: dirQuery })
    ],
    { queryClient: client }
  )

  await act(async () => createRefreshCoordinator(client).refresh())

  expect(rootQuery).not.toHaveBeenCalled()
  expect(dirQuery).toHaveBeenCalledOnce()
  expect(result.current[0].data).toBe('/root')
  await waitFor(() => expect(result.current[1].data).toBe('new-dir'))
  expect(client.getQueryState(rootKey)?.isInvalidated).toBe(false)
})

it('a superseded refresh settles only after the newest refresh succeeds', async () => {
  const first = deferred<string>()
  const second = deferred<string>()
  const queryFn = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  client.setQueryData(key, 'cached')
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  const coordinator = createRefreshCoordinator(client)

  const older = coordinator.refresh({ queryKey: key, throwOnError: true })
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())
  const newer = coordinator.refresh({ queryKey: key, throwOnError: true })
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
  let olderSettled = false
  void older.finally(() => {
    olderSettled = true
  })

  await act(async () => first.resolve('obsolete'))
  expect(olderSettled).toBe(false)
  expect(result.current.data).toBe('cached')

  await act(async () => second.resolve('newest'))
  await expect(Promise.all([older, newer])).resolves.toEqual([undefined, undefined])
  await waitFor(() => expect(result.current.data).toBe('newest'))
})

it('a superseded throwing refresh adopts the newest failure', async () => {
  const first = deferred<string>()
  const failure = new Error('newest failed')
  const queryFn = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(failure)
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  client.setQueryData(key, 'cached')
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  const coordinator = createRefreshCoordinator(client)

  const older = coordinator.refresh({ queryKey: key, throwOnError: true })
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())
  const newer = coordinator.refresh({ queryKey: key, throwOnError: true })

  await expect(older).rejects.toBe(failure)
  await expect(newer).rejects.toBe(failure)
  await waitFor(() => expect(result.current.error).toBe(failure))
  expect(result.current.data).toBe('cached')
})

it("suppresses a superseded run's own failure and waits for the newer run", async () => {
  const olderRead = deferred<string>()
  const newerRead = deferred<string>()
  const olderFailure = new Error('older failed')
  const olderQuery = vi.fn().mockReturnValue(olderRead.promise)
  const newerQuery = vi.fn().mockReturnValue(newerRead.promise)
  const client = createQueryClient()
  const olderKey = ['dir', '/older'] as const
  const newerKey = ['dir', '/newer'] as const
  client.setQueryData(olderKey, 'older cache')
  client.setQueryData(newerKey, 'newer cache')
  const { result } = renderHookWithProviders(
    () => [
      useQuery({ queryKey: olderKey, queryFn: olderQuery }),
      useQuery({ queryKey: newerKey, queryFn: newerQuery })
    ],
    { queryClient: client }
  )
  const coordinator = createRefreshCoordinator(client)

  const older = coordinator.refresh({ queryKey: olderKey, throwOnError: true })
  await waitFor(() => expect(olderQuery).toHaveBeenCalledOnce())
  const newer = coordinator.refresh({ queryKey: newerKey, throwOnError: true })
  await waitFor(() => expect(newerQuery).toHaveBeenCalledOnce())
  let olderSettled = false
  void older.finally(() => {
    olderSettled = true
  })

  await act(async () => olderRead.reject(olderFailure))
  expect(olderSettled).toBe(false)
  await waitFor(() => expect(result.current[0].error).toBe(olderFailure))

  await act(async () => newerRead.resolve('newer data'))
  await expect(Promise.all([older, newer])).resolves.toEqual([undefined, undefined])
  await waitFor(() => expect(result.current[1].data).toBe('newer data'))
})

it('a superseded routine refresh resolves while retaining the newest query error', async () => {
  const first = deferred<string>()
  const failure = new Error('newest failed')
  const queryFn = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(failure)
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  client.setQueryData(key, 'cached')
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  const coordinator = createRefreshCoordinator(client)

  const older = coordinator.refresh({ queryKey: key })
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())
  const newer = coordinator.refresh({ queryKey: key })

  await expect(Promise.all([older, newer])).resolves.toEqual([undefined, undefined])
  await waitFor(() => expect(result.current.error).toBe(failure))
  expect(result.current.data).toBe('cached')
})

it('propagates a current refresh failure only when requested', async () => {
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  const firstFailure = new Error('visible only in state')
  const secondFailure = new Error('propagated')
  const queryFn = vi.fn().mockRejectedValueOnce(firstFailure).mockRejectedValueOnce(secondFailure)
  client.setQueryData(key, 'cached')
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  const coordinator = createRefreshCoordinator(client)

  await expect(coordinator.refresh({ queryKey: key })).resolves.toBeUndefined()
  await waitFor(() => expect(result.current.error).toBe(firstFailure))
  expect(result.current.data).toBe('cached')

  await expect(coordinator.refresh({ queryKey: key, throwOnError: true })).rejects.toBe(
    secondFailure
  )
  await waitFor(() => expect(result.current.error).toBe(secondFailure))
  expect(result.current.data).toBe('cached')
})

it('a superseded throwing refresh adopts the newest failure even when the newer caller does not throw', async () => {
  const first = deferred<string>()
  const failure = new Error('silent newest failed')
  const queryFn = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(failure)
  const client = createQueryClient()
  const key = ['dir', '/a'] as const
  client.setQueryData(key, 'cached')
  const { result } = renderHookWithProviders(() => useQuery({ queryKey: key, queryFn }), {
    queryClient: client
  })
  const coordinator = createRefreshCoordinator(client)

  const write = coordinator.refresh({ queryKey: key, throwOnError: true })
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce())
  const watcher = coordinator.refresh({ queryKey: key })

  await expect(watcher).resolves.toBeUndefined()
  await expect(write).rejects.toBe(failure)
  await waitFor(() => expect(result.current.error).toBe(failure))
  expect(result.current.data).toBe('cached')
})
