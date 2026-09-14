import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { RECENTS_QUERY_KEY, recentsQuery } from '@renderer/queries/recents'
import { useQueryRefresh } from './use-query-refresh'

interface RecentRoots {
  roots: string[] | null
  error: string | null
  reload: () => void
}

export function useRecentRoots(options: { enabled: boolean }): RecentRoots {
  const query = useQuery({ ...recentsQuery, enabled: options.enabled })
  const coordinator = useQueryRefresh()
  const reload = useCallback(() => {
    void coordinator.refresh({ queryKey: RECENTS_QUERY_KEY })
  }, [coordinator])

  return {
    roots: query.data ?? null,
    error: query.error ? ipcErrorMessage(query.error) : null,
    reload
  }
}
