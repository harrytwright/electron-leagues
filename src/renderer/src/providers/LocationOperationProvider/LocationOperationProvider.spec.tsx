import { act, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import { createQueryClient } from '@renderer/lib/query-client'
import { rootQuery, ROOT_QUERY_KEY } from '@renderer/queries/root'
import { treeQuery, treeQueryKey } from '@renderer/queries/tree'
import { dirQueryKey } from '@renderer/queries/dir'
import { RECENTS_QUERY_KEY } from '@renderer/queries/recents'
import { makeTree } from '@renderer/tests/fixtures'
import { installMockApi } from '@renderer/tests/mock-api'
import { renderHookWithProviders } from '@renderer/tests/render-helpers'

it('awaits cancellation before IPC, then publishes, invalidates and scans in order', async () => {
  const client = createQueryClient()
  client.setQueryData(ROOT_QUERY_KEY, '/a')
  client.setQueryData(treeQueryKey('/b'), makeTree({ root: '/b' }))
  client.setQueryData(dirQueryKey('/b/_shared'), [])
  const events: string[] = []
  const api = installMockApi({
    setRoot: vi.fn(async () => {
      events.push('ipc')
      expect(client.getQueryState(treeQueryKey('/a'))?.fetchStatus).toBe('idle')
      expect(client.getQueryState(dirQueryKey('/a/_shared'))?.fetchStatus).toBe('idle')
      return '/b'
    }),
    scan: vi.fn(async () => {
      events.push('scan')
      return makeTree({ root: '/b' })
    })
  })
  void client
    .fetchQuery({ queryKey: treeQueryKey('/a'), queryFn: () => new Promise(() => {}) })
    .catch(() => {})
  void client
    .fetchQuery({ queryKey: dirQueryKey('/a/_shared'), queryFn: () => new Promise(() => {}) })
    .catch(() => {})
  const cancel = vi.spyOn(client, 'cancelQueries')
  const publish = vi.spyOn(client, 'setQueryData')
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const stop = client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return
    if (event.query.queryKey[0] === 'root') events.push('publish')
    if (event.action.type === 'invalidate') events.push(`invalidate:${event.query.queryKey[0]}`)
  })
  client.setQueryData(RECENTS_QUERY_KEY, ['/a', '/b'])
  const { result } = renderHookWithProviders(useLocationOperation, { queryClient: client })
  await act(async () => result.current.switchTo('/b'))
  expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(api.setRoot).mock.invocationCallOrder[0]
  )
  expect(publish).toHaveBeenCalledWith(ROOT_QUERY_KEY, '/b')
  expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
    { queryKey: ['dir'], refetchType: 'none' },
    { queryKey: ['tree'], refetchType: 'none' },
    { queryKey: RECENTS_QUERY_KEY }
  ])
  expect(events).toEqual([
    'ipc',
    'publish',
    'invalidate:dir',
    'invalidate:dir',
    'invalidate:tree',
    'invalidate:tree',
    'invalidate:recents',
    'scan'
  ])
  expect(await screen.findByText('Opened location')).toBeInTheDocument()
  stop()
})

it('does not toast when the location tree fetch is cancelled', async () => {
  const client = createQueryClient()
  installMockApi({ scan: vi.fn(() => new Promise<never>(() => {})) })
  const { result } = renderHookWithProviders(useLocationOperation, { queryClient: client })
  let operation!: Promise<void>
  act(() => {
    operation = result.current.switchTo('/b')
  })
  await waitFor(() => expect(window.api.scan).toHaveBeenCalledOnce())
  await act(async () => {
    await client.cancelQueries({ queryKey: treeQueryKey('/b') })
    await operation
  })
  expect(result.current.busy).toBe(false)
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
  expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
})

