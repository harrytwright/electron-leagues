import { act, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { LeaguesTree } from '@shared/tree'
import { OperationFeedbackContext } from '@renderer/contexts/OperationFeedbackContext'
import { useOperationFeedback } from '../use-operation-feedback'
import { useWriteOperation } from '../use-write-operation'
import { createQueryClient } from '../../lib/query-client'
import { DIR_QUERY_PREFIX, dirQueryKey } from '../../queries/dir'
import { ROOT_QUERY_KEY } from '../../queries/root'
import { treeQuery, treeQueryKey } from '../../queries/tree'
import { makeDirEntry, makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderHookWithProviders } from '../../tests/render-helpers'

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason: Error) => void
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let reject!: (reason: Error) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function readyClient(): ReturnType<typeof createQueryClient> {
  const client = createQueryClient()
  client.setQueryData(ROOT_QUERY_KEY, '/root')
  client.setQueryData(treeQueryKey('/root'), makeTree())
  return client
}

function ActiveTree(): null {
  useQuery(treeQuery('/root'))
  return null
}

it('rejects a write failure and finishes its activity', async () => {
  installMockApi()
  const pendingWrite = deferred<string>()
  const write = vi.fn(() => pendingWrite.promise)
  const { result } = renderHookWithProviders(() => {
    const operation = useWriteOperation({
      label: (name: string) => `Writing ${name}`,
      write
    })
    return { operation, feedback: useOperationFeedback() }
  })

  let running!: ReturnType<typeof result.current.operation.run>
  act(() => {
    running = result.current.operation.run('scores')
  })
  void running.catch(() => {})
  await waitFor(() => expect(result.current.feedback.activity?.label).toBe('Writing scores'))
  expect(result.current.operation.pending).toBe(true)

  pendingWrite.reject(new Error('Write failed'))
  await act(async () => {
    await expect(running).rejects.toThrow('Write failed')
  })
  expect(result.current.operation.pending).toBe(false)
  expect(result.current.feedback.activity).toBeNull()
})

it('refreshes an observed tree and resolves refreshed after a successful write', async () => {
  const refreshedTree = makeTree({ hasShared: false })
  const api = installMockApi({ scan: vi.fn().mockResolvedValue(refreshedTree) })
  const client = readyClient()
  const write = vi.fn().mockResolvedValue('written')
  const { result } = renderHookWithProviders(
    () =>
      useWriteOperation({
        label: () => 'Writing',
        write
      }),
    {
      queryClient: client,
      wrapper: ({ children }) => (
        <>
          <ActiveTree />
          {children}
        </>
      )
    }
  )

  let outcome!: Awaited<ReturnType<typeof result.current.run>>
  await act(async () => {
    outcome = await result.current.run(undefined)
  })

  expect(outcome).toEqual({ status: 'refreshed', result: 'written' })
  expect(api.scan).toHaveBeenCalledOnce()
  expect(client.getQueryData(treeQueryKey('/root'))).toEqual(refreshedTree)
})

it('returns a formatted refresh failure and stays pending through the refresh', async () => {
  const scan = deferred<LeaguesTree | null>()
  const api = installMockApi({ scan: vi.fn(() => scan.promise) })
  const client = readyClient()
  const { result } = renderHookWithProviders(
    () => {
      const operation = useWriteOperation({
        label: (name: string) => `Writing ${name}`,
        write: vi.fn().mockResolvedValue('written')
      })
      return { operation, feedback: useOperationFeedback() }
    },
    {
      queryClient: client,
      wrapper: ({ children }) => (
        <>
          <ActiveTree />
          {children}
        </>
      )
    }
  )

  let running!: ReturnType<typeof result.current.operation.run>
  act(() => {
    running = result.current.operation.run('scores')
  })
  await waitFor(() => expect(api.scan).toHaveBeenCalledOnce())
  expect(result.current.operation.pending).toBe(true)
  expect(result.current.feedback.activity?.label).toBe('Writing scores')

  scan.reject(new Error("Error invoking remote method 'tree:scan': Error: Scan failed"))
  let outcome!: Awaited<typeof running>
  await act(async () => {
    outcome = await running
  })

  expect(outcome).toEqual({
    status: 'refresh-failed',
    result: 'written',
    refreshError: 'Scan failed'
  })
  expect(result.current.operation.pending).toBe(false)
  expect(result.current.feedback.activity).toBeNull()
})

