import { createContext, use } from 'react'
import type { RefreshCoordinator } from '@renderer/lib/query-refresh'

export const QueryRefreshContext = createContext<RefreshCoordinator | null>(null)

export function useQueryRefresh(): RefreshCoordinator {
  const value = use(QueryRefreshContext)
  if (!value) throw new Error('useQueryRefresh must be used inside QueryRefreshProvider')
  return value
}
