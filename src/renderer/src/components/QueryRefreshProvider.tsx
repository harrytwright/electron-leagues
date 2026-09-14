import { useEffect, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { QueryRefreshContext } from '@renderer/hooks/use-query-refresh'
import { createRefreshCoordinator } from '@renderer/lib/query-refresh'

export function QueryRefreshProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const client = useQueryClient()
  const coordinator = useMemo(() => createRefreshCoordinator(client), [client])

  useEffect(() => window.api.onTreeChanged(() => void coordinator.refresh()), [coordinator])

  return <QueryRefreshContext value={coordinator}>{children}</QueryRefreshContext>
}
