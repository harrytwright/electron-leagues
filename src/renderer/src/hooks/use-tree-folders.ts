import { useCallback, useMemo, useState } from 'react'
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { DirEntry } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { dirListingQuery, dirQueryKey } from '@renderer/queries/dir'
import { useQueryRefresh } from './use-query-refresh'

export interface Branch {
  entries: DirEntry[] | null
  error: string | null
}

export interface TreeFolders {
  branches: Map<string, Branch>
  expanded: Set<string>
  toggle: (path: string) => void
  collapse: () => void
  reload: () => void
  load: (path: string) => Promise<void>
}

function isInside(path: string, directory: string): boolean {
  const prefix = directory.replace(/[\\/]+$/, '')
  return path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}\\`)
}

export function useTreeFolders(currentDir: string): TreeFolders {
  const queryClient = useQueryClient()
  const coordinator = useQueryRefresh()
  const [visited, setVisited] = useState(new Set<string>())
  const [expanded, setExpanded] = useState(new Set<string>())
  const [scope, setScope] = useState(currentDir)

  if (scope !== currentDir) {
    setScope(currentDir)
    setVisited((current) => new Set([...current].filter((path) => isInside(path, currentDir))))
    setExpanded((current) => new Set([...current].filter((path) => isInside(path, currentDir))))
  }

  const visitedPaths = useMemo(() => [...visited].sort(), [visited])
  const combineBranches = useCallback(
    (results: UseQueryResult<DirEntry[], Error>[]): Map<string, Branch> =>
      new Map(
        results.map((result, index) => [
          visitedPaths[index],
          {
            entries: result.data ?? null,
            error: result.error ? ipcErrorMessage(result.error) : null
          }
        ])
      ),
    [visitedPaths]
  )
  // A collapsed branch keeps a disabled observer. With staleTime Infinity and the default gcTime,
  // that subscription is the only thing keeping its rows alive for the loaded-files filter; drop
  // it and the data is collected five minutes after collapse.
  const branches = useQueries({
    queries: visitedPaths.map((path) => ({
      ...dirListingQuery(path),
      enabled: expanded.has(path)
    })),
    combine: combineBranches
  })

  const load = useCallback(
    async (path: string): Promise<void> => {
      setVisited((current) => {
        if (current.has(path)) return current
        return new Set(current).add(path)
      })
      try {
        await queryClient.fetchQuery({ ...dirListingQuery(path), staleTime: 0 })
      } catch {
        // The observer exposes the error and load has never rejected.
      }
    },
    [queryClient]
  )

  const reload = useCallback(() => {
    for (const path of expanded) {
      if (isInside(path, currentDir)) void coordinator.refresh({ queryKey: dirQueryKey(path) })
    }
  }, [coordinator, currentDir, expanded])

  return {
    branches,
    expanded,
    toggle: (path) => {
      const opening = !expanded.has(path)
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      if (opening) void load(path)
    },
    collapse: () => setExpanded(new Set()),
    reload,
    load
  }
}
