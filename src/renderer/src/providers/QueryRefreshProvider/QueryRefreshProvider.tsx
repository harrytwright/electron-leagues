import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QueryRefreshContext } from '@renderer/contexts/QueryRefreshContext'
import { createRefreshCoordinator } from '@renderer/lib/query-refresh'
import type { Props } from './interface'

export function QueryRefreshProvider({ children }: Props): React.JSX.Element {
  const client = useQueryClient()
  const coordinator = useMemo(() => createRefreshCoordinator(client), [client])

  useEffect(() => window.api.onTreeChanged(() => void coordinator.refresh()), [coordinator])

  return <QueryRefreshContext value={coordinator}>{children}</QueryRefreshContext>
}
