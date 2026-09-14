import { useCallback } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import type { DirEntry } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useQueryRefresh } from './use-query-refresh'
import { dirQueryKey } from '@renderer/queries/dir'

export interface DirListing {
  /** null while the first listing for this folder is loading. */
  entries: DirEntry[] | null
  error: string | null
  reload: () => void
}

/**
 * Lists `dir` through the shared directory cache, refreshed by the app-level
 * tree watcher. Rows from another folder are never used as placeholders, while
 * a same-folder refresh keeps the cached rows until fresh ones arrive.
 */
export function useDirListing(dir: string | null): DirListing {
  const coordinator = useQueryRefresh()
  const query = useQuery({
    queryKey: dir === null ? (['dir', null] as const) : dirQueryKey(dir),
    queryFn: dir === null ? skipToken : () => window.api.listDir(dir)
  })
  const reload = useCallback(() => {
    if (dir !== null) void coordinator.refresh({ queryKey: dirQueryKey(dir) })
  }, [coordinator, dir])

  return {
    entries: dir === null ? null : (query.data ?? null),
    error: dir !== null && query.error ? ipcErrorMessage(query.error) : null,
    reload
  }
}
