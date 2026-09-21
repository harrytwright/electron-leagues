import { use } from 'react'
import {
  QueryRefreshContext,
  type RefreshCoordinator
} from '@renderer/contexts/QueryRefreshContext'

export function useQueryRefresh(): RefreshCoordinator {
  const value = use(QueryRefreshContext)
  if (!value) throw new Error('useQueryRefresh must be used inside QueryRefreshProvider')
  return value
}