it('reconciles an IPC rejection before reporting its error', async () => {
  const client = createQueryClient()
  client.setQueryData(ROOT_QUERY_KEY, '/a')
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/main-root'),
    setRoot: vi.fn().mockRejectedValue(new Error('Switch failed'))
  })
  const { result } = renderHookWithProviders(
    () => {
      const root = useQuery(rootQuery)
      const operation = useLocationOperation()
      return { root: root.data, operation }
    },
    { queryClient: client }
  )
  await act(async () => result.current.operation.switchTo('/b'))
  expect(api.getRoot).toHaveBeenCalledOnce()
  await waitFor(() => expect(result.current.root).toBe('/main-root'))
  expect(await screen.findByText('Switch failed')).toBeInTheDocument()
})

it('forgets only after IPC confirms, clearing tree and directory queries', async () => {
  const client = createQueryClient()
  client.setQueryData(ROOT_QUERY_KEY, '/a')
  client.setQueryData(treeQueryKey('/a'), makeTree({ root: '/a' }))
  client.setQueryData(dirQueryKey('/a/_shared'), [])
  client.setQueryData(RECENTS_QUERY_KEY, ['/a'])
  let finishForget!: () => void
  installMockApi({
    forgetRoot: vi.fn(() => new Promise<void>((resolve) => (finishForget = resolve)))
  })
  const { result } = renderHookWithProviders(useLocationOperation, { queryClient: client })
  let operation!: Promise<void>
  act(() => {
    operation = result.current.forget()
  })
  await waitFor(() => expect(window.api.forgetRoot).toHaveBeenCalledOnce())
  expect(client.getQueryData(ROOT_QUERY_KEY)).toBe('/a')
  await act(async () => {
    finishForget()
    await operation
  })
  expect(client.getQueryData(ROOT_QUERY_KEY)).toBeNull()
  expect(client.getQueriesData({ queryKey: ['tree'] })).toEqual([])
  expect(client.getQueriesData({ queryKey: ['dir'] })).toEqual([])
  expect(client.getQueryData(RECENTS_QUERY_KEY)).toEqual(['/a'])
  expect(screen.queryByText('Opened location')).not.toBeInTheDocument()
})

it.each([null, makeTree({ root: '/other' })])(
  'rejects a scan that does not belong to its requested root: %s',
  async (tree) => {
    installMockApi({ scan: vi.fn().mockResolvedValue(tree) })
    const client = createQueryClient()
    await expect(client.fetchQuery(treeQuery('/a'))).rejects.toThrow(
      'The leagues folder changed while it was being read'
    )
    expect(client.getQueryData(treeQueryKey('/a'))).toBeUndefined()
    client.clear()
  }
)

it('ignores switching to the confirmed active root', async () => {
  const client = createQueryClient()
  client.setQueryData(ROOT_QUERY_KEY, '/a')
  const api = installMockApi()
  const { result } = renderHookWithProviders(useLocationOperation, { queryClient: client })
  await act(async () => result.current.switchTo('/a'))
  expect(api.setRoot).not.toHaveBeenCalled()
  expect(api.scan).not.toHaveBeenCalled()
  expect(api.recentRoots).not.toHaveBeenCalled()
  expect(result.current.busy).toBe(false)
})

it('shares the synchronous guard with choose and forget during a pending switch', async () => {
  let finishSwitch!: (path: string) => void
  const api = installMockApi({
    setRoot: vi.fn(() => new Promise<string>((resolve) => (finishSwitch = resolve))),
    scan: vi.fn().mockResolvedValue(makeTree({ root: '/b' }))
  })
  const { result } = renderHookWithProviders(useLocationOperation)
  let operation!: Promise<void>
  act(() => {
    operation = result.current.switchTo('/b')
    void result.current.choose('init')
    void result.current.forget()
  })
  await waitFor(() => expect(api.setRoot).toHaveBeenCalledOnce())
  expect(api.chooseRoot).not.toHaveBeenCalled()
  expect(api.forgetRoot).not.toHaveBeenCalled()
  expect(result.current.busy).toBe(true)
  await act(async () => {
    finishSwitch('/b')
    await operation
  })
  expect(result.current.busy).toBe(false)
})