it('defers refresh after a root change and marks the captured caches stale', async () => {
  const write = deferred<string>()
  const api = installMockApi()
  const client = readyClient()
  const directoryKey = dirQueryKey('/root/_shared')
  client.setQueryData(directoryKey, [makeDirEntry()])
  const { result } = renderHookWithProviders(
    () =>
      useWriteOperation({
        label: () => 'Writing',
        write: () => write.promise
      }),
    { queryClient: client }
  )

  let running!: ReturnType<typeof result.current.run>
  act(() => {
    running = result.current.run(undefined)
  })
  await waitFor(() => expect(result.current.pending).toBe(true))
  act(() => client.setQueryData(ROOT_QUERY_KEY, '/another-root'))
  write.resolve('written')

  let outcome!: Awaited<typeof running>
  await act(async () => {
    outcome = await running
  })
  expect(outcome).toEqual({ status: 'deferred', result: 'written' })
  expect(client.getQueryState(treeQueryKey('/root'))?.isInvalidated).toBe(true)
  expect(client.getQueryState(directoryKey)?.isInvalidated).toBe(true)
  expect(client.getQueryState(DIR_QUERY_PREFIX)).toBeUndefined()
  expect(api.scan).not.toHaveBeenCalled()
})

it('finishes activity once when the hook owner unmounts mid-write', async () => {
  installMockApi()
  const write = deferred<string>()
  const begin = vi.fn(() => 17)
  const finish = vi.fn()
  const { result, unmount } = renderHookWithProviders(
    () =>
      useWriteOperation({
        label: () => 'Writing',
        write: () => write.promise
      }),
    {
      wrapper: ({ children }) => (
        <OperationFeedbackContext value={{ activity: null, begin, finish }}>
          {children}
        </OperationFeedbackContext>
      )
    }
  )

  const running = result.current.run(undefined)
  await waitFor(() => expect(begin).toHaveBeenCalledOnce())
  unmount()
  write.resolve('written')
  await running

  expect(finish).toHaveBeenCalledExactlyOnceWith(17)
})

it('drops location activity on a location change but preserves application activity', async () => {
  installMockApi()
  const locationWrite = deferred<void>()
  const applicationWrite = deferred<void>()
  const providerOptions = { locationKey: '/first' }
  const { result, rerender } = renderHookWithProviders(() => {
    const location = useWriteOperation({
      label: () => 'Location write',
      write: () => locationWrite.promise
    })
    const application = useWriteOperation({
      label: () => 'Application write',
      scope: 'application',
      write: () => applicationWrite.promise
    })
    return { application, feedback: useOperationFeedback(), location }
  }, providerOptions)

  let locationRunning!: ReturnType<typeof result.current.location.run>
  act(() => {
    locationRunning = result.current.location.run(undefined)
  })
  await waitFor(() => expect(result.current.feedback.activity?.label).toBe('Location write'))
  providerOptions.locationKey = '/second'
  rerender()
  expect(result.current.feedback.activity).toBeNull()
  locationWrite.resolve()
  await act(async () => locationRunning)

  let applicationRunning!: ReturnType<typeof result.current.application.run>
  act(() => {
    applicationRunning = result.current.application.run(undefined)
  })
  await waitFor(() => expect(result.current.feedback.activity?.label).toBe('Application write'))
  providerOptions.locationKey = '/third'
  rerender()
  expect(result.current.feedback.activity?.label).toBe('Application write')
  applicationWrite.resolve()
  await act(async () => applicationRunning)
  expect(result.current.feedback.activity).toBeNull()
})
