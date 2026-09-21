import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { renderHookWithProviders } from '@renderer/tests/render-helpers'
import { emitTreeChanged, installMockApi, treeChangedListenerCount } from '@renderer/tests/mock-api'

it('keeps one watcher subscription in Strict Mode and removes it on unmount', async () => {
  const listDir = vi.fn().mockResolvedValue([])
  installMockApi({ listDir })
  const { unmount } = renderHookWithProviders(() => useDirListing('/a'), {
    reactStrictMode: true
  })
  await waitFor(() => expect(listDir).toHaveBeenCalledOnce())
  expect(treeChangedListenerCount()).toBe(1)

  act(() => emitTreeChanged())
  await waitFor(() => expect(listDir).toHaveBeenCalledTimes(2))

  unmount()
  expect(treeChangedListenerCount()).toBe(0)
})

it('requires QueryRefreshProvider', () => {
  expect(() => renderHook(() => useQueryRefresh())).toThrow(
    'useQueryRefresh must be used inside QueryRefreshProvider'
  )
})
